import { ChevronRight, Home, Folder } from 'lucide-react'
import { useMemo } from 'react'

interface BreadcrumbsProps {
  path: string
  onNavigate: (path: string) => void
}

export function Breadcrumbs({ path, onNavigate }: BreadcrumbsProps) {
  const segments = useMemo(() => {
    const parts = path.split(/[\\/]/).filter(Boolean)
    const result: { name: string; path: string }[] = [{ name: 'Inicio', path: '' }]
    let current = ''
    for (const part of parts) {
      current = current ? `${current}\\${part}` : part
      result.push({ name: part, path: current })
    }
    return result
  }, [path])

  return (
    <nav className="px-4 py-2 border-b border-fedo-border bg-fedo-surface/50 flex items-center gap-1 overflow-x-auto scrollbar-hide" aria-label="Navegación">
      {segments.map((segment, index) => (
        <span key={segment.path} className="flex items-center gap-1 whitespace-nowrap">
          {index > 0 && <ChevronRight className="w-4 h-4 text-fedo-text-dim flex-shrink-0" />}
          <button
            onClick={() => onNavigate(segment.path || segments[0].path)}
            className={`px-2 py-1 rounded text-sm transition-colors flex items-center gap-1 ${
              index === segments.length - 1
                ? 'text-fedo-primary font-medium'
                : 'text-fedo-text-dim hover:text-fedo-text hover:bg-fedo-surface-hover'
            }`}
          >
            {index === 0 ? <Home className="w-3 h-3" /> : <Folder className="w-3 h-3" />}
            <span className="truncate max-w-[150px]">{segment.name}</span>
          </button>
        </span>
      ))}
    </nav>
  )
}