/**
 * YTAudio Studio - Proceso principal de Electron
 * Desarrollado por fedo-soft
 * 
 * Este archivo maneja:
 * - Ventana principal de la aplicación
 * - Comunicación IPC con el renderer (React)
 * - Proceso hijo Python (sidecar) para yt-dlp y ffmpeg
 * - File watcher para detectar cambios en carpetas
 * - Persistencia de configuración con electron-store
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { 
  existsSync, 
  statSync, 
  readdirSync, 
  unlinkSync, 
  renameSync 
} from 'fs'
import { spawn, ChildProcess } from 'child_process'
import Store from 'electron-store'
import chokidar from 'chokidar'

/**
 * Interfaz que representa un archivo de audio en el explorador
 */
interface AudioFile {
  id: string                    // Hash único basado en la ruta absoluta
  path: string                  // Ruta absoluta en disco
  filename: string              // Nombre del archivo con extensión
  extension: 'mp3' | 'wav' | 'flac'
  sizeBytes: number             // Tamaño en bytes
  durationSeconds: number       // Duración en segundos
  createdAt: string             // Fecha de creación (ISO)
  modifiedAt: string            // Fecha de modificación (ISO)
  analysis: {
    status: 'pending' | 'ready' | 'error'
    bpm: number | null          // Beats por minuto (si se detectó)
    lufs: number | null         // Loudness integrado (EBU R128)
    peakDb: number | null       // Pico en dB
    waveformPeaks: number[] | null  // Array de picos para dibujar waveform
  }
  source: {
    type: 'youtube' | 'local'
    url?: string                // URL original de YouTube
    videoTitle?: string         // Título del video
    channel?: string            // Canal de YouTube
    downloadedAt?: string       // Fecha de descarga
  } | null
}

/**
 * Interfaz para un trabajo de descarga en cola
 */
interface DownloadJob {
  id: string
  url: string
  status: 'queued' | 'fetching_info' | 'downloading' | 'converting' | 'analyzing' | 'done' | 'error'
  progressPercent: number
  speed?: string                // Velocidad de descarga (ej: "1.2 MiB/s")
  eta?: string                  // Tiempo estimado restante (ej: "00:12")
  outputFormat: 'mp3' | 'wav' | 'flac'
  outputQuality: string         // Calidad (ej: "320k" para MP3)
  destinationFolder: string     // Carpeta donde guardar
  resultFilePath?: string       // Ruta final del archivo descargado
  errorMessage?: string         // Mensaje de error si falló
}

/**
 * Configuración persistente de la aplicación
 */
interface AppConfig {
  rootFolders: string[]         // Carpetas raíz agregadas al explorador
  lastActiveFolder: string      // Última carpeta visitada
  defaultDownloadFolder: string // Carpeta por defecto para descargas
  defaultDownloadFormat: 'mp3' | 'wav' | 'flac'
  defaultDownloadQuality: string
  defaultNormalizeTarget: number // Target LUFS para normalización
  gridOrListView: 'grid' | 'list' // Vista del explorador
  maxParallelDownloads: number  // Descargas simultáneas máximas
}

// Almacén de configuración persistente (JSON en disco)
const store = new Store<AppConfig>({
  name: 'config',
  defaults: {
    rootFolders: [],
    lastActiveFolder: '',
    defaultDownloadFolder: '',
    defaultDownloadFormat: 'mp3',
    defaultDownloadQuality: '320k',
    defaultNormalizeTarget: -14,
    gridOrListView: 'grid',
    maxParallelDownloads: 1,
  },
})

// Estado global del proceso principal
let mainWindow: BrowserWindow | null = null
let sidecarProcess: ChildProcess | null = null
let downloadQueue: DownloadJob[] = []
let activeDownloads = 0
const fileWatchers = new Map<string, chokidar.FSWatcher>()
let isQuitting = false

// Maps para resolver promesas de análisis y renderizado asíncronos
const pendingAnalysis = new Map<string, (result: any) => void>()
const pendingRender = new Map<string, (result: any) => void>()

