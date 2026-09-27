import { useState, useRef, useEffect } from 'react'
import { Download, X } from 'lucide-react'

interface UrlInputBarProps {
  onSubmit: (urls: string[]) => void
}

export function UrlInputBar({ onSubmit }: UrlInputBarProps) {
  const [urls, setUrls] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [urls])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const urlList = urls.trim().split(/\s+/).filter(Boolean)
    if (urlList.length === 0) return
    setSubmitting(true)
    onSubmit(urlList)
    setUrls('')
    setSubmitting(false)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text')
    if (text) {
      e.preventDefault()
      setUrls(prev => prev + (prev ? '\n' : '') + text.trim())
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex-1 max-w-3xl flex items-center gap-2">
      <div className="relative flex-1">
        <textarea
          ref={textareaRef}
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          onPaste={handlePaste}
          placeholder="Pega URLs de YouTube (una por línea o separadas por espacios)..."
          className="input resize-none min-h-[44px] max-h-[120px] pr-12"
          rows={1}
          disabled={submitting}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {urls && (
            <button
              type="button"
              onClick={() => setUrls('')}
              className="p-1 text-fedo-text-dim hover:text-fedo-error transition-colors"
              title="Limpiar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            disabled={!urls.trim() || submitting}
            className="btn-primary px-3 py-1.5 gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>{submitting ? 'Añadiendo...' : 'Descargar'}</span>
          </button>
        </div>
      </div>
    </form>
  )
}