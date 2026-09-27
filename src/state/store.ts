/**
 * YTAudio Studio - Estado global (Zustand store)
 * Desarrollado por fedo-soft
 * 
 * Store centralizado para toda la UI React.
 * Persiste configuración, vista y sidebar en localStorage vía middleware persist.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AudioFile, DownloadJob, AppConfig, EditOperation } from '@/types'

interface AppState {
  // Configuración de la app
  config: AppConfig
  setConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void

  // Carpetas raíz
  addRootFolder: () => Promise<void>
  removeRootFolder: (folder: string) => void
  listFolder: (folder: string) => Promise<AudioFile[]>

  // Explorador de archivos
  rootFolders: string[]           // Carpetas raíz agregadas
  activeFolder: string            // Carpeta actualmente seleccionada
  setActiveFolder: (folder: string) => void
  files: AudioFile[]              // Archivos de audio en carpeta activa
  setFiles: (files: AudioFile[]) => void
  updateFile: (id: string, updates: Partial<AudioFile>) => void
  addFile: (file: AudioFile) => void
  removeFile: (id: string) => void

  // Cola de descargas
  downloadQueue: DownloadJob[]
  addDownloadJobs: (jobs: DownloadJob[]) => void
  updateDownloadJob: (id: string, updates: Partial<DownloadJob>) => void
  removeDownloadJob: (id: string) => void

  // UI
  viewMode: 'grid' | 'list'       // Vista grid o lista
  setViewMode: (mode: 'grid' | 'list') => void

  // Editor
  editingFileId: string | null    // ID del archivo en edición (null = cerrado)
  setEditingFileId: (id: string | null) => void
  editOperations: EditOperation[] // Operaciones de edición aplicadas (historial)
  addEditOperation: (op: EditOperation) => void
  removeEditOperation: (index: number) => void
  clearEditOperations: () => void
  setEditOperations: (ops: EditOperation[]) => void
  isDirty: boolean                // Hay cambios sin guardar
  setIsDirty: (dirty: boolean) => void

  // Notificaciones toast
  toasts: Array<{ id: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }>
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  removeToast: (id: string) => void

  // Sidebar
  sidebarCollapsed: boolean
  toggleSidebar: () => void
}

const defaultConfig: AppConfig = {
  rootFolders: [],
  lastActiveFolder: '',
  defaultDownloadFolder: '',
  defaultDownloadFormat: 'mp3',
  defaultDownloadQuality: '320k',
  defaultNormalizeTarget: -14,
  gridOrListView: 'grid',
  maxParallelDownloads: 1,
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      config: defaultConfig,
      setConfig: (key, value) => set((state) => ({ config: { ...state.config, [key]: value } })),

      addRootFolder: async () => {
        const folder = await window.api.addRootFolder()
        if (folder) {
          set((state) => ({
            config: { ...state.config, rootFolders: [...state.config.rootFolders, folder] },
          }))
        }
      },
      removeRootFolder: (folder) => set((state) => ({
        config: { ...state.config, rootFolders: state.config.rootFolders.filter((f) => f !== folder) },
      })),
      listFolder: (folder) => window.api.listFolder(folder),

      rootFolders: [],
      activeFolder: '',
      setActiveFolder: (folder) => set({ activeFolder: folder }),
      files: [],
      setFiles: (files) => set({ files }),
      updateFile: (id, updates) => set((state) => ({
        files: state.files.map(f => f.id === id ? { ...f, ...updates } : f)
      })),
      addFile: (file) => set((state) => ({ files: [file, ...state.files] })),
      removeFile: (id) => set((state) => ({ files: state.files.filter(f => f.id !== id) })),

      downloadQueue: [],
      addDownloadJobs: (jobs) => set((state) => ({ downloadQueue: [...state.downloadQueue, ...jobs] })),
      updateDownloadJob: (id, updates) => set((state) => ({
        downloadQueue: state.downloadQueue.map(j => j.id === id ? { ...j, ...updates } : j)
      })),
      removeDownloadJob: (id) => set((state) => ({ downloadQueue: state.downloadQueue.filter(j => j.id !== id) })),

      viewMode: 'grid',
      setViewMode: (mode) => set({ viewMode: mode }),

      editingFileId: null,
      setEditingFileId: (id) => set({ editingFileId: id }),
      editOperations: [],
      addEditOperation: (op) => set((state) => ({ editOperations: [...state.editOperations, op], isDirty: true })),
      removeEditOperation: (index) => set((state) => ({ editOperations: state.editOperations.filter((_, i) => i !== index), isDirty: true })),
      clearEditOperations: () => set({ editOperations: [], isDirty: false }),
      setEditOperations: (ops) => set({ editOperations: ops, isDirty: ops.length > 0 }),
      isDirty: false,
      setIsDirty: (dirty) => set({ isDirty: dirty }),

      toasts: [],
      addToast: (message, type = 'info') => set((state) => ({
        toasts: [...state.toasts, { id: Date.now().toString(), message, type }]
      })),
      removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),

      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    {
      name: 'ytaudio-store',
      // Solo persiste configuración y preferencias UI, no datos volátiles
      partialize: (state) => ({
        config: state.config,
        viewMode: state.viewMode,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
)

// Desarrollado por fedo-soft