// Estado del "first-run doctor": detecta Python, yt-dlp y FFmpeg
export type ToolStatus = 'ok' | 'missing' | 'broken'
export interface ToolCheck {
  id: string
  label: string
  required: boolean
  status: ToolStatus
  version: string | null
  message: string
  hint: string | null
}
export interface DoctorReport {
  ok: boolean
  sidecarState: 'starting' | 'ready' | 'errored'
  sidecarError: string | null
  checks: ToolCheck[]
}
let lastSidecarDoctor: ToolCheck[] | null = null
let sidecarState: DoctorReport['sidecarState'] = 'starting'
let sidecarStderrTail: string[] = []
let sidecarRestarts = 0
const MAX_SIDECAR_RESTARTS = 3

/**
 * Ejecuta --version de un binario y devuelve { ok, version }.
 * Captura stdout y stderr (python imprime la versión a stderr según la build).
 */
function probeVersion(cmd: string, args: string[]): Promise<{ ok: boolean; version: string | null }> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      resolve({ ok: false, version: null })
      return
    }
    const timer = setTimeout(() => {
      child.kill()
      resolve({ ok: false, version: null })
    }, 8000)
    let out = ''
    child.stdout?.on('data', (d) => { out += d.toString() })
    child.stderr?.on('data', (d) => { out += d.toString() })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ ok: false, version: null })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const first = out.trim().split(/\r?\n/)[0] || null
      resolve({ ok: code === 0, version: first })
    })
  })
}

/**
 * Compila el reporte del doctor: sondea Python desde el main y completa con
 * el reporte que envía el sidecar (yt-dlp, ffmpeg, ffprobe). Si el sidecar
 * murió antes de reportar, el banner explica la causa.
 */
async function buildDoctorReport(): Promise<DoctorReport> {
  const checks: ToolCheck[] = []
  const python = await probeVersion('python', ['--version'])
  checks.push({
    id: 'python',
    label: 'Python',
    required: true,
    status: python.ok ? 'ok' : 'missing',
    version: python.version,
    message: python.ok
      ? 'Python disponible para el sidecar de descarga.'
      : 'Python no está instalado o no está en el PATH. Sin él la app no puede descargar ni analizar audio.',
    hint: python.ok ? null : 'https://www.python.org/downloads/',
  })
  if (lastSidecarDoctor) {
    for (const c of lastSidecarDoctor) {
      if (c.id !== 'python') checks.push(c)
    }
  }
  const ok = checks.every((c) => c.status === 'ok')
  return { ok, sidecarState, sidecarError: null, checks }
}

/** Difunde el reporte actual del doctor al renderer. */
async function pushDoctor() {
  if (!mainWindow) return
  const report = await buildDoctorReport()
  mainWindow.webContents.send('doctor:report', report)
}

// Detecta si estamos en desarrollo (Vite dev server) o producción
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

/**
 * Crea la ventana principal de la aplicación
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),  // Bridge seguro main ↔ renderer
      contextIsolation: true,                   // Seguridad: aisla contextos
      nodeIntegration: false,                   // No exponer Node.js al renderer
      sandbox: true,                            // Sandbox adicional
    },
    titleBarStyle: 'hiddenInset',               // Barra de título personalizada (macOS)
    trafficLightPosition: { x: 16, y: 16 },     // Posición botones ventana (macOS)
    show: false,                                // Mostrar solo cuando esté lista
  })

  if (isDev) {
    // Desarrollo: carga desde Vite dev server
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    // Producción: carga archivos compilados
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * Inicia el proceso hijo Python (sidecar) que maneja yt-dlp y ffmpeg
 * Comunicación via stdin/stdout con protocolo JSON-lines
 */
