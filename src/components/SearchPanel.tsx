import React, { useState, useRef } from 'react'
import { projectService } from '../services/projectService'
import { useT } from '../services/i18nService'
import './SearchPanel.css'

interface SearchMatch {
  file: string
  line: number
  text: string
}

interface SearchPanelProps {
  onOpenFile: (filePath: string, line: number) => void
}

const SearchPanel: React.FC<SearchPanelProps> = ({ onOpenFile }) => {
  const t = useT()
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [truncated, setTruncated] = useState(false)
  const [searchedFiles, setSearchedFiles] = useState(0)
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const project = projectService.getCurrentProject()

  const runSearch = async () => {
    const pattern = query.trim()
    if (!pattern || !project || !window.electronAPI) return
    setSearching(true)
    try {
      const result = await window.electronAPI.searchFiles(project.rootPath, pattern)
      if (result.success) {
        setMatches(result.matches ?? [])
        setTruncated(result.truncated ?? false)
        setSearchedFiles(result.searchedFiles ?? 0)
      } else {
        setMatches([])
        setTruncated(false)
      }
    } finally {
      setSearching(false)
      setHasSearched(true)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      runSearch()
    }
  }

  // Group matches by file, preserving order
  const grouped: [string, SearchMatch[]][] = []
  const byFile = new Map<string, SearchMatch[]>()
  for (const m of matches) {
    const list = byFile.get(m.file) ?? []
    list.push(m)
    byFile.set(m.file, list)
  }
  for (const [file, list] of byFile) grouped.push([file, list])

  const openAt = (file: string, line: number) => {
    if (!project) return
    onOpenFile(`${project.rootPath}/${file}`, line)
  }

  return (
    <div className="search-panel">
      <div className="search-input-row">
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={project ? t('Search (regex supported)') : t('Open a project to search')}
          disabled={!project}
          spellCheck={false}
        />
        <button
          className="search-run"
          onClick={runSearch}
          disabled={!project || !query.trim() || searching}
          title={t('Search')}
        >
          🔍
        </button>
      </div>

      {hasSearched && (
        <div className="search-summary">
          {matches.length} {t('result(s)')} / {searchedFiles} {t('files')}
          {truncated && ` (${t('truncated')})`}
        </div>
      )}

      <div className="search-results">
        {grouped.map(([file, list]) => (
          <div key={file} className="search-file-group">
            <div
              className="search-file-name"
              title={file}
              onClick={() => openAt(file, list[0].line)}
            >
              {file}
            </div>
            {list.map((m, i) => (
              <div
                key={`${m.line}-${i}`}
                className="search-match"
                onClick={() => openAt(file, m.line)}
                title={`${file}:${m.line}`}
              >
                <span className="search-line-no">{m.line}</span>
                <span className="search-line-text">{m.text.trim()}</span>
              </div>
            ))}
          </div>
        ))}
        {hasSearched && matches.length === 0 && !searching && (
          <p className="search-empty">{t('No results')}</p>
        )}
      </div>
    </div>
  )
}

export default SearchPanel
