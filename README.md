# YTAudio Studio (fedo-dwnloader)

Aplicación de escritorio para descargar audio de YouTube, organizarlo y editarlo inline.

## Características

- **Descarga de YouTube**: Pega URLs y descarga audio en MP3, WAV o FLAC
- **Explorador de archivos**: Navega carpetas reales del sistema, con búsqueda y filtros
- **Waveform visual**: Mini-waveforms en cada archivo, waveform grande en el editor
- **Edición inline**: Trim, fade in/out, ganancia, normalización (LUFS), auto-trim de silencios
- **No destructiva**: Todas las ediciones son en memoria hasta que guardas
- **Multiplataforma**: Windows, Linux, macOS

## Stack

- **Frontend**: Electron + React + TypeScript + Tailwind CSS
- **Audio (renderer)**: Web Audio API
- **Backend**: Python sidecar con yt-dlp + ffmpeg
- **Estado**: Zustand

## Instalación

```bash
# 1. Instalar dependencias de Node
npm install

# 2. Instalar dependencias de Python (en entorno virtual recomendado)
cd sidecar
pip install -r requirements.txt
cd ..

# 3. Asegurar que ffmpeg está en el PATH del sistema
# Windows: descargar de https://ffmpeg.org/download.html y agregar a PATH
# macOS: brew install ffmpeg
# Linux: sudo apt install ffmpeg
```

## Desarrollo

```bash
# Terminal 1: Vite dev server
npm run dev:vite

# Terminal 2: Electron (espera a que Vite esté listo)
npm run dev:electron

# O ambos a la vez:
npm run dev
```

## Construcción

```bash
npm run build
```

Genera instaladores en `dist/`.

## Estructura del proyecto

```
fedo-dwnloader/
├── electron/              # Proceso principal de Electron
│   ├── main.ts           # Entry point, IPC, file watcher, sidecar management
│   └── preload.ts        # Bridge seguro main ↔ renderer
├── src/                   # Renderer (React)
│   ├── components/
│   │   ├── explorer/     # FolderTree, FileList, FileCard, Breadcrumbs
│   │   ├── download/     # UrlInputBar, DownloadQueue
│   │   ├── editor/       # WaveformCanvas, EditorToolbar, PlaybackControls, EditorPanel
│   │   └── shared/       # Toast
│   ├── hooks/            # useApi, useAudioBuffer, useWaveformData
│   ├── state/            # Zustand store
│   ├── types/            # TypeScript interfaces
│   ├── App.tsx
│   └── main.tsx
├── sidecar/               # Python backend
│   ├── main.py           # Loop stdin/stdout, dispatch commands
│   └── requirements.txt
└── package.json
```

## Flujo de trabajo típico

1. **Agregar carpeta raíz** en el sidebar izquierdo
2. **Pegar URLs** de YouTube en la barra superior → Enter
3. **Ver progreso** en la cola de descargas (abajo)
4. **Click en un archivo** → se reproduce, aparece waveform
5. **Editar**: seleccionar rango → botones trim/fade/gain/normalize
6. **Guardar**: sobrescribir o guardar como copia

## Atajos de teclado (en editor)

| Tecla | Acción |
|-------|--------|
| Espacio | Play / Pause |
| Ctrl+Z | Deshacer |
| Ctrl+Shift+Z | Rehacer |
| S | Marcar punto de corte en playhead |
| Ctrl+S | Guardar |
| Delete | Eliminar selección (trim) |
| L | Toggle loop |
| M | Mute / Unmute |

## Configuración

La config se guarda en `electron-store` (JSON local):
- Carpetas raíz
- Carpeta de descarga por defecto
- Formato/calidad por defecto
- Target LUFS para normalización (-14 default)

## Licencia

MIT