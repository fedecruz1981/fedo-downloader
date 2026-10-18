# Licencias de terceros

**Fedo-Downloader / YTAudio Studio** es software propio, distribuido bajo licencia MIT (ver
[`LICENSE`](./LICENSE)). Este documento detalla los componentes de terceros que usa y con qué
licencia se distribuye cada uno, para cumplir sus condiciones de atribución.

> Documento informativo; no es asesoramiento legal. El texto completo de cada licencia está en el
> proyecto enlazado.

## 1. Incluidos en el instalador

### Runtime de Electron

| Componente | Versión | Licencia |
|---|---|---|
| [Electron](https://github.com/electron/electron) | 44.x | MIT |
| Chromium (incluido en Electron) | — | BSD-3-Clause y otras licencias libres |
| Node.js (incluido en Electron) | — | MIT |

El runtime de Electron trae sus propios avisos (`LICENSE` y `LICENSES.chromium.html`). Chromium
exige conservar sus avisos de copyright y licencia al redistribuir, así que no hay que borrarlos
del paquete.

### Dependencias incluidas en la aplicación

| Componente | Versión | Licencia | Uso |
|---|---|---|---|
| [React](https://react.dev) / [React DOM](https://react.dev) | 18.3.1 | MIT | Interfaz |
| [zustand](https://github.com/pmndrs/zustand) | 4.5.x | MIT | Estado global |
| [electron-store](https://github.com/sindresorhus/electron-store) | 8.2.0 | MIT | Configuración local (JSON) |
| [lucide-react](https://lucide.dev) | 0.294.x | ISC | Iconos |
| [clsx](https://github.com/lukeed/clsx) | 2.1.x | MIT | Clases CSS |

### Herramientas de desarrollo (no entran en el instalador)

| Componente | Versión | Licencia |
|---|---|---|
| Vite | 8.x | MIT |
| TypeScript | 5.9 | Apache-2.0 |
| Tailwind CSS | 3.4 | MIT |
| PostCSS / Autoprefixer | 8.x / 10.x | MIT |
| ESLint y plugins (`@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-config-prettier`) | — | MIT |
| electron-builder | 26.x | MIT |
| Playwright (`@playwright/test`) | 1.63 | Apache-2.0 |
| `concurrently`, `cross-env`, `wait-on`, `@vitejs/plugin-react` | — | MIT |
| `@types/node`, `@types/react`, `@types/react-dom` | — | MIT |

## 2. Requeridos en el sistema (no se redistribuyen)

| Componente | Licencia | Notas |
|---|---|---|
| [FFmpeg](https://ffmpeg.org) (`ffmpeg`, `ffprobe`) | LGPL-2.1+ o GPL-2.0+ según cómo esté compilado | **No se empaqueta**: lo instala el usuario y el sidecar lo busca en el `PATH` |
| [Python](https://www.python.org) 3.x | PSF-2.0 | Requerido por el sidecar |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) (pip) | Unlicense (dominio público) | Descarga de audio/video |
| [ffmpeg-python](https://github.com/kkroening/ffmpeg-python) | Apache-2.0 | Envoltorio de FFmpeg |
| [NumPy](https://numpy.org) | BSD-3-Clause | DSP del sidecar |

Estos componentes se instalan con `pip` en la máquina del usuario: **no forman parte del
instalador**. FFmpeg tiene obligaciones de licencia (avisos de copyright y, en las compilaciones
GPL, oferta del código fuente); si algún día se empaqueta un binario de FFmpeg dentro del
instalador, habrá que cumplirlas.

## 3. Cómo regenerar esta lista

```powershell
# Node/npm: versión y licencia de cada dependencia instalada
npm ls --depth=0
npx license-checker --direct

# Python (sidecar)
pip install -r sidecar/requirements.txt
pip-licenses --format=markdown
```

Última verificación: 2026-10-17.
