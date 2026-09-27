import { useState } from 'react'
import { Undo, Redo, Save, Copy, FileText, RotateCcw, Scissors, Volume1, Volume2, Maximize, Minimize, Settings } from 'lucide-react'
import { clsx } from 'clsx'
import type { EditOperation } from '@/types'

interface EditorToolbarProps {
  operations: EditOperation[]
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
  onUndo: () => void
  onRedo: () => void
  onAddOperation: (op: EditOperation) => void
  onRemoveOperation: (index: number) => void
  onClearOperations: () => void
  onSave: (mode: 'overwrite' | 'copy' | 'export') => void
  duration: number
}

export function EditorToolbar({
  operations,
  canUndo,
  canRedo,
  isDirty,
  onUndo,
  onRedo,
  onAddOperation,
  onClearOperations,
  onSave,
  duration,
}: EditorToolbarProps) {
  const [showFadeIn, setShowFadeIn] = useState(false)
  const [showFadeOut, setShowFadeOut] = useState(false)
  const [showNormalize, setShowNormalize] = useState(false)
  const [showGain, setShowGain] = useState(false)
  const [showAutoTrim, setShowAutoTrim] = useState(false)
  const [fadeInVal, setFadeInVal] = useState(0.5)
  const [fadeOutVal, setFadeOutVal] = useState(0.5)
  const [gainVal, setGainVal] = useState(0)
  const [normalizeTarget, setNormalizeTarget] = useState(-14)
  const [autoTrimThreshold, setAutoTrimThreshold] = useState(-40)
  const [autoTrimEdges, setAutoTrimEdges] = useState<'start' | 'end' | 'both'>('both')

  const handleTrim = () => {
    // This would be called with current selection from parent
  }

  const applyFadeIn = () => {
    onAddOperation({ type: 'fadeIn', durationSec: fadeInVal })
    setShowFadeIn(false)
  }

  const applyFadeOut = () => {
    onAddOperation({ type: 'fadeOut', durationSec: fadeOutVal })
    setShowFadeOut(false)
  }

  const applyGain = () => {
    onAddOperation({ type: 'gain', deltaDb: gainVal })
    setGainVal(0)
    setShowGain(false)
  }

  const applyNormalize = () => {
    onAddOperation({ type: 'normalize', targetLufs: normalizeTarget })
    setShowNormalize(false)
  }

  const applyAutoTrim = () => {
    onAddOperation({ type: 'autoTrimSilence', thresholdDb: autoTrimThreshold, edges: autoTrimEdges })
    setShowAutoTrim(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-fedo-border bg-fedo-surface/80">
      <div className="flex items-center gap-1 border-r border-fedo-border pr-3 mr-3">
        <button onClick={onUndo} disabled={!canUndo} className="btn-ghost p-2" title="Deshacer (Ctrl+Z)">
          <Undo className="w-4 h-4" />
        </button>
        <button onClick={onRedo} disabled={!canRedo} className="btn-ghost p-2" title="Rehacer (Ctrl+Shift+Z)">
          <Redo className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 border-r border-fedo-border pr-3 mr-3">
        <button
          onClick={handleTrim}
          className="btn-ghost p-2 relative"
          title="Recortar a selección (S)"
        >
          <Scissors className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 border-r border-fedo-border pr-3 mr-3">
        <div className="relative">
          <button
            onClick={() => setShowFadeIn(!showFadeIn)}
            className={clsx('btn-ghost p-2', showFadeIn && 'bg-fedo-primary/20')}
            title="Fade In"
          >
            <Volume1 className="w-4 h-4" />
          </button>
          {showFadeIn && (
            <div className="absolute top-full left-0 mt-1 p-3 bg-fedo-surface border border-fedo-border rounded-lg shadow-lg z-10 min-w-[200px]">
              <label className="block text-xs text-fedo-text-dim mb-1">Duración (s)</label>
              <input
                type="number"
                step="0.1"
                min="0.01"
                max={duration}
                value={fadeInVal}
                onChange={(e) => setFadeInVal(parseFloat(e.target.value))}
                className="input w-full mb-2"
              />
              <div className="flex gap-1">
                {[0.1, 0.25, 0.5, 1, 2].map(v => (
                  <button
                    key={v}
                    onClick={() => setFadeInVal(v)}
                    className="btn-ghost px-2 py-1 text-xs"
                  >
                    {v}s
                  </button>
                ))}
              </div>
              <button onClick={applyFadeIn} className="btn-primary w-full mt-2 text-xs">Aplicar</button>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowFadeOut(!showFadeOut)}
            className={clsx('btn-ghost p-2', showFadeOut && 'bg-fedo-primary/20')}
            title="Fade Out"
          >
            <Volume2 className="w-4 h-4" />
          </button>
          {showFadeOut && (
            <div className="absolute top-full left-0 mt-1 p-3 bg-fedo-surface border border-fedo-border rounded-lg shadow-lg z-10 min-w-[200px]">
              <label className="block text-xs text-fedo-text-dim mb-1">Duración (s)</label>
              <input
                type="number"
                step="0.1"
                min="0.01"
                max={duration}
                value={fadeOutVal}
                onChange={(e) => setFadeOutVal(parseFloat(e.target.value))}
                className="input w-full mb-2"
              />
              <div className="flex gap-1">
                {[0.1, 0.25, 0.5, 1, 2].map(v => (
                  <button
                    key={v}
                    onClick={() => setFadeOutVal(v)}
                    className="btn-ghost px-2 py-1 text-xs"
                  >
                    {v}s
                  </button>
                ))}
              </div>
              <button onClick={applyFadeOut} className="btn-primary w-full mt-2 text-xs">Aplicar</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-r border-fedo-border pr-3 mr-3">
        <div className="relative">
          <button
            onClick={() => setShowGain(!showGain)}
            className={clsx('btn-ghost p-2', showGain && 'bg-fedo-primary/20')}
            title="Ganancia"
          >
            <Volume2 className="w-4 h-4" />
          </button>
          {showGain && (
            <div className="absolute top-full left-0 mt-1 p-3 bg-fedo-surface border border-fedo-border rounded-lg shadow-lg z-10 min-w-[200px]">
              <label className="block text-xs text-fedo-text-dim mb-1">Ganancia (dB): <span className="font-mono text-fedo-primary">{gainVal.toFixed(1)}</span></label>
              <input
                type="range"
                min="-24"
                max="24"
                step="0.5"
                value={gainVal}
                onChange={(e) => setGainVal(parseFloat(e.target.value))}
                className="w-full mb-2 accent-fedo-primary"
              />
              <div className="flex gap-1">
                {[-6, -3, 0, 3, 6].map(v => (
                  <button
                    key={v}
                    onClick={() => setGainVal(v)}
                    className={clsx('btn-ghost px-2 py-1 text-xs', gainVal === v && 'bg-fedo-primary/20')}
                  >
                    {v > 0 ? '+' : ''}{v}dB
                  </button>
                ))}
              </div>
              <button onClick={applyGain} className="btn-primary w-full mt-2 text-xs">Aplicar</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-r border-fedo-border pr-3 mr-3">
        <div className="relative">
          <button
            onClick={() => setShowNormalize(!showNormalize)}
            className={clsx('btn-ghost p-2', showNormalize && 'bg-fedo-primary/20')}
            title="Normalizar"
          >
            <Maximize className="w-4 h-4" />
          </button>
          {showNormalize && (
            <div className="absolute top-full left-0 mt-1 p-3 bg-fedo-surface border border-fedo-border rounded-lg shadow-lg z-10 min-w-[220px]">
              <label className="block text-xs text-fedo-text-dim mb-1">Target LUFS</label>
              <input
                type="number"
                step="0.5"
                min="-30"
                max="0"
                value={normalizeTarget}
                onChange={(e) => setNormalizeTarget(parseFloat(e.target.value))}
                className="input w-full mb-2"
              />
              <div className="flex gap-1">
                {[-23, -16, -14, -12, -10].map(v => (
                  <button
                    key={v}
                    onClick={() => setNormalizeTarget(v)}
                    className={clsx('btn-ghost px-2 py-1 text-xs', normalizeTarget === v && 'bg-fedo-primary/20')}
                  >
                    {v} LUFS
                  </button>
                ))}
              </div>
              <button onClick={applyNormalize} className="btn-primary w-full mt-2 text-xs">Aplicar</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-r border-fedo-border pr-3 mr-3">
        <div className="relative">
          <button
            onClick={() => setShowAutoTrim(!showAutoTrim)}
            className={clsx('btn-ghost p-2', showAutoTrim && 'bg-fedo-primary/20')}
            title="Quitar silencios"
          >
            <Minimize className="w-4 h-4" />
          </button>
          {showAutoTrim && (
            <div className="absolute top-full left-0 mt-1 p-3 bg-fedo-surface border border-fedo-border rounded-lg shadow-lg z-10 min-w-[240px]">
              <label className="block text-xs text-fedo-text-dim mb-1">Umbral (dB): <span className="font-mono text-fedo-primary">{autoTrimThreshold}</span></label>
              <input
                type="range"
                min="-60"
                max="-20"
                step="1"
                value={autoTrimThreshold}
                onChange={(e) => setAutoTrimThreshold(parseInt(e.target.value))}
                className="w-full mb-2 accent-fedo-primary"
              />
              <div className="mb-2">
                <label className="block text-xs text-fedo-text-dim mb-1">Bordes</label>
                <div className="flex gap-1">
                  {(['start', 'end', 'both'] as const).map(edge => (
                    <button
                      key={edge}
                      onClick={() => setAutoTrimEdges(edge)}
                      className={clsx('btn-ghost px-2 py-1 text-xs flex-1', autoTrimEdges === edge && 'bg-fedo-primary/20')}
                    >
                      {edge === 'start' ? 'Inicio' : edge === 'end' ? 'Final' : 'Ambos'}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={applyAutoTrim} className="btn-primary w-full mt-2 text-xs">Aplicar</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {operations.length > 0 && (
          <button onClick={onClearOperations} className="btn-ghost text-xs px-3" title="Limpiar todas las ediciones">
            <RotateCcw className="w-4 h-4 mr-1" />
            Limpiar
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => onSave('overwrite')}
            disabled={!isDirty}
            className={clsx('btn-primary px-4', !isDirty && 'opacity-50 cursor-not-allowed')}
          >
            <Save className="w-4 h-4 mr-1" />
            {isDirty ? 'Guardar' : 'Sin cambios'}
          </button>

          <div className="relative">
            <button className="btn-secondary px-3" title="Más opciones">
              <Settings className="w-4 h-4" />
            </button>
            <div className="absolute bottom-full left-0 mb-1 p-1 bg-fedo-surface border border-fedo-border rounded-lg shadow-lg z-10 min-w-[180px]">
              <button onClick={() => onSave('copy')} className="w-full px-3 py-2 text-left text-sm hover:bg-fedo-surface-hover rounded">
                <Copy className="w-4 h-4 mr-2 inline" />
                Guardar como copia...
              </button>
              <button onClick={() => onSave('export')} className="w-full px-3 py-2 text-left text-sm hover:bg-fedo-surface-hover rounded">
                <FileText className="w-4 h-4 mr-2 inline" />
                Exportar como...
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}