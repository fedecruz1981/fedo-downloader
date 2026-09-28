declare global {
  interface Window {
    api: {
      getConfig: () => Promise<any>
      setConfig: (key: string, value: any) => Promise<boolean>
      addRootFolder: () => Promise<string | null>
      removeRootFolder: (folder: string) => Promise<boolean>
      listFolder: (path: string) => Promise<any[]>
      startDownload: (jobs: any[]) => Promise<string[]>
      cancelDownload: (jobId: string) => Promise<boolean>
      renderEdit: (fileId: string, operations: any[], exportOptions: any) => Promise<any>
      moveFile: (fromPath: string, toPath: string) => Promise<any>
      deleteFile: (filePath: string) => Promise<any>
      openExternal: (url: string) => Promise<void>
      showSaveDialog: (options: any) => Promise<any>
      getDoctor: () => Promise<any>
      onDoctorReport: (callback: (report: any) => void) => () => void
      onSidecarStatus: (callback: (status: any) => void) => () => void
      onDownloadProgress: (callback: (msg: any) => void) => () => void
      onDownloadComplete: (callback: (msg: any) => void) => () => void
      onDownloadError: (callback: (msg: any) => void) => () => void
      onFolderChanged: (callback: (msg: { path: string }) => void) => () => void
      onAnalysisComplete: (callback: (msg: any) => void) => () => void
      onRenderComplete: (callback: (msg: any) => void) => () => void
      onRenderError: (callback: (msg: any) => void) => () => void
    }
  }
}

export const api = window.api