function startSidecar() {
  const sidecarPath = isDev
    ? join(__dirname, '../sidecar/main.py')
    : join(process.resourcesPath, 'sidecar', 'main.py')

  const pythonCmd = process.platform === 'win32' ? 'python.exe' : 'python3'
  sidecarState = 'starting'
  sidecarStderrTail = []

  sidecarProcess = spawn(pythonCmd, [sidecarPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  })

  // Procesa mensajes JSON-lines del stdout del sidecar
  sidecarProcess.stdout?.on('data', (data) => {
    const lines = data.toString().trim().split('\n')
    for (const line of lines) {
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        handleSidecarMessage(msg)
      } catch (e) {
        console.error('Failed to parse sidecar message:', line)
      }
    }
  })

  // Guarda la cola de stderr para poder reportarla en el doctor
  sidecarProcess.stderr?.on('data', (data) => {
    const msg = data.toString().trim()
    if (!msg) return
    console.error('Sidecar stderr:', msg)
    sidecarStderrTail.push(msg)
    if (sidecarStderrTail.length > 6) sidecarStderrTail.shift()
  })

  sidecarProcess.on('error', (err: NodeJS.ErrnoException) => {
    console.error('Sidecar process error:', err)
    sidecarProcess = null
    sidecarState = 'errored'
    // ENOENT = python no está; EACCES = bloqueado por SmartScreen/antivirus
    const reason = err.code === 'ENOENT' ? 'Python no está instalado o no está en el PATH.'
      : err.code === 'EACCES' ? 'Windows bloqueó el acceso a Python (SmartScreen o antivirus).'
      : err.message
    mainWindow?.webContents.send('sidecar:status', { state: 'errored', message: reason })
    pushDoctor()
  })

  // Reintenta reiniciar el sidecar si muere inesperadamente, con tope.
  sidecarProcess.on('exit', (code) => {
    console.log(`Sidecar exited with code ${code}`)
    sidecarProcess = null
    if (isQuitting) return
    if (sidecarState === 'ready') {
      sidecarState = 'errored'
      sidecarRestarts = 0
      const trace = sidecarStderrTail.join('\n')
      const message = trace
        ? `El sidecar terminó tras arrancar (código ${code}). ${trace.split('\n')[0]}`
        : `El sidecar terminó de forma inesperada (código ${code}).`
      mainWindow?.webContents.send('sidecar:status', { state: 'errored', message })
      pushDoctor()
      return
    }
    sidecarRestarts++
    if (sidecarRestarts <= MAX_SIDECAR_RESTARTS) {
      console.log(`Reintentando sidecar (${sidecarRestarts}/${MAX_SIDECAR_RESTARTS})`)
      setTimeout(startSidecar, 1000)
    } else {
      sidecarState = 'errored'
      const trace = sidecarStderrTail.join('\n')
      const message = trace
        ? `El sidecar no pudo iniciar. ${trace.split('\n')[0]}`
        : `El sidecar no pudo iniciar (código ${code}). Comprobá que Python y sus dependencias estén instaladas.`
      mainWindow?.webContents.send('sidecar:status', { state: 'errored', message })
      pushDoctor()
    }
  })
}

/**
 * Envía un comando al sidecar Python via stdin. Devuelve true si se pudo
 * escribir; false si el sidecar no está disponible (el renderer puede avisar).
 */
function sendToSidecar(msg: object): boolean {
  if (sidecarProcess?.stdin?.writable) {
    sidecarProcess.stdin.write(JSON.stringify(msg) + '\n')
    return true
  }
  return false
}

/**
 * Maneja los mensajes recibidos del sidecar y los reenvía al renderer vía IPC
 */
function handleSidecarMessage(msg: any) {
  if (!mainWindow) return

  switch (msg.type) {
    case 'ready':
      // El sidecar respondió el handshake: quedó operativo
      sidecarState = 'ready'
      sidecarRestarts = 0
      pushDoctor()
      break
    case 'doctor':
      // El sidecar reportó el estado de sus dependencias (yt-dlp, ffmpeg, ffprobe)
      if (Array.isArray(msg.checks)) lastSidecarDoctor = msg.checks
      pushDoctor()
      break
    case 'progress':
      mainWindow.webContents.send('download:progress', msg)
      break
    case 'done':
      mainWindow.webContents.send('download:complete', msg)
      break
    case 'error':
      mainWindow.webContents.send('download:error', msg)
      break
    case 'analysis':
      mainWindow.webContents.send('analysis:complete', msg)
      // Resuelve la promesa pendiente de análisis
      const analysisResolver = pendingAnalysis.get(msg.id)
      if (analysisResolver) {
        pendingAnalysis.delete(msg.id)
        analysisResolver(msg)
      }
      break
    case 'render_done':
      mainWindow.webContents.send('render:complete', msg)
      // Resuelve la promesa pendiente de renderizado
      const renderResolver = pendingRender.get(msg.id)
      if (renderResolver) {
        pendingRender.delete(msg.id)
        renderResolver({ success: true, ...msg })
      }
      break
    case 'render_error':
      mainWindow.webContents.send('render:error', msg)
      const errorResolver = pendingRender.get(msg.id)
      if (errorResolver) {
        pendingRender.delete(msg.id)
        errorResolver({ success: false, error: msg.message })
      }
      break
  }
}

