import { useEffect } from 'react'
import { FolderTree } from '@/components/explorer/FolderTree'
import { FileList } from '@/components/explorer/FileList'
import { Breadcrumbs } from '@/components/explorer/Breadcrumbs'
import { UrlInputBar } from '@/components/download/UrlInputBar'
import { DownloadQueue } from '@/components/download/DownloadQueue'
import { EditorPanel } from '@/components/editor/EditorPanel'
import { ToastContainer } from '@/components/shared/Toast'
import { DoctorBanner } from '@/components/shared/DoctorBanner'
import { useStore } from '@/state/store'
import { api } from '@/hooks/useApi'

export function App() {
  const {
    config,
    activeFolder,
    files,
    downloadQueue,
    editingFileId,
    viewMode,
    sidebarCollapsed,
    toasts,
    addRootFolder,
    removeRootFolder,
    listFolder,
    setActiveFolder,
    setFiles,
    addDownloadJobs,
    updateDownloadJob,
    removeDownloadJob,
    setViewMode,
    addToast,
    removeToast,
    toggleSidebar,
  } = useStore()

  useEffect(() => {
    const unsubProgress = api.onDownloadProgress((msg) => {
      updateDownloadJob(msg.id, {
        progressPercent: msg.percent,
        speed: msg.speed,
        eta: msg.eta,
        status: msg.status || 'downloading',
      })
    })

    const unsubComplete = api.onDownloadComplete((msg) => {
      updateDownloadJob(msg.id, { status: 'done', progressPercent: 100, resultFilePath: msg.path })
      if (msg.path && activeFolder) {
        listFolder(activeFolder).then(setFiles)
      }
      addToast(`Descarga completada: ${msg.path.split('\\').pop()}`, 'success')
    })

    const unsubError = api.onDownloadError((msg) => {
      updateDownloadJob(msg.id, { status: 'error', errorMessage: msg.message })
      addToast(`Error: ${msg.message}`, 'error')
    })

    const unsubFolder = api.onFolderChanged(({ path }) => {
      if (path === activeFolder) {
        listFolder(path).then(setFiles)
      }
    })

    return () => {
      unsubProgress()
      unsubComplete()
      unsubError()
      unsubFolder()
    }
  }, [activeFolder, listFolder, setFiles, updateDownloadJob, addToast, removeToast])

  useEffect(() => {
    if (config.lastActiveFolder && !activeFolder) {
      setActiveFolder(config.lastActiveFolder)
      listFolder(config.lastActiveFolder).then(setFiles)
    }
  }, [])

  const handleStartDownload = async (urls: string[]) => {
    const jobs = urls.map(url => ({
      url,
      outputFormat: config.defaultDownloadFormat,
      outputQuality: config.defaultDownloadQuality,
      destinationFolder: config.defaultDownloadFolder || activeFolder,
    }))
    const ids = await api.startDownload(jobs)
    addDownloadJobs(ids.map((id, i) => ({ ...jobs[i], id, status: 'queued' as const, progressPercent: 0 })))
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <DoctorBanner />
      <header className="h-12 px-4 flex items-center justify-between border-b border-fedo-border bg-fedo-surface/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-mono font-bold text-fedo-primary tracking-tight">
            YTAudio Studio
          </h1>
          <UrlInputBar onSubmit={handleStartDownload} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSidebar}
            className="btn-ghost p-2"
            title={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as 'grid' | 'list')}
            className="input w-auto px-3 py-1 text-sm"
          >
            <option value="grid">Grid</option>
            <option value="list">Lista</option>
          </select>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside
          className={`${sidebarCollapsed ? 'w-12' : 'w-72'} flex-shrink-0 border-r border-fedo-border bg-fedo-surface/50 backdrop-blur-sm flex flex-col transition-all duration-200`}
        >
          <FolderTree
            folders={config.rootFolders}
            activeFolder={activeFolder}
            onSelectFolder={setActiveFolder}
            onAddFolder={addRootFolder}
            onRemoveFolder={removeRootFolder}
            collapsed={sidebarCollapsed}
          />
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {activeFolder && (
            <Breadcrumbs path={activeFolder} onNavigate={setActiveFolder} />
          )}

          <div className="flex-1 overflow-auto p-4">
            {activeFolder ? (
              <FileList
                files={files}
                viewMode={viewMode}
                onFileClick={() => {}}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-fedo-text-dim gap-4">
                <svg className="w-16 h-16 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <p className="text-lg">Selecciona o agrega una carpeta para empezar</p>
                <button onClick={addRootFolder} className="btn-primary">
                  Agregar carpeta raíz
                </button>
              </div>
            )}
          </div>

          <DownloadQueue jobs={downloadQueue} onCancel={removeDownloadJob} />
        </main>

        {editingFileId && (
          <EditorPanel fileId={editingFileId} />
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  )
}