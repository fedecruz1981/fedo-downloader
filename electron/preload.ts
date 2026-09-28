/**
 * YTAudio Studio - Preload Script (Bridge seguro main ↔ renderer)
 * Desarrollado por fedo-soft
 * 
 * Este script se ejecuta en el contexto del renderer ANTES de cargar la página web.
 * Expone APIs seguras vía contextBridge para comunicación con el proceso principal.
 * contextIsolation=true garantiza que el renderer no tenga acceso directo a Node.js.
 */

import { contextBridge, ipcRenderer } from 'electron'

/**
 * Tipos compartidos entre main y renderer para type-safety en IPC
 */

interface DownloadJob {
  id: string
  url: string
  status: 'queued' | 'fetching_info' | 'downloading' | 'converting' | 'analyzing' | 'done' | 'error'
  progressPercent: number
  speed?: string
  eta?: string
  outputFormat: 'mp3' | 'wav' | 'flac'
  outputQuality: string
  destinationFolder: string
  resultFilePath?: string
  errorMessage?: string
}

interface AppConfig {
  rootFolders: string[]
  lastActiveFolder: string
  defaultDownloadFolder: string
  defaultDownloadFormat: 'mp3' | 'wav' | 'flac'
  defaultDownloadQuality: string
  defaultNormalizeTarget: number
  gridOrListView: 'grid' | 'list'
  maxParallelDownloads: number
}

type EditOperation =
  | { type: 'trim'; startSec: number; endSec: number }
  | { type: 'fadeIn'; durationSec: number }
  | { type: 'fadeOut'; durationSec: number }
  | { type: 'gain'; deltaDb: number }
  | { type: 'normalize'; targetLufs: number }
  | { type: 'autoTrimSilence'; thresholdDb: number; edges: 'start' | 'end' | 'both' }

/**
 * Suscribe un callback a un canal push del main process y devuelve la función
 * de cleanup. El listener se conserva en una constante para que off() pueda
 * quitarlo: ipcRenderer.off compara por referencia, asi que devolver una arrow
 * nueva en el cleanup no desuscribiria nada.
 */
function subscribe(channel: string, callback: (msg: any) => void): () => void {
  // Listener real, el mismo que se pasa a on y a off
  const listener = (_e: unknown, msg: any) => callback(msg)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

/**
 * API expuesta al renderer (window.api)
 * Todas las funciones usan ipcRenderer.invoke (promesas) para requests
 * y ipcRenderer.on/off para eventos push del main process
 */
contextBridge.exposeInMainWorld('api', {
  // Configuración
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (key: keyof AppConfig, value: any) => ipcRenderer.invoke('set-config', key, value),

  // Gestión de carpetas raíz
  addRootFolder: () => ipcRenderer.invoke('add-root-folder'),
  removeRootFolder: (folder: string) => ipcRenderer.invoke('remove-root-folder', folder),

  // Filesystem
  listFolder: (path: string) => ipcRenderer.invoke('list-folder', path),

  // Descargas
  startDownload: (jobs: Omit<DownloadJob, 'id' | 'status' | 'progressPercent'>[]) =>
    ipcRenderer.invoke('start-download', jobs),
  cancelDownload: (jobId: string) => ipcRenderer.invoke('cancel-download', jobId),

  // Edición/renderizado
  renderEdit: (fileId: string, operations: EditOperation[], exportOptions: any) =>
    ipcRenderer.invoke('render-edit', fileId, operations, exportOptions),

  // Operaciones de archivos
  moveFile: (fromPath: string, toPath: string) => ipcRenderer.invoke('move-file', fromPath, toPath),
  deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),

  // Utilidades
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  showSaveDialog: (options: any) => ipcRenderer.invoke('show-save-dialog', options),

  // First-run doctor
  getDoctor: () => ipcRenderer.invoke('doctor:get'),
  onDoctorReport: (callback: (report: any) => void) => subscribe('doctor:report', callback),
  onSidecarStatus: (callback: (status: any) => void) => subscribe('sidecar:status', callback),

  // Eventos push del main process (retornan función de cleanup).
  // El listener se guarda en una constante porque off() compara por
  // referencia: pasar una arrow nueva en el cleanup no quita nada y los
  // listeners se acumulan en cada montaje del componente.
  onDownloadProgress: (callback: (msg: any) => void) => subscribe('download:progress', callback),
  onDownloadComplete: (callback: (msg: any) => void) => subscribe('download:complete', callback),
  onDownloadError: (callback: (msg: any) => void) => subscribe('download:error', callback),
  onFolderChanged: (callback: (msg: { path: string }) => void) => subscribe('folder:changed', callback),
  onAnalysisComplete: (callback: (msg: any) => void) => subscribe('analysis:complete', callback),
  onRenderComplete: (callback: (msg: any) => void) => subscribe('render:complete', callback),
  onRenderError: (callback: (msg: any) => void) => subscribe('render:error', callback),
})

// Desarrollado por fedo-soft