/**
 * Procesa la cola de descargas, iniciando la siguiente si hay slots libres
 */
function processDownloadQueue() {
  if (activeDownloads >= store.get('maxParallelDownloads') || downloadQueue.length === 0) return

  const job = downloadQueue.find(j => j.status === 'queued')
  if (!job) return

  job.status = 'fetching_info'
  activeDownloads++
  mainWindow?.webContents.send('download:progress', { ...job })

  sendToSidecar({
    cmd: 'download',
    id: job.id,
    url: job.url,
    format: job.outputFormat,
    quality: job.outputQuality,
    destination: job.destinationFolder,
  })
}

/**
 * Genera ID único basado en timestamp + random
 */
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Hash simple de string para usar como ID estable de archivo
 */
function hashPath(path: string): string {
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

/**
 * Escanea una carpeta y retorna lista de archivos de audio válidos
 */
function getAudioFilesInFolder(folderPath: string): AudioFile[] {
  if (!existsSync(folderPath)) return []

  const files = readdirSync(folderPath)
  const audioFiles: AudioFile[] = []

  for (const file of files) {
    const fullPath = join(folderPath, file)
    const stat = statSync(fullPath)
    if (!stat.isFile()) continue

    const ext = file.split('.').pop()?.toLowerCase()
    if (!['mp3', 'wav', 'flac'].includes(ext || '')) continue

    const id = hashPath(fullPath)
    audioFiles.push({
      id,
      path: fullPath,
      filename: file,
      extension: ext as 'mp3' | 'wav' | 'flac',
      sizeBytes: stat.size,
      durationSeconds: 0,
      createdAt: stat.birthtime.toISOString(),
      modifiedAt: stat.mtime.toISOString(),
      analysis: {
        status: 'pending',
        bpm: null,
        lufs: null,
        peakDb: null,
        waveformPeaks: null,
      },
      source: null,
    })
  }

  return audioFiles
}

/**
 * Inicia file watcher en una carpeta para detectar cambios en tiempo real
 */
function watchFolder(folderPath: string) {
  if (fileWatchers.has(folderPath)) return

  const watcher = chokidar.watch(folderPath, {
    ignored: /[\/\\]\./,      // Ignora archivos ocultos
    persistent: true,
    ignoreInitial: true,      // No disparar eventos al iniciar
    depth: 0,                 // Solo archivos directos, no recursivo
  })

  let debounceTimer: NodeJS.Timeout | null = null

  const triggerRefresh = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      mainWindow?.webContents.send('folder:changed', { path: folderPath })
    }, 300)  // Debounce 300ms para evitar cascada de eventos
  }

  watcher.on('add', triggerRefresh)
  watcher.on('change', triggerRefresh)
  watcher.on('unlink', triggerRefresh)

  fileWatchers.set(folderPath, watcher)
}

/**
 * Detiene el file watcher de una carpeta
 */
function unwatchFolder(folderPath: string) {
  const watcher = fileWatchers.get(folderPath)
  if (watcher) {
    watcher.close()
    fileWatchers.delete(folderPath)
  }
}

/**
 * Configura todos los handlers IPC (comunicación main ↔ renderer)
 */
