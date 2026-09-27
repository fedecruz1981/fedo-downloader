import { X, Loader2, CheckCircle, AlertCircle, Clock, ArrowDown, FileText } from 'lucide-react'
import { clsx } from 'clsx'
import type { DownloadJob } from '@/types'

interface DownloadQueueProps {
  jobs: DownloadJob[]
  onCancel: (jobId: string) => void
}

const StatusIcon = ({ status, className }: { status: string; className?: string }) => {
  const icons: Record<string, any> = {
    queued: Clock,
    fetching_info: Loader2,
    downloading: ArrowDown,
    converting: FileText,
    analyzing: Loader2,
    done: CheckCircle,
    error: AlertCircle,
  }
  const Icon = icons[status] || Clock
  return <Icon className={className} />
}

const statusColors: Record<string, string> = {
  queued: 'text-fedo-text-dim',
  fetching_info: 'text-fedo-primary animate-spin',
  downloading: 'text-fedo-primary',
  converting: 'text-fedo-warning',
  analyzing: 'text-fedo-secondary animate-spin',
  done: 'text-fedo-success',
  error: 'text-fedo-error',
}

const statusLabels: Record<string, string> = {
  queued: 'En cola',
  fetching_info: 'Obteniendo info...',
  downloading: 'Descargando',
  converting: 'Convirtiendo',
  analyzing: 'Analizando',
  done: 'Completado',
  error: 'Error',
}

export function DownloadQueue({ jobs, onCancel }: DownloadQueueProps) {
  const activeJobs = jobs.filter(j => j.status !== 'done' && j.status !== 'error')
  const completedJobs = jobs.filter(j => j.status === 'done' || j.status === 'error')

  if (jobs.length === 0) return null

  return (
    <div className="border-t border-fedo-border bg-fedo-surface/50">
      <div className="px-4 py-2 flex items-center justify-between border-b border-fedo-border">
        <h3 className="font-mono text-sm text-fedo-text-dim">Descargas ({activeJobs.length} activas)</h3>
        {completedJobs.length > 0 && (
          <button
            onClick={() => {}}
            className="text-xs text-fedo-text-dim hover:text-fedo-primary"
          >
            Limpiar completadas
          </button>
        )}
      </div>

      <div className="max-h-48 overflow-y-auto">
        {jobs.map(job => (
          <div
            key={job.id}
            className={clsx(
              'px-4 py-2 border-b border-fedo-border/50 transition-colors',
              job.status === 'done' && 'opacity-60',
              job.status === 'error' && 'bg-fedo-error/5'
            )}
          >
            <div className="flex items-center gap-3">
              <StatusIcon status={job.status} className={clsx('w-4 h-4 flex-shrink-0', statusColors[job.status])} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-sm">
                  <p className="truncate font-medium">{job.url.split('v=')[1]?.split('&')[0] || job.url.substring(0, 50)}</p>
                  <span className="text-fedo-text-dim whitespace-nowrap ml-2">{statusLabels[job.status]}</span>
                </div>

                <div className="h-1.5 bg-fedo-border rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-fedo-primary transition-all duration-300 ease-out"
                    style={{ width: `${job.progressPercent}%` }}
                  />
                </div>

                {job.status === 'downloading' && job.speed && (
                  <div className="flex items-center gap-2 mt-1 text-xs text-fedo-text-dim">
                    <span>{job.speed}</span>
                    {job.eta && <span>• ETA {job.eta}</span>}
                  </div>
                )}

                {job.errorMessage && (
                  <p className="text-xs text-fedo-error mt-1">{job.errorMessage}</p>
                )}
              </div>

              {(job.status !== 'done' && job.status !== 'error') && (
                <button
                  onClick={() => onCancel(job.id)}
                  className="btn-ghost p-1.5 text-fedo-error/50 hover:text-fedo-error flex-shrink-0"
                  title="Cancelar"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}