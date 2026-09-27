import { useState, useRef, useEffect } from 'react'
import { Play, Pause, Music, Youtube, Trash2, Copy, SlidersHorizontal } from 'lucide-react'
import { clsx } from 'clsx'
import type { AudioFile } from '@/types'
import { api } from '@/hooks/useApi'
import { useStore } from '@/state/store'

interface FileCardProps {
  file: AudioFile
  viewMode: 'grid' | 'list'
  onPlay: (file: AudioFile) => void
  onEdit: (file: AudioFile) => void
  onDelete: (file: AudioFile) => void
  onDuplicate: (file: AudioFile) => void
}

export function FileCard({ file, viewMode, onPlay, onEdit, onDelete, onDuplicate }: FileCardProps) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(file.durationSeconds || 0)
  const [analyzing, setAnalyzing] = useState(file.analysis.status === 'pending')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null)
  const { updateFile } = useStore()

  useEffect(() => {
    if (file.analysis.status === 'pending') {
      setAnalyzing(true)
      const unsub = api.onAnalysisComplete((msg) => {
        if (msg.fileId === file.id) {
          updateFile(file.id, { analysis: msg.analysis })
          setAnalyzing(false)
        }
      })
      return () => unsub()
    } else {
      setAnalyzing(false)
    }
  }, [file.analysis.status, file.id, updateFile])

  useEffect(() => {
    const canvas = waveformCanvasRef.current
    if (!canvas || !file.analysis.waveformPeaks) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const peaks = file.analysis.waveformPeaks
    const width = canvas.width
    const height = canvas.height
    const centerY = height / 2

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#00d4ff40'

    const barWidth = Math.max(1, width / peaks.length)
    for (let i = 0; i < peaks.length; i++) {
      const h = peaks[i] * centerY
      const x = i * barWidth
      ctx.fillRect(x, centerY - h, barWidth - 0.5, h * 2)
    }

    if (playing && duration > 0) {
      const progressX = (progress / duration) * width
      ctx.fillStyle = '#00d4ff'
      ctx.fillRect(0, 0, progressX, height)
    }
  }, [file.analysis.waveformPeaks, playing, progress, duration])

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio(file.path)
        audioRef.current.ontimeupdate = () => {
          setProgress(audioRef.current!.currentTime)
        }
        audioRef.current.onended = () => {
          setPlaying(false)
          setProgress(0)
        }
        audioRef.current.onloadedmetadata = () => {
          setDuration(audioRef.current!.duration)
        }
      }
      audioRef.current.currentTime = 0
      audioRef.current.play()
      setPlaying(true)
      onPlay(file)
    }
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const getSourceIcon = () => {
    if (file.source?.type === 'youtube') return <Youtube className="w-3 h-3 text-fedo-error" />
    return <Music className="w-3 h-3 text-fedo-text-dim" />
  }

  const getFormatColor = (ext: string) => {
    switch (ext) {
      case 'wav': return 'text-fedo-success'
      case 'flac': return 'text-fedo-primary'
      default: return 'text-fedo-text-dim'
    }
  }

  if (viewMode === 'list') {
    return (
      <div className="card group flex items-center gap-3 p-3 hover:bg-fedo-surface-hover">
        <button onClick={handlePlay} className="p-2 rounded-lg bg-fedo-surface-hover hover:bg-fedo-primary/20 transition-colors flex-shrink-0">
          {playing ? <Pause className="w-5 h-5 text-fedo-primary" /> : <Play className="w-5 h-5 text-fedo-text" />}
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div className="w-24 h-10 relative flex-shrink-0">
            <canvas ref={waveformCanvasRef} width={96} height={40} className="w-full h-full" />
            {analyzing && <div className="absolute inset-0 flex items-center justify-center"><div className="w-4 h-4 border-2 border-fedo-primary border-t-transparent rounded-full animate-spin" /></div>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{file.filename}</p>
            <div className="flex items-center gap-2 text-xs text-fedo-text-dim">
              <span>{getSourceIcon()}</span>
              <span className={clsx('font-mono', getFormatColor(file.extension))}>{file.extension.toUpperCase()}</span>
              <span>{formatTime(duration)}</span>
              {file.analysis.bpm && <span className="badge-bpm">{file.analysis.bpm} BPM</span>}
              {file.analysis.lufs && <span className="badge-lufs">{file.analysis.lufs.toFixed(1)} LUFS</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(file)} className="btn-ghost p-1.5" title="Editar"><SlidersHorizontal className="w-4 h-4" /></button>
          <button onClick={() => onDuplicate(file)} className="btn-ghost p-1.5" title="Duplicar"><Copy className="w-4 h-4" /></button>
          <button onClick={() => onDelete(file)} className="btn-ghost p-1.5 text-fedo-error/50 hover:text-fedo-error" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    )
  }

  return (
    <div className="card group flex flex-col overflow-hidden relative">
      <div className="relative aspect-square overflow-hidden">
        <canvas ref={waveformCanvasRef} className="w-full h-full" />
        {analyzing && <div className="absolute inset-0 bg-fedo-surface/80 flex items-center justify-center"><div className="w-6 h-6 border-2 border-fedo-primary border-t-transparent rounded-full animate-spin" /></div>}
        <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onEdit(file) }} className="p-1.5 bg-fedo-surface/90 rounded hover:bg-fedo-primary/20" title="Editar"><SlidersHorizontal className="w-4 h-4" /></button>
          <button onClick={(e) => { e.stopPropagation(); onDuplicate(file) }} className="p-1.5 bg-fedo-surface/90 rounded hover:bg-fedo-primary/20" title="Duplicar"><Copy className="w-4 h-4" /></button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(file) }} className="p-1.5 bg-fedo-surface/90 rounded hover:bg-fedo-error/20 text-fedo-error" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
        </div>
        <button onClick={handlePlay} className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors">
          {playing ? <Pause className="w-10 h-10 text-white" /> : <Play className="w-10 h-10 text-white" />}
        </button>
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <p className="font-medium truncate mb-1">{file.filename}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-fedo-text-dim mt-auto">
          <span>{getSourceIcon()}</span>
          <span className={clsx('badge badge-format font-mono', getFormatColor(file.extension))}>{file.extension.toUpperCase()}</span>
          <span className="font-mono">{formatTime(duration)}</span>
          {file.analysis.bpm && <span className="badge-bpm">{file.analysis.bpm} BPM</span>}
          {file.analysis.lufs && <span className="badge-lufs">{file.analysis.lufs.toFixed(1)} LUFS</span>}
        </div>
        <div className="h-1 bg-fedo-border rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-fedo-primary transition-all duration-100" style={{ width: `${duration > 0 ? (progress / duration) * 100 : 0}%` }} />
        </div>
      </div>
    </div>
  )
}