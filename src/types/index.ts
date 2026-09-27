export interface AudioFile {
  id: string
  path: string
  filename: string
  extension: 'mp3' | 'wav' | 'flac'
  sizeBytes: number
  durationSeconds: number
  createdAt: string
  modifiedAt: string
  analysis: {
    status: 'pending' | 'ready' | 'error'
    bpm: number | null
    lufs: number | null
    peakDb: number | null
    waveformPeaks: number[] | null
  }
  source: {
    type: 'youtube' | 'local'
    url?: string
    videoTitle?: string
    channel?: string
    downloadedAt?: string
  } | null
}

export interface DownloadJob {
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

export interface AppConfig {
  rootFolders: string[]
  lastActiveFolder: string
  defaultDownloadFolder: string
  defaultDownloadFormat: 'mp3' | 'wav' | 'flac'
  defaultDownloadQuality: string
  defaultNormalizeTarget: number
  gridOrListView: 'grid' | 'list'
  maxParallelDownloads: number
}

export type EditOperation =
  | { type: 'trim'; startSec: number; endSec: number }
  | { type: 'fadeIn'; durationSec: number }
  | { type: 'fadeOut'; durationSec: number }
  | { type: 'gain'; deltaDb: number }
  | { type: 'normalize'; targetLufs: number }
  | { type: 'autoTrimSilence'; thresholdDb: number; edges: 'start' | 'end' | 'both' }

export interface EditSession {
  fileId: string
  operations: EditOperation[]
  isDirty: boolean
}

export interface ExportOptions {
  sourcePath: string
  outputPath: string
  outputFormat: 'mp3' | 'wav' | 'flac'
  overwrite: boolean
}

export interface WaveformPeaks {
  peaks: number[]
  duration: number
  sampleRate: number
}