import { Search, Filter, ChevronDown } from 'lucide-react'
import { useState, useMemo } from 'react'
import { FileCard } from './FileCard'
import type { AudioFile } from '@/types'

interface FileListProps {
  files: AudioFile[]
  viewMode: 'grid' | 'list'
  onFileClick: (file: AudioFile) => void
}

export function FileList({ files, viewMode, onFileClick }: FileListProps) {
  const [search, setSearch] = useState('')
  const [filterFormat, setFilterFormat] = useState<'all' | 'mp3' | 'wav' | 'flac'>('all')
  const [filterSource, setFilterSource] = useState<'all' | 'youtube' | 'local'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'duration' | 'bpm' | 'lufs'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const filteredFiles = useMemo(() => {
    return files
      .filter(f => f.filename.toLowerCase().includes(search.toLowerCase()))
      .filter(f => filterFormat === 'all' || f.extension === filterFormat)
      .filter(f => filterSource === 'all' || f.source?.type === filterSource)
      .sort((a, b) => {
        let aVal: any, bVal: any
        switch (sortBy) {
          case 'name': aVal = a.filename; bVal = b.filename; break
          case 'date': aVal = new Date(a.modifiedAt).getTime(); bVal = new Date(b.modifiedAt).getTime(); break
          case 'duration': aVal = a.durationSeconds; bVal = b.durationSeconds; break
          case 'bpm': aVal = a.analysis.bpm ?? -1; bVal = b.analysis.bpm ?? -1; break
          case 'lufs': aVal = a.analysis.lufs ?? -999; bVal = b.analysis.lufs ?? -999; break
        }
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
        return 0
      })
  }, [files, search, filterFormat, filterSource, sortBy, sortDir])

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('desc')
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-fedo-surface/50 rounded-xl border border-fedo-border">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fedo-text-dim" />
          <input
            type="text"
            placeholder="Buscar archivos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <select value={filterFormat} onChange={(e) => setFilterFormat(e.target.value as any)} className="input w-auto px-3 py-1.5 text-sm">
            <option value="all">Todos los formatos</option>
            <option value="mp3">MP3</option>
            <option value="wav">WAV</option>
            <option value="flac">FLAC</option>
          </select>

          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value as any)} className="input w-auto px-3 py-1.5 text-sm">
            <option value="all">Todas las fuentes</option>
            <option value="youtube">YouTube</option>
            <option value="local">Local</option>
          </select>

          <div className="relative">
            <select value={sortBy} onChange={(e) => handleSort(e.target.value as any)} className="input w-auto px-3 py-1.5 text-sm pr-8 appearance-none">
              <option value="name">Nombre</option>
              <option value="date">Fecha</option>
              <option value="duration">Duración</option>
              <option value="bpm">BPM</option>
              <option value="lufs">LUFS</option>
            </select>
            <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="absolute right-2 top-1/2 -translate-y-1/2 text-fedo-text-dim hover:text-fedo-primary">
              {sortDir === 'asc' ? <ChevronDown className="w-4 h-4 rotate-180" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredFiles.map(file => (
              <FileCard
                key={file.id}
                file={file}
                viewMode="grid"
                onPlay={onFileClick}
                onEdit={onFileClick}
                onDelete={() => {}}
                onDuplicate={() => {}}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredFiles.map(file => (
              <FileCard
                key={file.id}
                file={file}
                viewMode="list"
                onPlay={onFileClick}
                onEdit={onFileClick}
                onDelete={() => {}}
                onDuplicate={() => {}}
              />
            ))}
          </div>
        )}

        {filteredFiles.length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center text-fedo-text-dim gap-2">
            <Filter className="w-12 h-12 opacity-30" />
            <p>No se encontraron archivos</p>
          </div>
        )}
      </div>
    </div>
  )
}