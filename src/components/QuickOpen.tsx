import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useT } from '../services/i18nService'
import './QuickOpen.css'

interface QuickOpenProps {
  rootPath: string
  // Recently opened files (relative paths), most recent first
  recents: string[]
  onSelect: (absolutePath: string) => void
  onClose: () => void
}

// Subsequence fuzzy match. Returns 0 when query chars don't all appear
// in order; higher scores for contiguous and segment-start matches.
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  let score = 0
  let lastMatch = -2
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1
      if (ti === lastMatch + 1) score += 2 // contiguous
      if (ti === 0 || /[\\/_.\-]/.test(t[ti - 1])) score += 2 // segment start
      lastMatch = ti
      qi++
    }
  }
  return qi === q.length ? score : 0
}

const MAX_RESULTS = 50

const QuickOpen: React.FC<QuickOpenProps> = ({ rootPath, recents, onSelect, onClose }) => {
  const t = useT()
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    // Load the whole project file list once for fuzzy matching
    window.electronAPI?.findFiles(rootPath, '*', 10000).then((result) => {
      if (result.success && result.files) setFiles(result.files)
    })
  }, [rootPath])

  const results = useMemo(() => {
    if (!query.trim()) return recents
    const scored = files
      .map((f) => ({ f, score: fuzzyScore(query, f) }))
      .filter((x) => x.score > 0)
    scored.sort((a, b) => b.score - a.score || a.f.localeCompare(b.f))
    return scored.slice(0, MAX_RESULTS).map((x) => x.f)
  }, [query, files, recents])

  useEffect(() => {
    setSelected(0)
  }, [results])

  useEffect(() => {
    // Keep the selected row visible while navigating
    const el = listRef.current?.children[selected] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const choose = (rel: string) => {
    onSelect(`${rootPath}/${rel}`)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[selected]) choose(results[selected])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="quickopen-overlay" onClick={onClose}>
      <div className="quickopen" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="quickopen-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('Search files by name...')}
          spellCheck={false}
        />
        <div ref={listRef} className="quickopen-list">
          {!query.trim() && recents.length > 0 && (
            <div className="quickopen-group">{t('recently opened')}</div>
          )}
          {results.length === 0 && (
            <div className="quickopen-empty">
              {query.trim() ? t('No matching files') : t('No recent files - type to search')}
            </div>
          )}
          {results.map((rel, i) => (
            <div
              key={rel}
              className={`quickopen-item ${i === selected ? 'selected' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => choose(rel)}
            >
              <span className="quickopen-name">{rel.split('/').pop()}</span>
              <span className="quickopen-path">{rel}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default QuickOpen
