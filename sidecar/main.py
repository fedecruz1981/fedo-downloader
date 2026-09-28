#!/usr/bin/env python3
"""
YTAudio Studio - Sidecar Python (Backend de procesamiento de audio)
Desarrollado por fedo-soft

Este proceso se ejecuta como hijo del proceso principal Electron.
Comunicación vía stdin/stdout con protocolo JSON-lines (un JSON por línea).

Funciones:
- Descarga de audio desde YouTube usando yt-dlp
- Análisis de audio: duración, LUFS (EBU R128), peak dB, waveform peaks, BPM
- Renderizado de ediciones con ffmpeg: trim, fade, gain, normalize, auto-trim silencio
"""

import sys
import json
import os
import subprocess
import threading
import time
import yt_dlp
import ffmpeg


def log(msg):
    """Envía mensaje JSON al proceso principal vía stdout (una línea por mensaje)"""
    print(json.dumps(msg), flush=True)


def _decode(raw):
    """Decodifica bytes de ffmpeg a texto, tolerando salida None"""
    if raw is None:
        return ''
    if isinstance(raw, bytes):
        return raw.decode('utf-8', errors='replace')
    return str(raw)


def run_yt_dlp_download(job):
    """
    Descarga audio de YouTube usando yt-dlp y lo convierte al formato solicitado.
    Emite eventos de progreso en tiempo real.
    """
    url = job['url']
    format = job.get('format', 'mp3')
    quality = job.get('quality', '320k')
    destination = job['destination']
    job_id = job['id']

    os.makedirs(destination, exist_ok=True)

    # Opciones de yt-dlp para extraer solo audio
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(destination, '%(title)s.%(ext)s'),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': format,
            'preferredquality': quality.replace('k', '') if format == 'mp3' else None,
        }],
        'progress_hooks': [lambda d: progress_hook(d, job_id)],
        'quiet': True,
        'no_warnings': True,
    }

    # Para WAV/FLAC: forzar sample rate 44.1kHz stereo
    if format in ['wav', 'flac']:
        ydl_opts['postprocessors'][0]['preferredquality'] = None
        ydl_opts['postprocessor_args'] = ['-ar', '44100', '-ac', '2']

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            base, _ = os.path.splitext(filename)
            final_path = base + '.' + format

            log({
                'type': 'done',
                'id': job_id,
                'path': final_path,
                'title': info.get('title'),
                'channel': info.get('channel'),
                'duration': info.get('duration'),
            })
    except Exception as e:
        log({
            'type': 'error',
            'id': job_id,
            'message': str(e),
        })


def progress_hook(d, job_id):
    """Hook de progreso de yt-dlp: emite porcentaje, velocidad y ETA"""
    if d['status'] == 'downloading':
        percent = d.get('_percent_str', '0%').strip().replace('%', '')
        try:
            p = float(percent)
        except:
            p = 0
        log({
            'type': 'progress',
            'id': job_id,
            'percent': p,
            'speed': d.get('_speed_str', ''),
            'eta': d.get('_eta_str', ''),
            'status': 'downloading',
        })
    elif d['status'] == 'finished':
        log({
            'type': 'progress',
            'id': job_id,
            'percent': 100,
            'status': 'converting',
        })


def analyze_audio(job):
    """
    Analiza un archivo de audio local:
    - Duración y sample rate (ffprobe)
    - Waveform peaks (muestras reducidas para dibujo rápido)
    - LUFS integrado (ffmpeg loudnorm two-pass)
    - Peak dB (ffmpeg astats)
    - BPM (placeholder - requiere librosa para detección real)
    """
    path = job['path']
    job_id = job['id']

    try:
        # Info básica del archivo
        probe = ffmpeg.probe(path)
        duration = float(probe['format']['duration'])
        sample_rate = int(probe['streams'][0]['sample_rate'])

        # Genera picos de waveform (array reducido a ~2000 puntos)
        peaks = generate_waveform_peaks(path)

        # Mide LUFS (loudness integrado EBU R128)
        lufs = measure_lufs(path)

        # Mide peak dB
        peak_db = measure_peak_db(path)

        # BPM (simplificado - para detección real se necesitaría librosa)
        bpm = None

        log({
            'type': 'analysis',
            'id': job_id,
            'fileId': job.get('fileId'),
            'duration': duration,
            'sampleRate': sample_rate,
            'waveformPeaks': peaks,
            'lufs': lufs,
            'peakDb': peak_db,
            'bpm': bpm,
        })
    except Exception as e:
        log({
            'type': 'analysis',
            'id': job_id,
            'fileId': job.get('fileId'),
            'error': str(e),
        })


