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

  // Eventos push del main process (retornan función de cleanup)
  onDownloadProgress: (callback: (msg: any) => void) => {
    ipcRenderer.on('download:progress', (_e, msg) => callback(msg))
    return () => ipcRenderer.off('download:progress', (_e, msg) => callback(msg))
  },
  onDownloadComplete: (callback: (msg: any) => void) => {
    ipcRenderer.on('download:complete', (_e, msg) => callback(msg))
    return () => ipcRenderer.off('download:complete', (_e, msg) => callback(msg))
  },
  onDownloadError: (callback: (msg: any) => void) => {
    ipcRenderer.on('download:error', (_e, msg) => callback(msg))
    return () => ipcRenderer.off('download:error', (_e, msg) => callback(msg))
  },
  onFolderChanged: (callback: (msg: { path: string }) => void) => {
    ipcRenderer.on('folder:changed', (_e, msg) => callback(msg))
    return () => ipcRenderer.off('folder:changed', (_e, msg) => callback(msg))
  },
  onAnalysisComplete: (callback: (msg: any) => void) => {
    ipcRenderer.on('analysis:complete', (_e, msg) => callback(msg))
    return () => ipcRenderer.off('analysis:complete', (_e, msg) => callback(msg))
  },
  onRenderComplete: (callback: (msg: any) => void) => {
    ipcRenderer.on('render:complete', (_e, msg) => callback(msg))
    return () => ipcRenderer.off('render:complete', (_e, msg) => callback(msg))
  },
  onRenderError: (callback: (msg: any) => void) => {
    ipcRenderer.on('render:error', (_e, msg) => callback(msg))
    return () => ipcRenderer.off('render:error', (_e, msg) => callback(msg))
  },
})

// Desarrollado por fedo-soft