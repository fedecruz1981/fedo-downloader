"""
Tests del sidecar de YTAudio Studio.

No tocan la red ni ejecutan ffmpeg real: yt-dlp y ffmpeg-python se monkeypatchean
para poder verificar el parseo, el despacho de mensajes y la construccion de la
cadena de filtros.
"""

import importlib.util
import io
import json
import os
import sys
import types
from pathlib import Path

import pytest

SIDECAR_DIR = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Stubs: main.py importa yt_dlp y ffmpeg al nivel del modulo. Se inyectan stubs
# vacios para que importar el sidecar no requiera las dependencias reales.
# ---------------------------------------------------------------------------


def _stub(name, **attrs):
    mod = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(mod, key, value)
    sys.modules[name] = mod
    return mod


class _YoutubeDL:
    """Doble de yt_dlp.YoutubeDL.

    `extract_info` / `prepare_filename` se configuran por test como atributos de
    clase; en el __init__ se enlazan a closures que los leen en el momento de la
    llamada (asi el test puede cambiar el comportamiento entre invocaciones).
    """

    instances = []
    extract_info = {}
    prepare_filename = 'salida.webm'

    def __init__(self, opts):
        self.opts = opts
        cls = type(self)
        cls.instances.append(self)

        def _extract_info(url, download=True):
            result = cls.extract_info
            if isinstance(result, Exception):
                raise result
            return result

        def _prepare_filename(info):
            result = cls.prepare_filename
            if isinstance(result, Exception):
                raise result
            return result

        self.extract_info = _extract_info
        self.prepare_filename = _prepare_filename

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def sidecar(monkeypatch, tmp_path):
    """Carga main.py como modulo `sidecar` con yt_dlp y ffmpeg stubbeados."""

    class FakeYoutubeDL(_YoutubeDL):
        instances = []
        extract_info = {}
        prepare_filename = 'salida.webm'

    _stub(
        'yt_dlp',
        YoutubeDL=FakeYoutubeDL,
        DownloadError=type('DownloadError', (Exception,), {}),
    )

    ffmpeg_calls = []

    def _record(*args, **kwargs):
        ffmpeg_calls.append(kwargs)
        return types.SimpleNamespace()

    _stub('ffmpeg', probe=lambda path: {}, run=_record)

    spec = importlib.util.spec_from_file_location('sidecar', SIDECAR_DIR / 'main.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    emitted = []
    # Log original conservado para el test que verifica el formato de stdout
    module.REAL_LOG = module.log
    monkeypatch.setattr(module, 'log', lambda msg: emitted.append(msg))

    module.FFMPEG_CALLS = ffmpeg_calls
    module.EMITTED = emitted
    module.YTDL = FakeYoutubeDL
    return module


def _json_lines(captured):
    return [json.loads(line) for line in captured.strip().splitlines() if line.strip()]


# ---------------------------------------------------------------------------
# log / _decode
# ---------------------------------------------------------------------------


def test_log_emite_una_linea_json(sidecar, capsys):
    sidecar.REAL_LOG({'type': 'ready'})
    out = capsys.readouterr().out
    assert out.count('\n') == 1
    assert json.loads(out) == {'type': 'ready'}


@pytest.mark.parametrize(
    'raw,esperado',
    [
        (b'hola', 'hola'),
        ('hola', 'hola'),
        (None, ''),
        (b'caf\xc3\xa9', 'café'),
        (b'ok\xff', 'ok\ufffd'),
    ],
)
def test_decode_tolera_bytes_none_y_utf8_invalido(sidecar, raw, esperado):
    assert sidecar._decode(raw) == esperado


# ---------------------------------------------------------------------------
# progress_hook
# ---------------------------------------------------------------------------


def test_progress_hook_parsea_porcentaje(sidecar):
    sidecar.progress_hook(
        {'status': 'downloading', '_percent_str': ' 42.5% ', '_speed_str': '1.2MiB/s', '_eta_str': '00:03'},
        'job-1',
    )
    msg = sidecar.EMITTED[-1]
    assert msg == {
        'type': 'progress',
        'id': 'job-1',
        'percent': 42.5,
        'speed': '1.2MiB/s',
        'eta': '00:03',
        'status': 'downloading',
    }


def test_progress_hook_porcentaje_invalido_cae_a_cero(sidecar):
    sidecar.progress_hook({'status': 'downloading', '_percent_str': 'N/A'}, 'job-1')
    assert sidecar.EMITTED[-1]['percent'] == 0


def test_progress_hook_ignora_estados_desconocidos(sidecar):
    sidecar.progress_hook({'status': 'error'}, 'job-1')
    assert sidecar.EMITTED == []


def test_progress_hook_finished_marca_100_y_converting(sidecar):
    sidecar.progress_hook({'status': 'finished'}, 'job-1')
    msg = sidecar.EMITTED[-1]
    assert msg['percent'] == 100
    assert msg['status'] == 'converting'


# ---------------------------------------------------------------------------
# run_yt_dlp_download
# ---------------------------------------------------------------------------


def _job(**overrides):
    job = {
        'url': 'https://youtu.be/abc',
        'id': 'job-1',
        'format': 'mp3',
        'quality': '320k',
        'destination': None,
    }
    job.update(overrides)
    if job['destination'] is None:
        job['destination'] = str(SIDECAR_DIR / '_out')
    return job


def test_download_monta_destino_y_emite_done(sidecar, tmp_path):
    dest = tmp_path / 'descargas'
    sidecar.YTDL.extract_info = {'title': 'Canción', 'channel': 'Canal', 'duration': 123.0}
    sidecar.YTDL.prepare_filename = str(dest / 'Canción.webm')

    sidecar.run_yt_dlp_download(_job(destination=str(dest)))

    assert dest.is_dir()
    ydl = sidecar.YTDL.instances[-1]
    assert ydl.opts['format'] == 'bestaudio/best'
    assert ydl.opts['outtmpl'].startswith(str(dest))
    assert ydl.opts['postprocessors'][0]['preferredcodec'] == 'mp3'
    assert ydl.opts['postprocessors'][0]['preferredquality'] == '320'

    done = sidecar.EMITTED[-1]
    assert done['type'] == 'done'
    assert done['path'] == str(dest / 'Canción.mp3')
    assert done['title'] == 'Canción'
    assert done['duration'] == 123.0


@pytest.mark.parametrize('formato,esperado_codec', [('mp3', 'mp3'), ('wav', 'wav'), ('flac', 'flac')])
def test_download_extension_segun_formato(sidecar, tmp_path, formato, esperado_codec):
    dest = tmp_path / formato
    sidecar.YTDL.extract_info = {'title': 'T', 'channel': 'C', 'duration': 1}
    sidecar.YTDL.prepare_filename = str(dest / 'T.webm')

    sidecar.run_yt_dlp_download(_job(destination=str(dest), format=formato))

    assert sidecar.EMITTED[-1]['path'].endswith('.' + esperado_codec)


def test_download_wav_flac_ignora_calidad_mp3(sidecar, tmp_path):
    dest = tmp_path / 'wav'
    sidecar.YTDL.extract_info = {'title': 'T', 'channel': 'C', 'duration': 1}
    sidecar.YTDL.prepare_filename = str(dest / 'T.webm')

    sidecar.run_yt_dlp_download(_job(destination=str(dest), format='wav'))

    pp = sidecar.YTDL.instances[-1].opts['postprocessors'][0]
    assert pp['preferredquality'] is None
    assert sidecar.YTDL.instances[-1].opts['postprocessor_args'] == ['-ar', '44100', '-ac', '2']


def test_download_usa_calidad_por_defecto(sidecar, tmp_path):
    dest = tmp_path / 'default'
    sidecar.YTDL.extract_info = {'title': 'T', 'channel': 'C', 'duration': 1}
    sidecar.YTDL.prepare_filename = str(dest / 'T.webm')

    job = _job(destination=str(dest))
    del job['quality']
    sidecar.run_yt_dlp_download(job)

    assert sidecar.YTDL.instances[-1].opts['postprocessors'][0]['preferredquality'] == '320'


def test_download_error_de_red_se_reporta_como_error(sidecar, tmp_path):
    sidecar.YTDL.extract_info = RuntimeError('Network is unreachable')

    sidecar.run_yt_dlp_download(_job(destination=str(tmp_path / 'err')))

    msg = sidecar.EMITTED[-1]
    assert msg['type'] == 'error'
    assert msg['id'] == 'job-1'
    assert 'Network is unreachable' in msg['message']


def test_download_error_al_preparar_nombre_se_reporta(sidecar, tmp_path):
    sidecar.YTDL.extract_info = {'title': 'T', 'channel': 'C', 'duration': 1}
    sidecar.YTDL.prepare_filename = KeyError('id')

    sidecar.run_yt_dlp_download(_job(destination=str(tmp_path / 'err2')))

    assert sidecar.EMITTED[-1]['type'] == 'error'


# ---------------------------------------------------------------------------
# measure_lufs / measure_peak_db  (regresion: ffmpeg escribe por stderr)
# ---------------------------------------------------------------------------


LOUDNORM_STDERR = b"""
[Parsed_loudnorm_0 @ 0000] 
{
	"input_i" : "-23.45",
	"input_tp" : "-4.32",
	"input_lra" : "6.50",
	"input_thresh" : "-33.68",
	"output_i" : "-14.02"
}
"""


def test_measure_lufs_lee_json_del_stderr(sidecar, monkeypatch):
    captured = {}

    def fake_run(*args, **kwargs):
        captured['called'] = True
        return b'', LOUDNORM_STDERR

    monkeypatch.setattr(sidecar, 'ffmpeg', _StubFfmpeg(fake_run))
    assert sidecar.measure_lufs('cancion.mp3') == pytest.approx(-23.45)
    assert captured['called']


def test_measure_lufs_cae_a_default_si_no_hay_json(sidecar, monkeypatch):
    monkeypatch.setattr(sidecar, 'ffmpeg', _StubFfmpeg(lambda *a, **k: (b'', b'nada util')))
    assert sidecar.measure_lufs('cancion.mp3') == -14


def test_measure_lufs_cae_a_default_si_ffmpeg_falla(sidecar, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError('ffmpeg no encontrado')

    monkeypatch.setattr(sidecar, 'ffmpeg', _StubFfmpeg(boom))
    assert sidecar.measure_lufs('cancion.mp3') == -14


def test_measure_lufs_no_confunde_stdout_con_stderr(sidecar, monkeypatch):
    """El JSON viene por stderr: leer solo stdout debe devolver el default."""
    monkeypatch.setattr(sidecar, 'ffmpeg', _StubFfmpeg(lambda *a, **k: (LOUDNORM_STDERR, b'')))
    assert sidecar.measure_lufs('cancion.mp3') == -14


ASTATS_STDERR = b"""
[Parsed_astats_0 @ 0000] Channel: 1
[Parsed_astats_0 @ 0000] Peak level dB: -3.250000
[Parsed_astats_0 @ 0000] RMS level dB: -18.100000
"""


def test_measure_peak_db_lee_del_stderr(sidecar, monkeypatch):
    monkeypatch.setattr(sidecar, 'ffmpeg', _StubFfmpeg(lambda *a, **k: (b'', ASTATS_STDERR)))
    assert sidecar.measure_peak_db('cancion.mp3') == pytest.approx(-3.25)


def test_measure_peak_db_cae_a_cero_sin_datos(sidecar, monkeypatch):
    monkeypatch.setattr(sidecar, 'ffmpeg', _StubFfmpeg(lambda *a, **k: (b'', b'vacio')))
    assert sidecar.measure_peak_db('cancion.mp3') == 0


def test_measure_peak_db_no_confunde_stdout_con_stderr(sidecar, monkeypatch):
    monkeypatch.setattr(sidecar, 'ffmpeg', _StubFfmpeg(lambda *a, **k: (ASTATS_STDERR, b'')))
    assert sidecar.measure_peak_db('cancion.mp3') == 0


class _StubFfmpeg:
    """Cadena fluent minima (input/filter/output/run) para probar los medidores."""

    def __init__(self, run_impl):
        self._run_impl = run_impl
        self.kwargs = {}

    def input(self, *a, **k):
        return self

    def filter(self, *a, **k):
        return self

    def output(self, *a, **k):
        self.kwargs = k
        return self

    def run(self, **kwargs):
        return self._run_impl(**kwargs)


# ---------------------------------------------------------------------------
# generate_waveform_peaks
# ---------------------------------------------------------------------------


def test_waveform_peaks_reduce_a_num_peaks(sidecar, monkeypatch):
    import struct

    samples = [0.5, -0.25, 0.1, -0.75, 0.3, -0.1, 0.2, -0.2] * 500
    raw = struct.pack(f'<{len(samples)}f', *samples)

    monkeypatch.setattr(sidecar, 'ffmpeg', _StubFfmpeg(lambda **k: (raw, b'')))

    peaks = sidecar.generate_waveform_peaks('cancion.mp3', num_peaks=100)
    assert len(peaks) == 100
    assert all(0.0 <= p <= 1.0 for p in peaks)
    assert max(peaks) == pytest.approx(0.75)


def test_waveform_peaks_devuelve_lista_por_defecto_si_falla(sidecar, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError('ffmpeg fallo')

    monkeypatch.setattr(sidecar, 'ffmpeg', _StubFfmpeg(boom))
    assert sidecar.generate_waveform_peaks('cancion.mp3', num_peaks=50) == [0] * 50


def test_waveform_peaks_sin_muestras_no_revienta(sidecar, monkeypatch):
    monkeypatch.setattr(sidecar, 'ffmpeg', _StubFfmpeg(lambda **k: (b'', b'')))
    assert sidecar.generate_waveform_peaks('cancion.mp3', num_peaks=10) == []


# ---------------------------------------------------------------------------
# analyze_audio
# ---------------------------------------------------------------------------


def test_analyze_emite_analisis_completo(sidecar, monkeypatch):
    monkeypatch.setattr(
        sidecar,
        'ffmpeg',
        _StubProbe({'format': {'duration': '212.5'}, 'streams': [{'sample_rate': '44100'}]}),
    )
    monkeypatch.setattr(sidecar, 'generate_waveform_peaks', lambda p, num_peaks=2000: [0.5, 0.4])
    monkeypatch.setattr(sidecar, 'measure_lufs', lambda p: -16.2)
    monkeypatch.setattr(sidecar, 'measure_peak_db', lambda p: -1.1)

    sidecar.analyze_audio({'id': 'a1', 'fileId': 'f1', 'path': 'x.mp3'})

    msg = sidecar.EMITTED[-1]
    assert msg['type'] == 'analysis'
    assert msg['duration'] == pytest.approx(212.5)
    assert msg['sampleRate'] == 44100
    assert msg['waveformPeaks'] == [0.5, 0.4]
    assert msg['lufs'] == pytest.approx(-16.2)
    assert msg['peakDb'] == pytest.approx(-1.1)
    assert msg['bpm'] is None
    assert 'error' not in msg


def test_analyze_error_devuelve_error_en_la_misma_forma(sidecar, monkeypatch):
    monkeypatch.setattr(sidecar, 'ffmpeg', _StubProbe(RuntimeError('archivo corrupto')))

    sidecar.analyze_audio({'id': 'a1', 'fileId': 'f1', 'path': 'x.mp3'})

    msg = sidecar.EMITTED[-1]
    assert msg['type'] == 'analysis'
    assert 'archivo corrupto' in msg['error']
    assert msg['fileId'] == 'f1'


class _StubProbe:
    """Sustituye al modulo ffmpeg solo para `probe()` (el resto no se usa)."""

    def __init__(self, result):
        self._result = result

    def __call__(self, *a, **k):
        if isinstance(self._result, Exception):
            raise self._result
        return self._result

    def probe(self, path):
        return self(path)


# ---------------------------------------------------------------------------
# render_edit: cadena de filtros
# ---------------------------------------------------------------------------


class _RenderRecorder:
    """Captura el filter_complex con el que se invoco ffmpeg."""

    def __init__(self):
        self.output_kwargs = None

    def install(self, monkeypatch, sidecar):
        recorder = self

        class Chain:
            def __init__(self):
                self.stage = 0

            def input(self, *a, **k):
                return self

            def output(self, *a, **k):
                recorder.output_kwargs = k
                return self

            def overwrite_output(self):
                return self

            def run(self, **kwargs):
                return b'', b''

        monkeypatch.setattr(sidecar, 'ffmpeg', Chain())
        return recorder


def test_render_trim_genera_atrim(sidecar, monkeypatch):
    rec = _RenderRecorder().install(monkeypatch, sidecar)

    sidecar.render_edit(
        {
            'id': 'r1',
            'sourcePath': 'in.wav',
            'outputPath': 'out.wav',
            'operations': [{'type': 'trim', 'startSec': 2.0, 'endSec': 5.0}],
        }
    )

    fc = rec.output_kwargs['filter_complex']
    assert fc == '[0:a]atrim=start=2.0:end=5.0,asetpts=PTS-STARTPTS[a0]'
    assert rec.output_kwargs['map'] == '[a0]'
    assert sidecar.EMITTED[-1]['type'] == 'render_done'


def test_render_cadena_encadenada_usa_labels(sidecar, monkeypatch):
    rec = _RenderRecorder().install(monkeypatch, sidecar)

    sidecar.render_edit(
        {
            'id': 'r1',
            'sourcePath': 'in.wav',
            'outputPath': 'out.wav',
            'operations': [
                {'type': 'trim', 'startSec': 0.0, 'endSec': 4.0},
                {'type': 'gain', 'deltaDb': -3.0},
                {'type': 'normalize', 'targetLufs': -14.0},
            ],
        }
    )

    fc = rec.output_kwargs['filter_complex'].split(';')
    assert len(fc) == 3
    assert fc[0].startswith('[0:a]atrim')
    assert fc[1] == '[a0]volume=-3.0dB[a1]'
    assert fc[2] == '[a1]loudnorm=I=-14.0:TP=-1:LRA=11:print_format=summary[a2]'
    assert rec.output_kwargs['map'] == '[a2]'


def test_render_fades(sidecar, monkeypatch):
    rec = _RenderRecorder().install(monkeypatch, sidecar)

    sidecar.render_edit(
        {
            'id': 'r1',
            'sourcePath': 'in.wav',
            'outputPath': 'out.wav',
            'operations': [
                {'type': 'fadeIn', 'durationSec': 0.5},
                {'type': 'fadeOut', 'durationSec': 1.5},
            ],
        }
    )

    fc = rec.output_kwargs['filter_complex']
    assert 'afade=t=in:st=0:d=0.5[a0]' in fc
    assert 'afade=t=out:st=0:d=1.5[a1]' in fc


@pytest.mark.parametrize(
    'edges,esperado_substrings',
    [
        ('start', ['silenceremove=start_periods=1']),
        ('end', ['areverse,silenceremove=start_periods=1']),
        ('both', ['silenceremove=start_periods=1']),
    ],
)
def test_render_auto_trim_silencio(sidecar, monkeypatch, edges, esperado_substrings):
    rec = _RenderRecorder().install(monkeypatch, sidecar)

    sidecar.render_edit(
        {
            'id': 'r1',
            'sourcePath': 'in.wav',
            'outputPath': 'out.wav',
            'operations': [{'type': 'autoTrimSilence', 'thresholdDb': -50, 'edges': edges}],
        }
    )

    fc = rec.output_kwargs['filter_complex']
    for frag in esperado_substrings:
        assert frag in fc
    assert 'start_threshold=-50dB' in fc
    assert 'start_duration=0.1' in fc


@pytest.mark.parametrize(
    'formato,esperado',
    [('mp3', {'codec:a': 'libmp3lame', 'q:a': '2'}), ('flac', {'codec:a': 'flac'}), ('wav', {})],
)
def test_render_argumentos_de_salida_por_formato(sidecar, monkeypatch, formato, esperado):
    rec = _RenderRecorder().install(monkeypatch, sidecar)

    sidecar.render_edit(
        {
            'id': 'r1',
            'sourcePath': 'in.wav',
            'outputPath': 'out.' + formato,
            'operations': [{'type': 'gain', 'deltaDb': 0.0}],
            'outputFormat': formato,
        }
    )

    for key, value in esperado.items():
        assert rec.output_kwargs[key] == value


def test_render_output_format_por_defecto_es_wav(sidecar, monkeypatch):
    rec = _RenderRecorder().install(monkeypatch, sidecar)

    sidecar.render_edit(
        {
            'id': 'r1',
            'sourcePath': 'in.wav',
            'outputPath': 'out.bin',
            'operations': [{'type': 'gain', 'deltaDb': 0.0}],
        }
    )

    assert 'codec:a' not in rec.output_kwargs


def test_render_operacion_desconocida_se_ignora(sidecar, monkeypatch):
    rec = _RenderRecorder().install(monkeypatch, sidecar)

    sidecar.render_edit(
        {
            'id': 'r1',
            'sourcePath': 'in.wav',
            'outputPath': 'out.wav',
            'operations': [{'type': 'compressor', 'ratio': 4}],
        }
    )

    assert rec.output_kwargs['filter_complex'] == ''
    assert sidecar.EMITTED[-1]['type'] == 'render_done'


def test_render_error_de_ffmpeg_se_reporta(sidecar, monkeypatch):
    class Broken:
        def input(self, *a, **k):
            return self

        def output(self, *a, **k):
            return self

        def overwrite_output(self):
            return self

        def run(self, **kwargs):
            raise RuntimeError('codec desconocido')

    monkeypatch.setattr(sidecar, 'ffmpeg', Broken())

    sidecar.render_edit(
        {
            'id': 'r1',
            'sourcePath': 'in.wav',
            'outputPath': 'out.wav',
            'operations': [{'type': 'gain', 'deltaDb': 3.0}],
        }
    )

    msg = sidecar.EMITTED[-1]
    assert msg['type'] == 'render_error'
    assert 'codec desconocido' in msg['message']


# ---------------------------------------------------------------------------
# main(): despacho de comandos
# ---------------------------------------------------------------------------


def test_main_anuncia_ready_y_despacha(monkeypatch, capsys):
    spec = importlib.util.spec_from_file_location('sidecar_main_loop', SIDECAR_DIR / 'main.py')
    module = importlib.util.module_from_spec(spec)
    _stub('yt_dlp', YoutubeDL=_YoutubeDL)
    _stub('ffmpeg', probe=lambda p: {}, run=lambda *a, **k: (b'', b''))
    spec.loader.exec_module(module)

    lanzados = []
    monkeypatch.setattr(module.threading, 'Thread', lambda target=None, args=(), daemon=None: _FakeThread(lanzados, target, args))
    monkeypatch.setattr(module, 'log', lambda msg: lanzados.append(('log', msg)))

    monkeypatch.setattr(
        module.sys,
        'stdin',
        io.StringIO(
            json.dumps({'cmd': 'download', 'url': 'u', 'id': '1', 'destination': 'd'}) + '\n'
            + json.dumps({'cmd': 'analyze', 'path': 'p', 'id': '2'}) + '\n'
            + json.dumps({'cmd': 'render_edit', 'id': '3'}) + '\n'
            + json.dumps({'cmd': 'cancel', 'id': '1'}) + '\n'
            + '\n'
        ),
    )

    module.main()

    funciones = [nombre for nombre, _ in lanzados if nombre != 'log']
    assert funciones == ['run_yt_dlp_download', 'analyze_audio', 'render_edit']
    assert ('log', {'type': 'ready'}) in lanzados


def test_main_json_invalido_no_mata_el_loop(monkeypatch):
    spec = importlib.util.spec_from_file_location('sidecar_main_bad', SIDECAR_DIR / 'main.py')
    module = importlib.util.module_from_spec(spec)
    _stub('yt_dlp', YoutubeDL=_YoutubeDL)
    _stub('ffmpeg', probe=lambda p: {}, run=lambda *a, **k: (b'', b''))
    spec.loader.exec_module(module)

    lanzados = []
    monkeypatch.setattr(module.threading, 'Thread', lambda target=None, args=(), daemon=None: _FakeThread(lanzados, target, args))
    monkeypatch.setattr(module, 'log', lambda msg: lanzados.append(('log', msg)))
    monkeypatch.setattr(
        module.sys,
        'stdin',
        io.StringIO('esto no es json\n' + json.dumps({'cmd': 'analyze', 'path': 'p', 'id': '9'}) + '\n'),
    )

    module.main()

    logs = [msg for kind, msg in lanzados if kind == 'log']
    assert any(m.get('type') == 'error' and 'Sidecar error' in m.get('message', '') for m in logs)
    assert 'analyze_audio' in [nombre for nombre, _ in lanzados if nombre != 'log']


class _FakeThread:
    def __init__(self, sink, target, args):
        sink.append((getattr(target, '__name__', str(target)), args))

    def start(self):
        pass
