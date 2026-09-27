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
    : join(process.resourcesPath, 'app', 'sidecar', 'main.py')

  const pythonCmd = process.platform === 'win32' ? 'python.exe' : 'python3'

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

  sidecarProcess.stderr?.on('data', (data) => {
    console.error('Sidecar stderr:', data.toString())
  })

  sidecarProcess.on('error', (err) => {
    console.error('Sidecar process error:', err)
  })

  // Reintenta reiniciar el sidecar si muere inesperadamente
  sidecarProcess.on('exit', (code) => {
    console.log(`Sidecar exited with code ${code}`)
    sidecarProcess = null
    if (!isQuitting) {
      setTimeout(startSidecar, 1000)
    }
  })
}

/**
 * Envía un comando al sidecar Python via stdin
 */
function sendToSidecar(msg: object) {
  if (sidecarProcess?.stdin?.writable) {
    sidecarProcess.stdin.write(JSON.stringify(msg) + '\n')
  }
}

/**
 * Maneja los mensajes recibidos del sidecar y los reenvía al renderer vía IPC
 */
function handleSidecarMessage(msg: any) {
  if (!mainWindow) return

  switch (msg.type) {
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
}

// Inicialización de la aplicación
app.whenReady().then(() => {
  setupIpc()
  createWindow()
  startSidecar()

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