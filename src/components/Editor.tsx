import React, { useState, useEffect, useRef } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import { themeService, ResolvedTheme } from '../services/themeService'
import { configService } from '../services/configService'
import { getLanguage } from '../utils/language'
import { renderMarkdown, MARKDOWN_CSS } from '../utils/markdown'
import { useT } from '../services/i18nService'
import './Editor.css'

interface EditorProps {
  file: string | null
  content: string
  onChange: (content: string) => void
  diff?: { filePath: string; original: string; modified: string } | null
  onCloseDiff?: () => void
  // When set, reveal this line (n makes repeated jumps to the same line re-fire)
  gotoLine?: { line: number; n: number } | null
  onExportPdf?: () => void
  onExportHtml?: () => void
}

const CodeEditor: React.FC<EditorProps> = ({ file, content, onChange, diff, onCloseDiff, gotoLine, onExportPdf, onExportHtml }) => {
  const t = useT()
  const [monacoTheme, setMonacoTheme] = useState<ResolvedTheme>(themeService.getResolvedTheme())
  const [fontSize, setFontSize] = useState<number>(configService.getUIFontSize() || 14)
  const [fontFamily, setFontFamily] = useState<string | undefined>(configService.getUIFontFamily())
  const editorRef = useRef<any>(null)
  const pendingGotoRef = useRef<number | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const isMarkdown = file?.toLowerCase().endsWith('.md') ?? false

  // Reset preview mode when switching files
  useEffect(() => {
    setShowPreview(false)
  }, [file])

  const gotoLineNow = (line: number) => {
    const ed = editorRef.current
    if (!ed) return
    ed.revealLineInCenter(line)
    ed.setPosition({ lineNumber: line, column: 1 })
    ed.focus()
  }

  useEffect(() => {
    if (!gotoLine) return
    pendingGotoRef.current = gotoLine.line
    gotoLineNow(gotoLine.line)
  }, [gotoLine])

  // Route Edit-menu undo/redo to Monaco when it has focus; fall back to
  // native undo for regular inputs (the chat textarea etc.).
  useEffect(() => {
    const handleMenu = (event: Event) => {
      const action = (event as CustomEvent).detail
      if (action !== 'undo' && action !== 'redo') return

      const editor = editorRef.current
      if (editor?.hasTextFocus()) {
        editor.trigger('menu', action, null)
      } else if (action === 'undo') {
        window.electronAPI?.editUndo()
      } else {
        window.electronAPI?.editRedo()
      }
    }
    window.addEventListener('app-menu', handleMenu)
    return () => window.removeEventListener('app-menu', handleMenu)
  }, [])

  useEffect(() => {
    const handleThemeChanged = (event: Event) => {
      setMonacoTheme((event as CustomEvent<ResolvedTheme>).detail)
    }
    const handleFontChanged = () => {
      setFontSize(configService.getUIFontSize() || 14)
      setFontFamily(configService.getUIFontFamily())
    }
    window.addEventListener('theme-changed', handleThemeChanged)
    window.addEventListener('font-changed', handleFontChanged)
    return () => {
      window.removeEventListener('theme-changed', handleThemeChanged)
      window.removeEventListener('font-changed', handleFontChanged)
    }
  }, [])

  const monacoThemeName = monacoTheme === 'dark' ? 'vs-dark' : monacoTheme === 'quiet' ? 'forger-quiet' : 'vs'
  const editorOptions = {
    minimap: { enabled: true },
    fontSize,
    fontFamily,
    lineNumbers: 'on' as const,
    roundedSelection: false,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
  }

  if (diff) {
    return (
      <div className="editor-container">
        <div className="editor-wrapper">
          <div className="editor-header">
            <span className="file-name">{diff.filePath}</span>
            <span className="diff-badge">diff</span>
            <button className="diff-close" onClick={onCloseDiff} title={t('Close diff')}>✕</button>
          </div>
          <DiffEditor
            height="100%"
            language={getLanguage(diff.filePath)}
            original={diff.original}
            modified={diff.modified}
            theme={monacoThemeName}
            options={{ ...editorOptions, renderSideBySide: true, readOnly: true }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="editor-container">
      {file ? (
        <div className="editor-wrapper">
          <div className="editor-header">
            <span className="file-name">{file}</span>
            {isMarkdown && (
              <>
                <button
                  className="preview-toggle"
                  onClick={() => setShowPreview(p => !p)}
                  title={showPreview ? t('Back to editor') : t('Preview Markdown')}
                >
                  {showPreview ? t('Edit') : t('Preview')}
                </button>
                {onExportHtml && (
                  <button
                    className="preview-toggle"
                    onClick={onExportHtml}
                    title={t('Export Markdown to HTML')}
                  >
                    {t('Export HTML')}
                  </button>
                )}
                {onExportPdf && (
                  <button
                    className="preview-toggle"
                    onClick={onExportPdf}
                    title={t('Export Markdown to PDF')}
                  >
                    {t('Export PDF')}
                  </button>
                )}
              </>
            )}
          </div>
          {showPreview && isMarkdown ? (
            <div className="md-preview">
              <style>{MARKDOWN_CSS}</style>
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />
            </div>
          ) : (
          <Editor
            height="100%"
            defaultLanguage={getLanguage(file)}
            language={getLanguage(file)}
            value={content}
            onChange={(value) => onChange(value || '')}
            onMount={(editor, monaco) => {
              editorRef.current = editor
              // Monaco's bundled TS worker only sees currently-open models and
              // cannot resolve modules on disk, so cross-file checks produce
              // false "cannot find module" squiggles. Keep syntax validation
              // (unterminated strings etc.) but disable semantic checks.
              const tsLang = (monaco as any).languages?.typescript
              if (tsLang) {
                tsLang.typescriptDefaults.setDiagnosticsOptions({
                  noSemanticValidation: true, // no module-resolution/type squiggles
                  noSyntaxValidation: false,  // keep real syntax errors
                })
                tsLang.javascriptDefaults.setDiagnosticsOptions({
                  noSemanticValidation: true,
                  noSyntaxValidation: false,
                })
              }
              // A line jump may have arrived before the editor mounted
              if (pendingGotoRef.current) {
                gotoLineNow(pendingGotoRef.current)
                pendingGotoRef.current = null
              }
            }}
            theme={monacoThemeName}
            options={editorOptions}
          />
          )}
        </div>
      ) : (
        <div className="editor-placeholder">
          <div className="placeholder-content">
            <h2>{t('No file selected')}</h2>
            <p>{t('Select a file from the Explorer to start editing')}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default CodeEditor