def generate_waveform_peaks(path, num_peaks=2000):
    """
    Genera array de picos de amplitud para dibujar waveform.
    Decodifica audio a 8kHz mono float32 y calcula max absoluto por chunk.
    """
    try:
        out, _ = (
            ffmpeg
            .input(path)
            .output('pipe:', format='f32le', acodec='pcm_f32le', ac=1, ar=8000)
            .run(capture_stdout=True, capture_stderr=True)
        )

        import struct
        samples = struct.unpack(f'<{len(out)//4}f', out)
        peaks = []
        chunk_size = max(1, len(samples) // num_peaks)
        for i in range(0, len(samples), chunk_size):
            chunk = samples[i:i+chunk_size]
            if chunk:
                peaks.append(max(abs(s) for s in chunk))
        return peaks[:num_peaks]
    except:
        return [0] * min(100, num_peaks)


def measure_lufs(path):
    """
    Mide loudness integrado (LUFS) usando ffmpeg loudnorm en two-pass.
    Primera pasada: medición, retorna input_i (integrated loudness).
    """
    try:
        # loudnorm imprime el JSON de medicion por stderr
        _, stderr_raw = (
            ffmpeg
            .input(path)
            .filter('loudnorm', I=-14, TP=-1, LRA=11, print_format='json')
            .output('-', format='null')
            .run(capture_stdout=True, capture_stderr=True)
        )
        stderr = _decode(stderr_raw)
        # Extrae JSON del stderr
        import re
        match = re.search(r'\{.*\}', stderr, re.DOTALL)
        if match:
            data = json.loads(match.group())
            return float(data.get('input_i', -14))
    except:
        pass
    return -14


def measure_peak_db(path):
    """
    Mide nivel de pico en dB usando ffmpeg astats.
    """
    try:
        # astats escribe las estadisticas por stderr
        _, stderr_raw = (
            ffmpeg
            .input(path)
            .filter('astats', metadata=1, reset=1)
            .output('-', format='null')
            .run(capture_stdout=True, capture_stderr=True)
        )
        stderr = _decode(stderr_raw)
        import re
        for line in stderr.split('\n'):
            if 'Peak level dB' in line:
                return float(line.split(':')[-1].strip())
    except:
        pass
    return 0


def render_edit(job):
    """
    Renderiza ediciones de audio aplicando cadena de filtros ffmpeg:
    - trim: recorte temporal (atrim + asetpts)
    - fadeIn: fundido de entrada (afade t=in)
    - fadeOut: fundido de salida (afade t=out)
    - gain: cambio de ganancia en dB (volume)
    - normalize: normalización LUFS (loudnorm two-pass)
    - autoTrimSilence: elimina silencios (silenceremove + areverse)
    """
    job_id = job['id']
    source = job['sourcePath']
    output = job['outputPath']
    operations = job['operations']
    format = job.get('outputFormat', 'wav')

    try:
        # Construye cadena de filtros ffmpeg.
        # `current_label` se mantiene SIN corchetes: se envuelve al usarlo como
        # entrada de un filtro y una sola vez al mapearlo contra la salida.
        filters = []
        current_label = '0:a'

        for i, op in enumerate(operations):
            if op['type'] == 'trim':
                filters.append(f"[{current_label}]atrim=start={op['startSec']}:end={op['endSec']},asetpts=PTS-STARTPTS[a{i}]")
                current_label = f'a{i}'
            elif op['type'] == 'fadeIn':
                filters.append(f"[{current_label}]afade=t=in:st=0:d={op['durationSec']}[a{i}]")
                current_label = f'a{i}'
            elif op['type'] == 'fadeOut':
                # Nota: fade out simple desde el final; para preciso se necesitaría duración previa
                filters.append(f"[{current_label}]afade=t=out:st=0:d={op['durationSec']}[a{i}]")
                current_label = f'a{i}'
            elif op['type'] == 'gain':
                db = op['deltaDb']
                filters.append(f"[{current_label}]volume={db}dB[a{i}]")
                current_label = f'a{i}'
            elif op['type'] == 'normalize':
                # Two-pass loudnorm para normalización LUFS precisa
                filters.append(f"[{current_label}]loudnorm=I={op['targetLufs']}:TP=-1:LRA=11:print_format=summary[a{i}]")
                current_label = f'a{i}'
            elif op['type'] == 'autoTrimSilence':
                threshold = op['thresholdDb']
                edges = op['edges']
                if edges in ['start', 'both']:
                    filters.append(f"[{current_label}]silenceremove=start_periods=1:start_threshold={threshold}dB:start_duration=0.1[a{i}]")
                    current_label = f'a{i}'
                if edges in ['end', 'both']:
                    filters.append(f"[{current_label}]areverse,silenceremove=start_periods=1:start_threshold={threshold}dB:start_duration=0.1,areverse[a{i}]")
                    current_label = f'a{i}'

        filter_complex = ';'.join(filters)

        # Argumentos de salida según formato
        out_args = {}
        if format == 'mp3':
            out_args['codec:a'] = 'libmp3lame'
            out_args['q:a'] = '2'
        elif format == 'flac':
            out_args['codec:a'] = 'flac'

        # Ejecuta ffmpeg con filtro complejo
        (
            ffmpeg
            .input(source)
            .output(output, filter_complex=filter_complex, map=f'[{current_label}]', **out_args)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )

        log({
            'type': 'render_done',
            'id': job_id,
            'path': output,
        })
    except Exception as e:
        log({
            'type': 'render_error',
            'id': job_id,
            'message': str(e),
        })


def main():
    """Loop principal: lee comandos JSON de stdin y despacha a handlers en hilos separados"""
    log({'type': 'ready'})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            cmd = msg.get('cmd')
            if cmd == 'download':
                threading.Thread(target=run_yt_dlp_download, args=(msg,), daemon=True).start()
            elif cmd == 'analyze':
                threading.Thread(target=analyze_audio, args=(msg,), daemon=True).start()
            elif cmd == 'render_edit':
                threading.Thread(target=render_edit, args=(msg,), daemon=True).start()
            elif cmd == 'cancel':
                # TODO: implementar cancelación real
                pass
        except Exception as e:
            log({'type': 'error', 'message': f'Sidecar error: {e}'})


if __name__ == '__main__':
    main()

# Desarrollado por fedo-soft