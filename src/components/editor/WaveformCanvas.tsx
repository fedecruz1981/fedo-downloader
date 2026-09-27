import { useRef, useEffect, useState } from 'react'
import { clsx } from 'clsx'

interface WaveformCanvasProps {
  peaks: number[]
  duration: number
  selection: { start: number; end: number } | null
  playhead: number
  onSelect: (start: number, end: number) => void
  onScrub: (time: number) => void
  zoom: number
  offset: number
  height?: number
}

export function WaveformCanvas({
  peaks,
  duration,
  selection,
  playhead,
  onSelect,
  onScrub,
  zoom,
  offset,
  height = 200,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragging, setDragging] = useState<'selection' | 'playhead' | 'edge-start' | 'edge-end' | null>(null)
  const dragStartRef = useRef<{ x: number; time: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${height}px`

    draw(ctx, rect.width, height)
  }, [peaks, duration, selection, playhead, zoom, offset, height])

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height)

    const centerY = height / 2
    const visiblePeaks = peaks.length > 0 ? peaks : new Array(width).fill(0)
    const peakStep = Math.max(1, visiblePeaks.length / width)

    // Background
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, width, height)

    // Grid lines
    ctx.strokeStyle = '#2a2a3a'
    ctx.lineWidth = 0.5
    for (let i = 1; i < 10; i++) {
      const y = (height / 10) * i
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    // Center line
    ctx.strokeStyle = '#1a1a24'
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(width, centerY)
    ctx.stroke()

    // Waveform
    ctx.fillStyle = '#00d4ff30'
    ctx.beginPath()
    ctx.moveTo(0, centerY)

    for (let x = 0; x < width; x++) {
      const peakIndex = Math.floor((x + offset * (width / zoom)) * peakStep)
      if (peakIndex >= visiblePeaks.length) break
      const peak = visiblePeaks[peakIndex]
      const h = peak * centerY
      ctx.lineTo(x, centerY - h)
    }

    for (let x = width - 1; x >= 0; x--) {
      const peakIndex = Math.floor((x + offset * (width / zoom)) * peakStep)
      if (peakIndex >= visiblePeaks.length) break
      const peak = visiblePeaks[peakIndex]
      const h = peak * centerY
      ctx.lineTo(x, centerY + h)
    }

    ctx.closePath()
    ctx.fill()

    // Waveform outline
    ctx.strokeStyle = '#00d4ff80'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    for (let x = 0; x < width; x++) {
      const peakIndex = Math.floor((x + offset * (width / zoom)) * peakStep)
      if (peakIndex >= visiblePeaks.length) break
      const peak = visiblePeaks[peakIndex]
      const h = peak * centerY
      ctx.lineTo(x, centerY - h)
    }
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(width, centerY)
    for (let x = width - 1; x >= 0; x--) {
      const peakIndex = Math.floor((x + offset * (width / zoom)) * peakStep)
      if (peakIndex >= visiblePeaks.length) break
      const peak = visiblePeaks[peakIndex]
      const h = peak * centerY
      ctx.lineTo(x, centerY + h)
    }
    ctx.stroke()

    // Selection
    if (selection) {
      const startX = (selection.start / duration) * width * zoom - offset * width
      const endX = (selection.end / duration) * width * zoom - offset * width

      ctx.fillStyle = '#00d4ff20'
      ctx.fillRect(Math.max(0, startX), 0, Math.min(width, endX) - Math.max(0, startX), height)

      ctx.strokeStyle = '#00d4ff'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(Math.max(0, startX), 0)
      ctx.lineTo(Math.max(0, startX), height)
      ctx.moveTo(Math.min(width, endX), 0)
      ctx.lineTo(Math.min(width, endX), height)
      ctx.stroke()
      ctx.setLineDash([])

      // Edge handles
      const handleWidth = 6
      ctx.fillStyle = '#00d4ff'
      ctx.fillRect(Math.max(0, startX) - handleWidth / 2, 0, handleWidth, height)
      ctx.fillRect(Math.min(width, endX) - handleWidth / 2, 0, handleWidth, height)
    }

    // Playhead
    const playheadX = (playhead / duration) * width * zoom - offset * width
    if (playheadX >= 0 && playheadX <= width) {
      ctx.strokeStyle = '#ff00aa'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, height)
      ctx.stroke()

      // Playhead triangle
      ctx.fillStyle = '#ff00aa'
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX - 6, 12)
      ctx.lineTo(playheadX + 6, 12)
      ctx.closePath()
      ctx.fill()
    }

    // Time markers
    ctx.fillStyle = '#8888a0'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    const markerInterval = Math.max(1, Math.floor(duration / 10))
    for (let t = 0; t <= duration; t += markerInterval) {
      const x = (t / duration) * width * zoom - offset * width
      if (x >= 0 && x <= width) {
        ctx.fillText(formatTime(t), x, height - 4)
        ctx.beginPath()
        ctx.moveTo(x, height - 16)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
    }
  }

  const getTimeFromX = (x: number, width: number) => {
    return ((x + offset * width) / (width * zoom)) * duration
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const width = rect.width
    const time = getTimeFromX(x, width)

    if (selection) {
      const startX = (selection.start / duration) * width * zoom - offset * width
      const endX = (selection.end / duration) * width * zoom - offset * width
      const handleWidth = 6

      if (Math.abs(x - startX) < handleWidth) {
        setDragging('edge-start')
        dragStartRef.current = { x, time: selection.start }
        return
      }
      if (Math.abs(x - endX) < handleWidth) {
        setDragging('edge-end')
        dragStartRef.current = { x, time: selection.end }
        return
      }
      if (x >= startX && x <= endX) {
        setDragging('selection')
        dragStartRef.current = { x, time }
        return
      }
    }

    const playheadX = (playhead / duration) * width * zoom - offset * width
    if (Math.abs(x - playheadX) < 10) {
      setDragging('playhead')
      dragStartRef.current = { x, time: playhead }
      return
    }

    // New selection
    setDragging('selection')
    dragStartRef.current = { x, time }
    onSelect(time, time)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging || !dragStartRef.current) return

    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const width = rect.width
    const time = Math.max(0, Math.min(duration, getTimeFromX(x, width)))

    switch (dragging) {
      case 'selection':
        if (dragStartRef.current) {
          const start = Math.min(dragStartRef.current.time, time)
          const end = Math.max(dragStartRef.current.time, time)
          onSelect(start, end)
        }
        break
      case 'edge-start':
        if (selection) {
          const newStart = Math.max(0, Math.min(selection.end - 0.01, time))
          onSelect(newStart, selection.end)
        }
        break
      case 'edge-end':
        if (selection) {
          const newEnd = Math.min(duration, Math.max(selection.start + 0.01, time))
          onSelect(selection.start, newEnd)
        }
        break
      case 'playhead':
        onScrub(time)
        break
    }
  }

  const handleMouseUp = () => {
    setDragging(null)
    dragStartRef.current = null
  }

  const handleDoubleClick = () => {
    onSelect(0, duration)
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    // Zoom handled by parent
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    const ms = Math.floor((sec % 1) * 100)
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  return (
    <canvas
      ref={canvasRef}
      className={clsx('w-full cursor-crosshair', dragging && 'cursor-grabbing')}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
      style={{ height }}
    />
  )
}