function setupIpc() {
  // Configuración
  ipcMain.handle('get-config', () => store.store)

  ipcMain.handle('set-config', (_e, key: keyof AppConfig, value: any) => {
    store.set(key, value)
    return true
  })

  // Gestión de carpetas raíz
  ipcMain.handle('add-root-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Agregar carpeta raíz',
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const folders = store.get('rootFolders')
      const newFolder = result.filePaths[0]
      if (!folders.includes(newFolder)) {
        folders.push(newFolder)
        store.set('rootFolders', folders)
        watchFolder(newFolder)
      }
      return newFolder
    }
    return null
  })

  ipcMain.handle('remove-root-folder', (_e, folder: string) => {
    const folders = store.get('rootFolders').filter(f => f !== folder)
    store.set('rootFolders', folders)
    unwatchFolder(folder)
    return true
  })

  // Listar archivos de una carpeta
  ipcMain.handle('list-folder', (_e, folderPath: string) => {
    watchFolder(folderPath)
    store.set('lastActiveFolder', folderPath)
    return getAudioFilesInFolder(folderPath)
  })

  // Cola de descargas
  ipcMain.handle('start-download', (_e, jobs: Omit<DownloadJob, 'id' | 'status' | 'progressPercent'>[]) => {
    const newJobs: DownloadJob[] = jobs.map(job => ({
      ...job,
      id: generateId(),
      status: 'queued' as const,
      progressPercent: 0,
    }))
    downloadQueue.push(...newJobs)
    processDownloadQueue()
    return newJobs.map(j => j.id)
  })

  ipcMain.handle('cancel-download', (_e, jobId: string) => {
    const job = downloadQueue.find(j => j.id === jobId)
    if (job) {
      job.status = 'error'
      job.errorMessage = 'Cancelado por el usuario'
      activeDownloads = Math.max(0, activeDownloads - 1)
      sendToSidecar({ cmd: 'cancel', id: jobId })
      processDownloadQueue()
    }
    return true
  })

  // Renderizado de ediciones (delega a ffmpeg via sidecar)
  ipcMain.handle('render-edit', async (_e, _fileId: string, operations: any[], exportOptions: any) => {
    return new Promise((resolve) => {
      const id = generateId()
      pendingRender.set(id, (result) => {
        resolve(result)
      })
      sendToSidecar({ cmd: 'render_edit', id, ...exportOptions, operations })
    })
  })

  // Operaciones de archivos
  ipcMain.handle('move-file', async (_e, fromPath: string, toPath: string) => {
    try {
      if (existsSync(toPath)) {
        const base = toPath.substring(0, toPath.lastIndexOf('.'))
        const ext = toPath.substring(toPath.lastIndexOf('.'))
        let counter = 1
        let newPath = `${base} (${counter})${ext}`
        while (existsSync(newPath)) {
          counter++
          newPath = `${base} (${counter})${ext}`
        }
        toPath = newPath
      }
      renameSync(fromPath, toPath)
      return { success: true, newPath: toPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('delete-file', async (_e, filePath: string) => {
    try {
      unlinkSync(filePath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('open-external', (_e, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle('show-save-dialog', async (_e, options: any) => {
    const result = await dialog.showSaveDialog(mainWindow!, options)
    return result
  })

  // First-run doctor: reporte a demanda (el push llega por 'doctor:report')
  ipcMain.handle('doctor:get', () => buildDoctorReport())
}

// Inicialización de la aplicación
app.whenReady().then(() => {
  setupIpc()
  createWindow()
  startSidecar()

  // Difunde el reporte inicial del doctor apenas la ventana responde
  mainWindow?.webContents.once('did-finish-load', () => pushDoctor())

  // Reanuda watchers de carpetas guardadas
  const rootFolders = store.get('rootFolders')
  for (const folder of rootFolders) {
    if (existsSync(folder)) watchFolder(folder)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Limpieza al cerrar todas las ventanas
app.on('window-all-closed', () => {
  isQuitting = true
  for (const watcher of fileWatchers.values()) {
    watcher.close()
  }
  if (sidecarProcess) {
    sidecarProcess.kill()
  }
  if (process.platform !== 'darwin') app.quit()
})

// Desarrollado por fedo-soft