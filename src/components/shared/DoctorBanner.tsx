import { useEffect, useState } from 'react'
import { api } from '@/hooks/useApi'

interface DoctorReport {
  ok: boolean
  sidecarState: 'starting' | 'ready' | 'errored'
  sidecarError: string | null
  checks: Array<{
    id: string
    label: string
    required: boolean
    status: 'ok' | 'missing' | 'broken'
    version: string | null
    message: string
    hint: string | null
  }>
}

const DISMISS_KEY = 'doctor:dismissed-v1'

function needsAttention(report: DoctorReport | null): boolean {
  if (!report) return false
  if (report.sidecarState === 'errored') return true
  return report.checks.some((c) => c.required && c.status !== 'ok')
}

/**
 * Banner no bloqueante del first-run doctor: avisa qué herramienta falta y
 * qué consecuencias tiene. No impide usar la app; solo informa.
 */
export function DoctorBanner() {
  const [report, setReport] = useState<DoctorReport | null>(null)
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') } catch { return [] }
  })

  useEffect(() => {
    let active = true
    let unsub: (() => void) | undefined
    api.getDoctor().then((r) => { if (active) setReport(r) })
    unsub = api.onDoctorReport((r) => { if (active) setReport(r) })
    const unsubStatus = api.onSidecarStatus((s) => {
      if (active && s?.state === 'errored') setReport((prev) => (prev ? { ...prev, sidecarState: 'errored', sidecarError: s.message } : prev))
    })
    return () => { active = false; unsub?.(); unsubStatus() }
  }, [])

  if (!report || !needsAttention(report)) return null

  const problems = [
    ...report.checks.filter((c) => c.required && c.status !== 'ok'),
    ...(report.sidecarState === 'errored' ? [{
      id: 'sidecar', label: 'Sidecar Python', required: true, status: 'missing' as const,
      version: null, message: report.sidecarError || 'El sidecar de procesamiento no está disponible.',
      hint: 'https://www.python.org/downloads/',
    }] : []),
  ]
  const visible = problems.filter((p) => !dismissed.includes(p.id))
  if (visible.length === 0) return null

  const dismiss = () => {
    const next = [...new Set([...dismissed, ...visible.map((p) => p.id)])]
    setDismissed(next)
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next))
  }

  return (
    <div role="status" className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-amber-200">Faltan herramientas para YTAudio Studio</p>
          <ul className="mt-1 space-y-1 text-amber-100/90">
            {visible.map((p) => (
              <li key={p.id}>
                <span className="font-mono text-amber-300">{p.label}</span>: {p.message}{' '}
                {p.hint && (
                  <button
                    type="button"
                    onClick={() => api.openExternal(p.hint!)}
                    className="underline decoration-dotted underline-offset-2 hover:text-amber-50"
                  >
                    cómo instalarlo
                  </button>
                )}
              </li>
            ))}
          </ul>
          {report.sidecarState === 'starting' && (
            <p className="mt-1 text-amber-100/70">El sidecar de procesamiento está arrancando…</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => api.getDoctor().then(setReport)}
            className="text-xs text-amber-100/80 hover:text-amber-50"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="text-sm leading-none text-amber-100/60 hover:text-amber-50"
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}