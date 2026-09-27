import { useState, useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { WaveformCanvas } from './WaveformCanvas'
import { PlaybackControls } from './PlaybackControls'
import { EditorToolbar } from './EditorToolbar'
import { api } from '@/hooks/useApi'
import { useStore } from '@/state/store'
import type { EditOperation } from '@/types'

interface EditorPanelProps {
  fileId: string
}

export function EditorPanel({ fileId }: EditorPanelProps) {
  const { files, editOperations, isDirty, setEditingFileId, setEditOperations, setIsDirty, addToast } = useStore()
  const file = files.find(f => f.id === fileId)

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [peaks, setPeaks] = useState<number[]>([])
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(file?.durationSeconds || 0)
  const [volume, setVolumeState] = useState(1)
  const [muted, setMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [loop, setLoop] = useState(false)
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState(0)
  const [history, setHistory] = useState<EditOperation[][]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef(0)
  const pauseTimeRef = useRef(0)

  useEffect(() => {
    if (!file) return

    const loadAudio = async () => {
      try {
        const arrayBuffer = await fetch(file.path).then(r => r.arrayBuffer())
        const ctx = new AudioContext()
        audioContextRef.current = ctx
        const buffer = await ctx.decodeAudioData(arrayBuffer)
        setAudioBuffer(buffer)
        setDuration(buffer.duration)

        // Generate peaks for waveform
        const channelData = buffer.getChannelData(0)
        const samplesPerPeak = Math.ceil(channelData.length / 2000)
        const newPeaks: number[] = []
        for (let i = 0; i < channelData.length; i += samplesPerPeak) {
          let max = 0
          for (let j = 0; j < samplesPerPeak && i + j < channelData.length; j++) {
            max = Math.max(max, Math.abs(channelData[i + j]))
          }
          newPeaks.push(max)
        }
        setPeaks(newPeaks)
      } catch (err) {
        console.error('Failed to load audio:', err)
        addToast('Error al cargar el audio', 'error')
      }
    }

    loadAudio()

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      sourceRef.current?.stop()
      audioContextRef.current?.close()
    }
  }, [file, addToast])

  const saveToHistory = useCallback((ops: EditOperation[]) => {
    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1)
      next.push(ops)
      if (next.length > 50) next.shift()
      return next
    })
    setHistoryIndex(prev => Math.min(prev + 1, 49))
    setEditOperations(ops)
    setIsDirty(true)
  }, [historyIndex, setEditOperations, setIsDirty])

  const handleAddOperation = useCallback((op: EditOperation) => {
    const newOps = [...editOperations, op]
    saveToHistory(newOps)
  }, [editOperations, saveToHistory])

  const handleRemoveOperation = useCallback((index: number) => {
    const newOps = editOperations.filter((_, i) => i !== index)
    saveToHistory(newOps)
  }, [editOperations, saveToHistory])

  const handleClearOperations = useCallback(() => {
    saveToHistory([])
  }, [saveToHistory])

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setEditOperations(history[newIndex])
      setIsDirty(history[newIndex].length > 0)
    }
  }, [historyIndex, history, setEditOperations, setIsDirty])

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setEditOperations(history[newIndex])
      setIsDirty(history[newIndex].length > 0)
    }
  }, [historyIndex, history, setEditOperations, setIsDirty])

  const applyOperationsToBuffer = useCallback((buffer: AudioBuffer, ops: EditOperation[]): AudioBuffer => {
    let result = buffer
    const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate)

    for (const op of ops) {
      switch (op.type) {
        case 'trim': {
          const startSample = Math.floor(op.startSec * buffer.sampleRate)
          const endSample = Math.floor(op.endSec * buffer.sampleRate)
          const length = endSample - startSample
          const trimmed = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate)
          for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            trimmed.copyToChannel(buffer.getChannelData(ch).subarray(startSample, endSample), ch)
          }
          result = trimmed
          break
        }
        case 'fadeIn': {
          const fadeSamples = Math.floor(op.durationSec * buffer.sampleRate)
          const channelData = result.getChannelData(0)
          for (let i = 0; i < Math.min(fadeSamples, channelData.length); i++) {
            const gain = i / fadeSamples
            for (let ch = 0; ch < result.numberOfChannels; ch++) {
              result.getChannelData(ch)[i] *= gain
            }
          }
          break
        }
        case 'fadeOut': {
          const fadeSamples = Math.floor(op.durationSec * buffer.sampleRate)
          for (let ch = 0; ch < result.numberOfChannels; ch++) {
            const channelData = result.getChannelData(ch)
            for (let i = 0; i < Math.min(fadeSamples, channelData.length); i++) {
              const gain = 1 - i / fadeSamples
              channelData[channelData.length - 1 - i] *= gain
            }
          }
          break
        }
        case 'gain': {
          const factor = Math.pow(10, op.deltaDb / 20)
          for (let ch = 0; ch < result.numberOfChannels; ch++) {
            const channelData = result.getChannelData(ch)
            for (let i = 0; i < channelData.length; i++) {
              channelData[i] *= factor
            }
          }
          break
        }
        case 'normalize': {
          // Peak normalization (LUFS would need sidecar)
          let peak = 0
          for (let ch = 0; ch < result.numberOfChannels; ch++) {
            const channelData = result.getChannelData(ch)
            for (let i = 0; i < channelData.length; i++) {
              peak = Math.max(peak, Math.abs(channelData[i]))
            }
          }
          const targetPeak = Math.pow(10, (op.targetLufs + 1) / 20) // Approximate
          const factor = peak > 0 ? targetPeak / peak : 1
          for (let ch = 0; ch < result.numberOfChannels; ch++) {
            const channelData = result.getChannelData(ch)
            for (let i = 0; i < channelData.length; i++) {
              channelData[i] *= factor
            }
          }
          break
        }
        case 'autoTrimSilence': {
          const threshold = Math.pow(10, op.thresholdDb / 20)
          let startSample = 0
          let endSample = result.length

          if (op.edges === 'start' || op.edges === 'both') {
            for (let i = 0; i < result.length; i++) {
              let max = 0
              for (let ch = 0; ch < result.numberOfChannels; ch++) {
                max = Math.max(max, Math.abs(result.getChannelData(ch)[i]))
              }
              if (max > threshold) {
                startSample = i
                break
              }
            }
          }

          if (op.edges === 'end' || op.edges === 'both') {
            for (let i = result.length - 1; i >= 0; i--) {
              let max = 0
              for (let ch = 0; ch < result.numberOfChannels; ch++) {
                max = Math.max(max, Math.abs(result.getChannelData(ch)[i]))
              }
              if (max > threshold) {
                endSample = i + 1
                break
              }
            }
          }

          const length = endSample - startSample
          const trimmed = ctx.createBuffer(result.numberOfChannels, length, result.sampleRate)
          for (let ch = 0; ch < result.numberOfChannels; ch++) {
            trimmed.copyToChannel(result.getChannelData(ch).subarray(startSample, endSample), ch)
          }
          result = trimmed
          break
        }
      }
    }

    return result
  }, [])

  const play = useCallback(() => {
    if (!audioBuffer || !audioContextRef.current) return

    const ctx = audioContextRef.current
    if (ctx.state === 'suspended') ctx.resume()

    sourceRef.current?.stop()
    sourceRef.current = ctx.createBufferSource()

    // Apply operations for preview
    const processedBuffer = editOperations.length > 0
      ? applyOperationsToBuffer(audioBuffer, editOperations)
      : audioBuffer

    sourceRef.current.buffer = processedBuffer
    sourceRef.current.playbackRate.value = playbackRate
    sourceRef.current.loop = loop

    gainNodeRef.current = ctx.createGain()
    gainNodeRef.current.gain.value = muted ? 0 : volume

    sourceRef.current.connect(gainNodeRef.current)
    gainNodeRef.current.connect(ctx.destination)

    sourceRef.current.onended = () => {
      if (!loop) {
        setPlaying(false)
        setCurrentTime(0)
        pauseTimeRef.current = 0
      }
    }

    sourceRef.current.start(0, pauseTimeRef.current)
    startTimeRef.current = ctx.currentTime - pauseTimeRef.current
    setPlaying(true)

    const updateTime = () => {
      if (playing && audioContextRef.current) {
        pauseTimeRef.current = audioContextRef.current.currentTime - startTimeRef.current
        if (pauseTimeRef.current >= processedBuffer.duration) {
          if (loop) {
            pauseTimeRef.current = 0
            startTimeRef.current = audioContextRef.current.currentTime
          } else {
            setPlaying(false)
            pauseTimeRef.current = 0
          }
        }
        setCurrentTime(pauseTimeRef.current)
        animationRef.current = requestAnimationFrame(updateTime)
      }
    }
    animationRef.current = requestAnimationFrame(updateTime)
  }, [audioBuffer, editOperations, applyOperationsToBuffer, playbackRate, loop, volume, muted])

  const pause = useCallback(() => {
    sourceRef.current?.stop()
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    setPlaying(false)
  }, [])

  const seek = useCallback((time: number) => {
    const wasPlaying = playing
    pause()
    pauseTimeRef.current = Math.max(0, Math.min(duration, time))
    setCurrentTime(pauseTimeRef.current)
    if (wasPlaying) play()
  }, [playing, duration, pause, play])

  const restart = useCallback(() => {
    pauseTimeRef.current = 0
    setCurrentTime(0)
    if (playing) play()
  }, [playing, play])

  const handleVolumeChange = useCallback((vol: number) => {
    setVolumeState(vol)
    if (gainNodeRef.current) gainNodeRef.current.gain.value = vol
  }, [])

  const handleMuteToggle = useCallback(() => {
    const newMuted = !muted
    setMuted(newMuted)
    if (gainNodeRef.current) gainNodeRef.current.gain.value = newMuted ? 0 : volume
  }, [muted, volume])

  const handleSave = async (mode: 'overwrite' | 'copy' | 'export') => {
    if (!file || editOperations.length === 0) return

    let outputPath = file.path
    if (mode === 'copy' || mode === 'export') {
      const result = await api.showSaveDialog({
        defaultPath: file.path.replace(/\.[^.]+$/, `_edit${mode === 'export' ? '' : ''}$&`),
        filters: [
          { name: 'Audio', extensions: ['wav', 'mp3', 'flac'] },
        ],
      })
      if (result.canceled || !result.filePath) return
      outputPath = result.filePath
    }

    addToast('Renderizando...', 'info')
    try {
      const result = await api.renderEdit(fileId, editOperations, {
        sourcePath: file.path,
        outputPath,
        outputFormat: outputPath.split('.').pop() as 'mp3' | 'wav' | 'flac',
        overwrite: mode === 'overwrite',
      })

      if (result.success) {
        addToast(`Guardado: ${outputPath.split('\\').pop()}`, 'success')
        setIsDirty(false)
        if (mode === 'overwrite') {
          // Refresh file list
        }
      } else {
        addToast(`Error: ${result.error}`, 'error')
      }
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error')
    }
  }

  const handleClose = () => {
    if (isDirty) {
      if (!confirm('Hay cambios sin guardar. ¿Cerrar de todos modos?')) return
    }
    pause()
    setEditingFileId(null)
    setEditOperations([])
    setIsDirty(false)
    setHistory([])
    setHistoryIndex(-1)
  }

  if (!file) return null

  return (
    <div className="fixed inset-0 z-50 bg-fedo-bg flex flex-col border-l border-fedo-border animate-slide-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-fedo-border bg-fedo-surface">
        <div className="flex items-center gap-3">
          <button onClick={handleClose} className="btn-ghost p-2">
            <X className="w-5 h-5" />
          </button>
          <div>
            <p className="font-medium truncate max-w-[300px]">{file.filename}</p>
            <p className="text-xs text-fedo-text-dim font-mono">
              {file.extension.toUpperCase()} • {file.durationSeconds.toFixed(1)}s
              {file.analysis.bpm && ` • ${file.analysis.bpm} BPM`}
              {file.analysis.lufs && ` • ${file.analysis.lufs.toFixed(1)} LUFS`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs text-fedo-warning flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-fedo-warning animate-pulse" /> Sin guardar</span>}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <EditorToolbar
          operations={editOperations}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          isDirty={isDirty}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onAddOperation={handleAddOperation}
          onRemoveOperation={handleRemoveOperation}
          onClearOperations={handleClearOperations}
          onSave={handleSave}
          duration={duration}
        />

        <div className="flex-1 flex flex-col relative">
          <WaveformCanvas
            peaks={peaks}
            duration={duration}
            selection={selection}
            playhead={currentTime}
            onSelect={(start, end) => setSelection({ start, end })}
            onScrub={seek}
            zoom={zoom}
            offset={offset}
            height={300}
          />

          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-fedo-bg to-transparent pointer-events-none">
            <div className="flex items-center justify-center gap-4 pointer-events-auto">
              <button onClick={() => setZoom(Math.min(10, zoom * 1.5))} className="btn-ghost p-2" title="Zoom in">+</button>
              <span className="font-mono text-fedo-text-dim px-2">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(Math.max(1, zoom / 1.5))} className="btn-ghost p-2" title="Zoom out">−</button>
              <button onClick={() => { setZoom(1); setOffset(0) }} className="btn-ghost p-2" title="Ajustar">⛶</button>
            </div>
          </div>
        </div>

        <PlaybackControls
          playing={playing}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          muted={muted}
          playbackRate={playbackRate}
          loop={loop}
          onPlay={play}
          onPause={pause}
          onSeek={seek}
          onVolumeChange={handleVolumeChange}
          onMuteToggle={handleMuteToggle}
          onRateChange={setPlaybackRate}
          onLoopToggle={() => setLoop(l => !l)}
          onRestart={restart}
        />
      </div>
    </div>
  )
}