import { useEffect, useState } from 'react'
import { Folder, Plus, Minus, ChevronRight, ChevronDown, FolderOpen } from 'lucide-react'
import { api } from '@/hooks/useApi'

interface FolderTreeProps {
  folders: string[]
  activeFolder: string
  onSelectFolder: (folder: string) => void
  onAddFolder: () => void
  onRemoveFolder: (folder: string) => void
  collapsed: boolean
}

export function FolderTree({ folders, activeFolder, onSelectFolder, onAddFolder, onRemoveFolder, collapsed }: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(folders))
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null)

  const toggleExpand = (folder: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }

  const getSubfolders = async (folder: string): Promise<string[]> => {
    try {
      const entries = await api.listFolder(folder)
      return entries
        .filter((f: any) => f.isDirectory)
        .map((f: any) => f.path)
    } catch {
      return []
    }
  }

  const handleFolderClick = (folder: string) => {
    if (collapsed) {
      toggleExpand(folder)
    } else {
      onSelectFolder(folder)
    }
  }

  const renderFolder = (folder: string, depth: number = 0) => {
    const isActive = folder === activeFolder
    const isExpanded = expanded.has(folder)
    const hasChildren = true

    return (
      <div key={folder}>
        <button
          onClick={() => handleFolderClick(folder)}
          onContextMenu={(e) => {
            e.preventDefault()
            setHoveredFolder(folder)
          }}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
            isActive ? 'bg-fedo-primary/20 text-fedo-primary' : 'text-fedo-text-dim hover:text-fedo-text hover:bg-fedo-surface-hover'
          }`}
          style={{ paddingLeft: collapsed ? '8px' : 8 + depth * 16 }}
          title={collapsed ? folder.split('\\').pop() || folder : folder}
        >
          {!collapsed && hasChildren && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(folder) }}
              className="p-0.5 text-fedo-text-dim hover:text-fedo-primary flex-shrink-0"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
          <span className="flex items-center gap-2 flex-1 truncate">
            {isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
            {!collapsed && <span className="truncate">{folder.split('\\').pop() || folder}</span>}
          </span>
          {!collapsed && hoveredFolder === folder && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveFolder(folder) }}
              className="p-1 text-fedo-error/50 hover:text-fedo-error opacity-0 group-hover:opacity-100 transition-opacity"
              title="Eliminar carpeta raíz"
            >
              <Minus className="w-4 h-4" />
            </button>
          )}
        </button>
        {!collapsed && isExpanded && (
          <div className="overflow-hidden transition-all duration-200">
            <Subfolders folder={folder} depth={depth + 1} />
          </div>
        )}
      </div>
    )
  }

  const Subfolders = ({ folder, depth }: { folder: string; depth: number }) => {
    const [subfolders, setSubfolders] = useState<string[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
      getSubfolders(folder).then(folders => {
        setSubfolders(folders)
        setLoading(false)
      })
    }, [folder])

    if (loading) return <div className="h-4" />

    return (
      <div>
        {subfolders.map(f => renderFolder(f, depth))}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto p-2">
      {!collapsed && (
        <button
          onClick={onAddFolder}
          className="w-full flex items-center justify-center gap-2 px-2 py-2 text-fedo-text-dim hover:text-fedo-primary hover:bg-fedo-surface-hover rounded-lg mb-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Agregar carpeta</span>
        </button>
      )}
      <div className="flex-1 overflow-auto">
        {folders.map(f => renderFolder(f))}
        {folders.length === 0 && !collapsed && (
          <div className="px-2 py-4 text-center text-fedo-text-dim text-sm">
            Sin carpetas raíz
          </div>
        )}
      </div>
    </div>
  )
}