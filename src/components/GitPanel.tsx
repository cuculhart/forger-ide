import React, { useState, useEffect, useCallback } from 'react'
import { projectService } from '../services/projectService'
import { useT } from '../services/i18nService'
import './GitPanel.css'

interface GitFileEntry {
  path: string
  index: string
  working_dir: string
}

interface GitPanelProps {
  onOpenDiff: (filePath: string) => void
}

const STATUS_LABELS: Record<string, string> = {
  'M': 'M',
  'A': 'A',
  'D': 'D',
  '?': 'U',
  'R': 'R',
  'C': 'C',
  'U': '!',
}

const STATUS_TITLES: Record<string, string> = {
  'M': 'Modified',
  'A': 'Added',
  'D': 'Deleted',
  '?': 'Untracked',
  'R': 'Renamed',
  'C': 'Copied',
  'U': 'Conflicted',
}

const GitPanel: React.FC<GitPanelProps> = ({ onOpenDiff }) => {
  const t = useT()
  const [status, setStatus] = useState<any>(null)
  const [isRepo, setIsRepo] = useState<boolean | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [commitMessage, setCommitMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const repoPath = projectService.getCurrentProject()?.rootPath

  const refresh = useCallback(async () => {
    if (!repoPath || !window.electronAPI) return
    const result = await window.electronAPI.gitStatus(repoPath)
    if (result.success) {
      setIsRepo(true)
      setStatus(result.status)
      setMessage(null)
    } else {
      const notRepo = /not a git repository/i.test(result.error || '')
      setIsRepo(!notRepo)
      setStatus(null)
      if (!notRepo) setMessage(result.error || t('Failed to get git status'))
    }
  }, [repoPath])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Refresh after AI writes create/update files
  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener('file-created', handler)
    return () => window.removeEventListener('file-created', handler)
  }, [refresh])

  const runGitAction = async (action: () => Promise<{ success: boolean; error?: string }>, okMessage: string) => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await action()
      if (result.success) {
        setMessage(okMessage)
        await refresh()
      } else {
        setMessage(result.error || t('Git operation failed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const handleInit = () => {
    if (!repoPath || !window.electronAPI) return
    runGitAction(() => window.electronAPI!.gitInit(repoPath), t('Repository initialized'))
  }

  const handleCommit = async () => {
    if (!repoPath || !window.electronAPI || !commitMessage.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      // Stage checked files; if none checked, stage everything
      const paths = checked.size > 0
        ? Array.from(checked)
        : ['.']
      const addResult = await window.electronAPI.gitAdd(repoPath, paths)
      if (!addResult.success) {
        setMessage(addResult.error || t('Failed to stage files'))
        return
      }
      const commitResult = await window.electronAPI.gitCommit(repoPath, commitMessage.trim())
      if (commitResult.success) {
        setMessage(t('Committed'))
        setCommitMessage('')
        setChecked(new Set())
        await refresh()
      } else {
        setMessage(commitResult.error || t('Commit failed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const handlePush = () => {
    if (!repoPath || !window.electronAPI) return
    runGitAction(() => window.electronAPI!.gitPush(repoPath), t('Pushed'))
  }

  const handlePull = () => {
    if (!repoPath || !window.electronAPI) return
    runGitAction(() => window.electronAPI!.gitPull(repoPath), t('Pulled'))
  }

  const toggleCheck = (filePath: string) => {
    const next = new Set(checked)
    if (next.has(filePath)) {
      next.delete(filePath)
    } else {
      next.add(filePath)
    }
    setChecked(next)
  }

  const statusLetter = (file: GitFileEntry): string => {
    const code = file.working_dir !== ' ' && file.working_dir !== '?'
      ? file.working_dir
      : (file.working_dir === '?' ? '?' : file.index)
    return STATUS_LABELS[code] || code || '?'
  }

  const statusTitle = (file: GitFileEntry): string => {
    const code = file.working_dir !== ' ' ? file.working_dir : file.index
    return STATUS_TITLES[code] ? t(STATUS_TITLES[code]) : t('Changed')
  }

  const absPath = (relPath: string) => {
    if (!repoPath) return relPath
    return `${repoPath.replace(/[\\/]+$/, '')}/${relPath.replace(/\\/g, '/')}`
  }

  if (!repoPath) {
    return (
      <div className="git-panel">
        <div className="git-empty"><p>{t('Open a project to use Git')}</p></div>
      </div>
    )
  }

  if (isRepo === false) {
    return (
      <div className="git-panel">
        <div className="git-empty">
          <p>{t('This project is not a Git repository')}</p>
          <button className="git-button" onClick={handleInit} disabled={busy}>
            {t('Initialize Git')}
          </button>
          {message && <p className="git-message">{message}</p>}
        </div>
      </div>
    )
  }

  const files: GitFileEntry[] = status?.files ?? []

  return (
    <div className="git-panel">
      <div className="git-toolbar">
        <span className="git-branch" title={t('Current branch')}>
          ⎇ {status?.current || t('(no commits yet)')}
        </span>
        <span className="git-sync-info">
          {(status?.ahead ?? 0) > 0 && `↑${status.ahead}`}
          {(status?.behind ?? 0) > 0 && `↓${status.behind}`}
        </span>
        <button className="git-icon-button" onClick={handlePull} disabled={busy} title={t('Pull')}>↓</button>
        <button className="git-icon-button" onClick={handlePush} disabled={busy} title={t('Push')}>↑</button>
        <button className="git-icon-button" onClick={refresh} disabled={busy} title={t('Refresh')}>⟳</button>
      </div>

      {message && <p className="git-message">{message}</p>}

      <div className="git-changes">
        {files.length === 0 ? (
          <p className="git-clean">{t('No changes')}</p>
        ) : (
          files.map((file) => (
            <div key={file.path} className="git-file">
              <input
                type="checkbox"
                checked={checked.has(file.path)}
                onChange={() => toggleCheck(file.path)}
                title={t('Stage for commit')}
              />
              <span
                className="git-file-name"
                onClick={() => onOpenDiff(absPath(file.path))}
                title={file.path}
              >
                {file.path}
              </span>
              <span className="git-file-status" title={statusTitle(file)}>
                {statusLetter(file)}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="git-commit">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder={t('Commit message')}
          rows={3}
          disabled={busy || files.length === 0}
        />
        <button
          className="git-button"
          onClick={handleCommit}
          disabled={busy || !commitMessage.trim() || files.length === 0}
          title={checked.size === 0 ? t('Commits all changes') : `${t('Commits')} ${checked.size} ${t('selected file(s)')}`}
        >
          {checked.size === 0 ? t('Commit All') : `${t('Commit')} (${checked.size})`}
        </button>
      </div>
    </div>
  )
}

export default GitPanel
