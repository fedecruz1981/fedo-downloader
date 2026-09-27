import { Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2 } from 'lucide-react'
import { clsx } from 'clsx'

interface PlaybackControlsProps {
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  playbackRate: number
  loop: boolean
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
  onVolumeChange: (volume: number) => void
  onMuteToggle: () => void
  onRateChange: (rate: number) => void
  onLoopToggle: () => void
  onRestart: () => void
}

export function PlaybackControls({
  playing,
  currentTime,
  duration,
  volume,
  muted,
  playbackRate,
  loop,
  onPlay,
  onPause,
  onSeek,
  onVolumeChange,
  onMuteToggle,
  onRateChange,
  onLoopToggle,
  onRestart,
}: PlaybackControlsProps) {
  const formatTime = (sec: number) => {
    if (!isFinite(sec)) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-t border-fedo-border bg-fedo-surface/80">
      <div className="flex items-center gap-2">
        <button onClick={onRestart} className="btn-ghost p-2" title="Reiniciar (R)">
          <RotateCcw className="w-5 h-5" />
        </button>
        <button onClick={playing ? onPause : onPlay} className="btn-primary p-2" style={{ width: 44, height: 44 }}>
          {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
        </button>
      </div>

      <div className="flex-1 flex items-center gap-2">
        <span className="font-mono text-fedo-text-dim w-10 text-right">{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step="0.1"
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="flex-1 accent-fedo-primary h-1"
        />
        <span className="font-mono text-fedo-text-dim w-10">{formatTime(duration)}</span>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={onMuteToggle} className="btn-ghost p-1.5" title={muted ? 'Activar sonido' : 'Silenciar (M)'}>
          {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="w-24 accent-fedo-primary h-1"
        />

        <select
          value={playbackRate}
          onChange={(e) => onRateChange(parseFloat(e.target.value))}
          className="input w-auto px-2 py-1 text-sm font-mono bg-fedo-bg"
        >
          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(r => (
            <option key={r} value={r}>{r}x</option>
          ))}
        </select>

        <button
          onClick={onLoopToggle}
          className={clsx('btn-ghost p-1.5', loop && 'text-fedo-primary bg-fedo-primary/10')}
          title="Bucle (L)"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        <button className="btn-ghost p-1.5" title="Pantalla completa">
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}