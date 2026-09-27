import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { clsx } from 'clsx'

interface Toast {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

const ToastIcon = ({ type }: { type: Toast['type'] }) => {
  const icons = {
    info: Info,
    success: CheckCircle,
    warning: AlertTriangle,
    error: AlertCircle,
  }
  const Icon = icons[type]
  return <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
}

const colors = {
  info: 'border-fedo-primary bg-fedo-primary/10 text-fedo-primary',
  success: 'border-fedo-success bg-fedo-success/10 text-fedo-success',
  warning: 'border-fedo-warning bg-fedo-warning/10 text-fedo-warning',
  error: 'border-fedo-error bg-fedo-error/10 text-fedo-error',
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={clsx(
            'toast pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg min-w-[280px] max-w-[400px]',
            colors[toast.type]
          )}
        >
          <ToastIcon type={toast.type} />
          <p className="flex-1 text-sm">{toast.message}</p>
          <button
            onClick={() => onDismiss(toast.id)}
            className="p-1 opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}