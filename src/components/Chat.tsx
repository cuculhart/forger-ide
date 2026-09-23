import React, { useState, useRef, useEffect } from 'react'
import { llmService } from '../services/llmService'
import { configService } from '../services/configService'
import { projectService } from '../services/projectService'
import { chatHistoryService } from '../services/chatHistoryService'
import FileEditApproval, { FileEdit } from './FileEditApproval'
import CommandApproval from './CommandApproval'
import { i18nService, useT } from '../services/i18nService'
import './Chat.css'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  // Round-trip time of the LLM call that produced this message (ms)
  latencyMs?: number
  // Model that produced this response (e.g. "ollama:qwen3.5:4b")
  model?: string
  // The model's raw output, before command blocks were replaced with
  // readable notes. Sent back as history so the model never sees the
  // "Ran: ..." note format (small models imitate it and emit fake notes).
  rawContent?: string
}

const formatLatency = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)

// Drop execution-note lines (▶️ Ran:, ⚠️ ..., 📖 ..., etc.) from display text.
// Used when sending legacy assistant messages back as model history.
const stripNoteLines = (text: string) =>
  text
    .split('\n')
    .filter((l) => !/^\s*(▶️|⚠️|📖|🔍|⏭️|↩️|✅)/u.test(l))
    .join('\n')

interface ChatProps {
  onOpenSettings: () => void
}

// Resolve a path from the AI against the current project root.
// Relative paths are resolved under the project root; absolute paths
// outside the project root are rejected for safety.
function resolveFilePath(inputPath: string): { path?: string; error?: string } {
  const trimmed = inputPath.trim().replace(/^["']|["']$/g, '')
  const isAbsolute = /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\') || trimmed.startsWith('/')

  const project = projectService.getCurrentProject()
  if (!project || !project.isOpen) {
    return isAbsolute
      ? { path: trimmed }
      : { error: 'No project is open; cannot resolve a relative path.' }
  }

  const root = project.rootPath.replace(/\\/g, '/').replace(/\/+$/, '')

  if (!isAbsolute) {
    return { path: `${root}/${trimmed.replace(/\\/g, '/').replace(/^\/+/, '')}` }
  }

  const normalized = trimmed.replace(/\\/g, '/')
  if (!normalized.toLowerCase().startsWith(root.toLowerCase() + '/')) {
    return { error: `Path "${trimmed}" is outside the project root (${project.rootPath}).` }
  }
  return { path: trimmed }
}

interface FileCommand {
  type: 'write' | 'read' | 'list' | 'run' | 'grep' | 'find' | 'edit'
  arg: string
  body?: string
  start: number
  end: number
}

interface RunResult {
  output: string
  exitCode: number | null
  timedOut: boolean
  // The command was an "open in browser" handled via the OS shell, not the PTY
  opened?: boolean
}

interface CommandExecutionResult {
  // Response text for display, with command blocks replaced by readable notes
  display: string
  // Results to feed back to the model for the next step (empty = done)
  feedback: string[]
  // True when the model needs the results to continue (reads/lists/failures).
  // A successful write alone does not require another turn.
  needsContinuation: boolean
  // Snapshot of files before AI writes - enables rollback
  checkpoint?: { path: string; prevContent: string; existed: boolean }[]
}

// Find file commands embedded in the AI response
function findFileCommands(response: string): FileCommand[] {
  const commands: FileCommand[] = []
  let match

  const writeFileRegex = /\/\/ WRITE_FILE:\s*([^\n]+?)\n([\s\S]*?)\/\/ END_WRITE_FILE/g
  while ((match = writeFileRegex.exec(response)) !== null) {
    commands.push({ type: 'write', arg: match[1].trim(), body: match[2], start: match.index, end: match.index + match[0].length })
  }

  const editFileRegex = /\/\/ EDIT_FILE:\s*([^\n]+?)\n([\s\S]*?)\/\/ END_EDIT_FILE/g
  while ((match = editFileRegex.exec(response)) !== null) {
    commands.push({ type: 'edit', arg: match[1].trim(), body: match[2], start: match.index, end: match.index + match[0].length })
  }

  // The AI sometimes puts several commands on one line ("// READ_FILE: a// LIST_FILES: b"),
  // so the path argument ends at the next "//" command or the end of the line.
  const readFileRegex = /\/\/ READ_FILE:\s*([^\n]+?)(?=\s*\/\/|\n|$)/g
  while ((match = readFileRegex.exec(response)) !== null) {
    commands.push({ type: 'read', arg: match[1].trim(), start: match.index, end: match.index + match[0].length })
  }

  const listFilesRegex = /\/\/ LIST_FILES:\s*([^\n]+?)(?=\s*\/\/|\n|$)/g
  while ((match = listFilesRegex.exec(response)) !== null) {
    commands.push({ type: 'list', arg: match[1].trim(), start: match.index, end: match.index + match[0].length })
  }

  const runCommandRegex = /\/\/ RUN_COMMAND:\s*([^\n]+?)(?=\s*\/\/|\n|$)/g
  while ((match = runCommandRegex.exec(response)) !== null) {
    commands.push({ type: 'run', arg: match[1].trim(), start: match.index, end: match.index + match[0].length })
  }

  const grepRegex = /\/\/ GREP:\s*([^\n]+?)(?=\s*\/\/|\n|$)/g
  while ((match = grepRegex.exec(response)) !== null) {
    commands.push({ type: 'grep', arg: match[1].trim(), start: match.index, end: match.index + match[0].length })
  }

  const findFilesRegex = /\/\/ FIND_FILES:\s*([^\n]+?)(?=\s*\/\/|\n|$)/g
  while ((match = findFilesRegex.exec(response)) !== null) {
    commands.push({ type: 'find', arg: match[1].trim(), start: match.index, end: match.index + match[0].length })
  }

  return commands.sort((a, b) => a.start - b.start)
}

// Parse Aider-style SEARCH/REPLACE blocks inside an EDIT_FILE body
interface EditBlock {
  search: string
  replace: string
}

function parseEditBlocks(body: string): EditBlock[] {
  const blocks: EditBlock[] = []
  const re = /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n?={5,}\r?\n([\s\S]*?)\r?\n?>>>>>>> REPLACE/g
  let match
  while ((match = re.exec(body)) !== null) {
    blocks.push({ search: match[1], replace: match[2] })
  }
  return blocks
}

// Apply SEARCH/REPLACE blocks sequentially. Each SEARCH must match the
// file exactly once; CRLF files get an EOL-normalized retry so edits
// don't fail just because the model emitted LF line endings.
function applyEditBlocks(
  content: string,
  blocks: EditBlock[]
): { content?: string; error?: string } {
  if (blocks.length === 0) {
    return { error: 'no SEARCH/REPLACE blocks found' }
  }
  const fileEol = content.includes('\r\n') ? '\r\n' : '\n'
  let out = content
  for (let i = 0; i < blocks.length; i++) {
    let search = blocks[i].search
    let replace = blocks[i].replace
    let idx = out.indexOf(search)
    if (idx === -1 && fileEol === '\r\n') {
      search = search.replace(/\n/g, '\r\n')
      replace = replace.replace(/\n/g, '\r\n')
      idx = out.indexOf(search)
    }
    if (idx === -1) {
      return { error: `SEARCH block #${i + 1} not found in the file (re-read the file and retry)` }
    }
    if (out.indexOf(search, idx + 1) !== -1) {
      return { error: `SEARCH block #${i + 1} matches multiple locations - include more surrounding context` }
    }
    out = out.slice(0, idx) + replace + out.slice(idx + search.length)
  }
  return { content: out }
}

// Parse and execute file commands from AI response.
// Reads/lists run immediately; writes are collected and held until the
// user approves them via the approval callback.
// Returns display text (commands replaced by readable notes) and
// results to send back to the model so it can continue its work.
async function parseAndExecuteFileCommands(
  response: string,
  requestApproval: (edits: FileEdit[]) => Promise<FileEdit[] | null>,
  requestCommandApproval: (commands: string[]) => Promise<string[] | null>,
  runCommandAndWait: (command: string) => Promise<RunResult>
): Promise<CommandExecutionResult> {
  const commands = findFileCommands(response)
  if (commands.length === 0) {
    return { display: response, feedback: [], needsContinuation: false }
  }
  if (!window.electronAPI) {
    return { display: response + '\n\n(Error: Electron API not available)', feedback: [], needsContinuation: false }
  }

  const notes: (string | null)[] = new Array(commands.length).fill(null)
  const feedback: string[] = []
  const checkpoint: { path: string; prevContent: string; existed: boolean }[] = []
  let needsContinuation = false
  const pendingWrites: { index: number; path: string; arg: string; body: string }[] = []
  const pendingEdits: { index: number; path: string; arg: string; body: string }[] = []
  const pendingRuns: { index: number; command: string }[] = []

  // First pass: run reads/lists, collect writes for approval
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    const resolved = resolveFilePath(cmd.arg)

    if (cmd.type === 'write') {
      if (resolved.error || !resolved.path) {
        notes[i] = `⚠️ ${i18nService.t('Rejected write to')} ${cmd.arg}: ${resolved.error}`
        feedback.push(`WRITE_FILE ${cmd.arg}: rejected - ${resolved.error}`)
        needsContinuation = true
      } else {
        pendingWrites.push({ index: i, path: resolved.path, arg: cmd.arg, body: cmd.body ?? '' })
      }
    } else if (cmd.type === 'edit') {
      if (resolved.error || !resolved.path) {
        notes[i] = `⚠️ ${i18nService.t('Rejected edit to')} ${cmd.arg}: ${resolved.error}`
        feedback.push(`EDIT_FILE ${cmd.arg}: rejected - ${resolved.error}`)
        needsContinuation = true
      } else {
        pendingEdits.push({ index: i, path: resolved.path, arg: cmd.arg, body: cmd.body ?? '' })
      }
    } else if (cmd.type === 'run') {
      const project = projectService.getCurrentProject()
      if (!project?.isOpen) {
        notes[i] = `⚠️ ${i18nService.t('No project is open; cannot run commands.')}`
        feedback.push(`RUN_COMMAND ${cmd.arg}: failed - no project open`)
        needsContinuation = true
      } else {
        pendingRuns.push({ index: i, command: cmd.arg })
      }
    } else if (cmd.type === 'grep' || cmd.type === 'find') {
      // Content/path search across the whole project - no path resolution needed
      needsContinuation = true
      const project = projectService.getCurrentProject()
      if (!project?.isOpen) {
        notes[i] = `⚠️ ${i18nService.t('No project is open; cannot search.')}`
        feedback.push(`${cmd.type === 'grep' ? 'GREP' : 'FIND_FILES'} ${cmd.arg}: failed - no project open`)
        continue
      }
      try {
        if (cmd.type === 'grep') {
          const result = await window.electronAPI.searchFiles(project.rootPath, cmd.arg)
          if (result.success && result.matches) {
            notes[i] = `🔍 ${i18nService.t('Searched')} "${cmd.arg}": ${result.matches.length} ${i18nService.t('match(es)')}`
            const body = result.matches.map(m => `${m.file}:${m.line}: ${m.text}`).join('\n')
            feedback.push(`GREP ${cmd.arg} result (${result.matches.length} matches${result.truncated ? ', truncated' : ''}):\n${body || '(no matches)'}`)
          } else {
            notes[i] = `⚠️ ${i18nService.t('Search failed for')} "${cmd.arg}": ${result.error}`
            feedback.push(`GREP ${cmd.arg}: failed - ${result.error}`)
          }
        } else {
          const result = await window.electronAPI.findFiles(project.rootPath, cmd.arg)
          if (result.success && result.files) {
            notes[i] = `🔍 ${i18nService.t('Found')} ${result.files.length} ${i18nService.t('file(s) matching')} "${cmd.arg}"`
            feedback.push(`FIND_FILES ${cmd.arg} result (${result.files.length} files${result.truncated ? ', truncated' : ''}):\n${result.files.join('\n') || '(no matches)'}`)
          } else {
            notes[i] = `⚠️ ${i18nService.t('Find failed for')} "${cmd.arg}": ${result.error}`
            feedback.push(`FIND_FILES ${cmd.arg}: failed - ${result.error}`)
          }
        }
      } catch (error) {
        notes[i] = `⚠️ ${i18nService.t('Search error')}: ${error}`
        feedback.push(`${cmd.type.toUpperCase()} ${cmd.arg}: failed - ${error}`)
      }
    } else if (cmd.type === 'read') {
      needsContinuation = true
      const filePath = resolved.path || cmd.arg
      try {
        const result = await window.electronAPI.readFile(filePath)
        if (result.success) {
          console.log(`File read: ${filePath}`)
          notes[i] = `📖 ${i18nService.t('Read file')}: ${filePath}`
          feedback.push(`READ_FILE ${filePath} result:\n${result.content}`)
        } else {
          console.error(`Failed to read file: ${filePath}`, result.error)
          notes[i] = `⚠️ ${i18nService.t('Error reading file')} ${filePath}: ${result.error}`
          feedback.push(`READ_FILE ${filePath}: failed - ${result.error}`)
        }
      } catch (error) {
        console.error(`Error reading file: ${filePath}`, error)
        notes[i] = `⚠️ ${i18nService.t('Error reading file')} ${filePath}: ${error}`
        feedback.push(`READ_FILE ${filePath}: failed - ${error}`)
      }
    } else {
      needsContinuation = true
      const directoryPath = resolved.path || cmd.arg
      try {
        const result = await window.electronAPI.readDirectory(directoryPath)
        if (result.success && result.items) {
          console.log(`Files listed: ${directoryPath}`)
          notes[i] = `📁 ${i18nService.t('Listed files in')}: ${directoryPath}`
          const fileList = result.items.map((item: any) =>
            `${item.isDirectory ? 'DIR' : 'FILE'}: ${item.name}`
          ).join('\n')
          feedback.push(`LIST_FILES ${directoryPath} result:\n${fileList}`)
        } else {
          console.error(`Failed to list files: ${directoryPath}`, result.error)
          notes[i] = `⚠️ ${i18nService.t('Error listing files')} ${directoryPath}: ${result.error}`
          feedback.push(`LIST_FILES ${directoryPath}: failed - ${result.error}`)
        }
      } catch (error) {
        console.error(`Error listing files: ${directoryPath}`, error)
        notes[i] = `⚠️ ${i18nService.t('Error listing files')} ${directoryPath}: ${error}`
        feedback.push(`LIST_FILES ${directoryPath}: failed - ${error}`)
      }
    }
  }

  // Ask the user to approve pending writes/edits before touching the disk
  if (pendingWrites.length > 0 || pendingEdits.length > 0) {
    interface PlanItem {
      index: number
      path: string
      arg: string
      kind: 'write' | 'edit'
      body: string
      existed: boolean
    }
    const items: PlanItem[] = [
      ...pendingWrites.map(w => ({ ...w, kind: 'write' as const, existed: false })),
      ...pendingEdits.map(e => ({ ...e, kind: 'edit' as const, existed: true })),
    ].sort((a, b) => a.index - b.index)

    const edits: FileEdit[] = []
    const planByEdit = new Map<FileEdit, PlanItem>()

    for (const item of items) {
      const label = item.kind === 'write' ? 'WRITE_FILE' : 'EDIT_FILE'
      let oldContent = ''
      let readable = true
      try {
        const result = await window.electronAPI.readFile(item.path)
        if (result.success) oldContent = result.content ?? ''
        else readable = false
      } catch {
        // New file - oldContent stays empty (writes); edits require readability
      }

      item.existed = readable
      if (item.kind === 'write') {
        const edit: FileEdit = { filePath: item.path, oldContent, newContent: item.body }
        edits.push(edit)
        planByEdit.set(edit, item)
      } else {
        if (!readable) {
          notes[item.index] = `⚠️ ${i18nService.t('Cannot edit')} ${item.arg}: ${i18nService.t('file not found or unreadable')}`
          feedback.push(`${label} ${item.arg}: failed - file not found or unreadable. If you intended to create it, use // WRITE_FILE: with the full content instead.`)
          needsContinuation = true
          continue
        }
        const applied = applyEditBlocks(oldContent, parseEditBlocks(item.body))
        if (applied.error) {
          notes[item.index] = `⚠️ ${i18nService.t('Edit failed for')} ${item.arg}: ${applied.error}`
          feedback.push(`${label} ${item.arg}: failed - ${applied.error}`)
          needsContinuation = true
          continue
        }
        const edit: FileEdit = { filePath: item.path, oldContent, newContent: applied.content! }
        edits.push(edit)
        planByEdit.set(edit, item)
      }
    }

    // All edits may have failed to apply - don't open an empty modal
    const approved = edits.length > 0 ? await requestApproval(edits) : []
    const approvedSet = new Set(approved ?? [])

    for (const edit of edits) {
      const item = planByEdit.get(edit)!
      const label = item.kind === 'write' ? 'WRITE_FILE' : 'EDIT_FILE'
      if (!approvedSet.has(edit)) {
        notes[item.index] = `⏭️ ${i18nService.t('Skipped (rejected by user)')}: ${item.path}`
        feedback.push(`${label} ${item.path}: rejected by user`)
        needsContinuation = true
        continue
      }
      try {
        // Snapshot before writing so the user can roll this back later
        checkpoint.push({ path: item.path, prevContent: edit.oldContent, existed: item.existed })
        // Go through projectService so the file content cache stays in sync
        await projectService.writeFile(item.path, edit.newContent)
        console.log(`File written: ${item.path}`)
        notes[item.index] = item.kind === 'write'
          ? `✅ ${i18nService.t('Wrote file')}: ${item.path}`
          : `✅ ${i18nService.t('Edited file')}: ${item.path}`
        feedback.push(`${label} ${item.path}: success`)

        // Emit event to refresh explorer (and editor if the file is open)
        window.dispatchEvent(new CustomEvent('file-created', {
          detail: { filePath: item.path }
        }))
      } catch (error) {
        console.error(`Error writing file: ${item.path}`, error)
        notes[item.index] = `⚠️ ${i18nService.t('Error writing file')} ${item.path}: ${error}`
        feedback.push(`${label} ${item.path}: failed - ${error}`)
        needsContinuation = true
      }
    }
  }

  // Ask the user to approve shell commands before running them
  if (pendingRuns.length > 0) {
    const approvedCommands = await requestCommandApproval(pendingRuns.map(r => r.command))
    const approvedSet = new Set(approvedCommands ?? [])

    for (const r of pendingRuns) {
      if (!approvedSet.has(r.command)) {
        notes[r.index] = `⏭️ ${i18nService.t('Skipped (rejected by user)')}: ${r.command}`
        feedback.push(`RUN_COMMAND ${r.command}: rejected by user`)
        needsContinuation = true
        continue
      }
      try {
        const result = await runCommandAndWait(r.command)
        const tail = stripAnsi(result.output).slice(-8000) // errors usually appear at the end
        const statusText = result.opened
          ? i18nService.t('opened')
          : result.timedOut
            ? i18nService.t('still running after timeout (visible in the Terminal panel; the user can type stdin input there if the program is interactive)')
            : `${i18nService.t('exit code')} ${result.exitCode}`
        notes[r.index] = `▶️ ${i18nService.t('Ran')}: ${r.command} (${statusText})`
        feedback.push(
          `RUN_COMMAND ${r.command} result - ${statusText}:\n${tail || '(no output)'}`
        )
        needsContinuation = true
      } catch (error) {
        notes[r.index] = `⚠️ ${i18nService.t('Error running')} ${r.command}: ${error}`
        feedback.push(`RUN_COMMAND ${r.command}: failed - ${error}`)
        needsContinuation = true
      }
    }
  }

  // Rebuild display text: replace each command block with its readable note
  let display = ''
  let cursor = 0
  commands.forEach((cmd, i) => {
    display += response.slice(cursor, cmd.start)
    display += `\n${notes[i] ?? ''}\n`
    cursor = cmd.end
  })
  display += response.slice(cursor)

  return { display: display.trim(), feedback, needsContinuation, checkpoint }
}

// PTY output contains ANSI escape sequences - strip them before
// feeding terminal output back to the model.
const ANSI_REGEX = /[\u001b\u009b][\[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g
const stripAnsi = (s: string) => s.replace(ANSI_REGEX, '')

const Chat: React.FC<ChatProps> = ({ onOpenSettings }) => {
  const t = useT()
  // Chat is persisted per project (1:1). The component remounts on project
  // change via key in App.tsx, so mount-time load is sufficient.
  const projectPath = projectService.getCurrentProject()?.rootPath
  const [messages, setMessages] = useState<Message[]>(() => {
    if (!projectPath) return []
    return chatHistoryService.getConversation(projectPath)?.messages ?? []
  })
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isConfigured, setIsConfigured] = useState(false)
  const [currentModel, setCurrentModel] = useState<string>('')
  // Model pinned to the in-flight request (shown while generating)
  const [activeModel, setActiveModel] = useState<string>('')
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [pendingEdits, setPendingEdits] = useState<FileEdit[] | null>(null)
  const approvalResolverRef = useRef<((edits: FileEdit[] | null) => void) | null>(null)
  const [pendingCommands, setPendingCommands] = useState<string[] | null>(null)
  const commandResolverRef = useRef<((commands: string[] | null) => void) | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Live streaming bubble (separate from the committed message list)
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const streamedRef = useRef('')
  // Stack of pre-write snapshots - each entry rolls back one AI write batch
  const checkpointsRef = useRef<{ path: string; prevContent: string; existed: boolean }[][]>([])
  const [canRollback, setCanRollback] = useState(false)

  const handleRollback = async () => {
    const cp = checkpointsRef.current.pop()
    setCanRollback(checkpointsRef.current.length > 0)
    if (!cp || !window.electronAPI) return
    const project = projectService.getCurrentProject()
    for (const f of cp) {
      try {
        if (f.existed) {
          await projectService.writeFile(f.path, f.prevContent)
        } else if (project) {
          // The AI created this file - remove it
          await window.electronAPI.deleteFile(project.rootPath, f.path)
        }
        window.dispatchEvent(new CustomEvent('file-created', { detail: { filePath: f.path } }))
      } catch (error) {
        console.error(`Rollback failed for ${f.path}:`, error)
      }
    }
    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: `↩️ Rolled back ${cp.length} file(s) changed by the last AI operation.`,
      timestamp: Date.now(),
    }])
  }

  // Pause the agent loop until the user approves or rejects file writes.
  // Resolves with the approved edits (subset allowed) or null on reject-all.
  const requestApproval = (edits: FileEdit[]): Promise<FileEdit[] | null> => {
    return new Promise((resolve) => {
      approvalResolverRef.current = resolve
      setPendingEdits(edits)
    })
  }

  const resolveApproval = (edits: FileEdit[] | null) => {
    approvalResolverRef.current?.(edits)
    approvalResolverRef.current = null
    setPendingEdits(null)
  }

  const handleRejectOneEdit = (edit: FileEdit) => {
    if (!pendingEdits) return
    const next = pendingEdits.filter(e => e !== edit)
    if (next.length === 0) {
      resolveApproval([]) // Everything rejected individually
    } else {
      setPendingEdits(next)
    }
  }

  // Same approval pattern for shell commands
  const requestCommandApproval = (commands: string[]): Promise<string[] | null> => {
    return new Promise((resolve) => {
      commandResolverRef.current = resolve
      setPendingCommands(commands)
    })
  }

  const resolveCommandApproval = (commands: string[] | null) => {
    commandResolverRef.current?.(commands)
    commandResolverRef.current = null
    setPendingCommands(null)
  }

  const handleRejectOneCommand = (command: string) => {
    if (!pendingCommands) return
    const next = pendingCommands.filter(c => c !== command)
    if (next.length === 0) {
      resolveCommandApproval([])
    } else {
      setPendingCommands(next)
    }
  }

  // Run a shell command in the project root and wait for it to exit.
  // Long-running commands (npm start, docker) resolve with timedOut=true
  // and keep running - the user can watch/stop them in the Terminal panel.
  const RUN_COMMAND_TIMEOUT_MS = 60_000
  const runCommandAndWait = (command: string): Promise<RunResult> => {
    return new Promise<RunResult>(async (resolve, reject) => {
      const project = projectService.getCurrentProject()
      if (!project?.isOpen || !window.electronAPI) {
        reject(new Error(i18nService.t('No project is open')))
        return
      }

      // `start` inside a transient ConPTY cmd can exit before the launched
      // app appears. Open documents/URLs through the OS shell instead.
      const startMatch = command.match(/^\s*(?:cmd(?:\.exe)?\s+\/c\s+)?start\s+(.*)$/i)
      if (startMatch) {
        const target = startMatch[1].trim().replace(/^""\s*/, '').replace(/^"|"$/g, '')
        if (target) {
          const isUrl = /^https?:\/\//i.test(target)
          if ((isUrl && !window.electronAPI.openExternal) || (!isUrl && !window.electronAPI.openPath)) {
            reject(new Error(i18nService.t('Cannot open target - restart Forger to pick up the update')))
            return
          }
          try {
            const res = isUrl
              ? await window.electronAPI.openExternal(target)
              : await window.electronAPI.openPath(project.rootPath, target)
            if (res.success) {
              resolve({ output: '', exitCode: 0, timedOut: false, opened: true })
            } else {
              reject(new Error(res.error || i18nService.t('Failed to open')))
            }
          } catch (e) {
            reject(e)
          }
          return
        }
      }

      const result = await window.electronAPI.runCommand(project.rootPath, command)
      if (!result.success || !result.id) {
        reject(new Error(result.error || i18nService.t('Failed to start process')))
        return
      }
      const id = result.id

      // Show the spawned process in the Terminal panel too
      window.dispatchEvent(new CustomEvent('terminal-spawned', { detail: { id, command } }))

      let output = ''
      const offOutput = window.electronAPI.onTerminalOutput((payload) => {
        if (payload.id === id) output += payload.data
      })
      const offExit = window.electronAPI.onTerminalExit((payload) => {
        if (payload.id !== id) return
        cleanup()
        resolve({ output, exitCode: payload.code, timedOut: false })
      })
      const timer = setTimeout(() => {
        cleanup()
        resolve({ output, exitCode: null, timedOut: true })
      }, RUN_COMMAND_TIMEOUT_MS)

      const cleanup = () => {
        offOutput()
        offExit()
        clearTimeout(timer)
      }
    })
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Persist conversation whenever it changes
  useEffect(() => {
    if (projectPath && messages.length > 0) {
      chatHistoryService.saveConversation(projectPath, messages)
    }
  }, [messages, projectPath])

  useEffect(() => {
    const refreshLlm = () => {
      setIsConfigured(llmService.isConfigured())

      if (configService.getLlmProvider() === 'ollama') {
        setCurrentModel(`ollama:${configService.getOllamaModel()}`)
        return
      }
      const savedModel = configService.getGeminiModel()
      if (savedModel === 'custom') {
        setCurrentModel(configService.getGeminiCustomModel() || 'Custom')
      } else {
        setCurrentModel(savedModel || 'gemini-3.8-flash')
      }
    }
    refreshLlm()
    // Settings can switch provider/model while the chat stays mounted
    window.addEventListener('forger:llm-changed', refreshLlm)
    return () => window.removeEventListener('forger:llm-changed', refreshLlm)
  }, [])

  const handleSend = async () => {
    if (!input.trim()) return

    if (!isConfigured) {
      onOpenSettings()
      return
    }

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    await sendToAI(userMessage, messages)
  }

  // Resend the last user message and discard the assistant turns after it
  const handleRetry = async () => {
    if (isLoading || !isConfigured) return

    let lastUserIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex < 0) return

    const retryMessage = messages[lastUserIndex]
    const base = messages.slice(0, lastUserIndex)
    setMessages([...base, retryMessage])
    await sendToAI(retryMessage, base)
  }

  const sendToAI = async (userMessage: Message, historyBase: Message[]) => {
    setIsLoading(true)

    // Pin provider+model for this whole run: changing Settings while a
    // response is generating must not retarget later agent-loop steps or
    // relabel the in-flight reply.
    const runProvider = configService.getLlmProvider()
    const runModelName = runProvider === 'ollama'
      ? configService.getOllamaModel()
      : configService.getGeminiModel() === 'custom'
        ? configService.getGeminiCustomModel()
        : configService.getGeminiModel()
    const runLabel = currentModel
    const llmPin = { provider: runProvider, model: runModelName || undefined }
    setActiveModel(runLabel)

    // Create abort controller for this request
    const controller = new AbortController()
    setAbortController(controller)

    try {
      // Get project context dynamically
      let context: string | undefined
      try {
        const projectContext = await projectService.getProjectContext()
        const project = projectService.getCurrentProject()
        if (project && project.isOpen) {
          const header = `Project: ${project.name}\nProject root: ${project.rootPath}`
          context = projectContext.length > 0 ? `${header}\n\n${projectContext}` : header
        } else {
          context = projectContext.length > 0 ? projectContext : undefined
        }
        console.log('Project context loaded:', context ? 'Yes' : 'No')
      } catch (projectError) {
        console.warn('Failed to get project context:', projectError)
        context = undefined
      }
      
      // Agent loop: the AI may issue file commands (READ_FILE / LIST_FILES)
      // whose results it needs before it can continue. Execute the commands,
      // feed the results back to the model, and repeat until the model
      // responds without commands or we hit the step limit.
      const MAX_STEPS = 6
      // Feed raw model output as history - display notes like "Ran: ..."
      // are UI decoration, and small models imitate them as fake output.
      // Legacy messages saved before rawContent existed get their note
      // lines stripped instead.
      const historyForRequest: Message[] = [
        ...historyBase.map((m) => ({
          ...m,
          content: m.rawContent ?? (m.role === 'assistant' ? stripNoteLines(m.content) : m.content),
        })),
        userMessage,
      ]
      let currentInput = userMessage.content
      let lastStepRanCommands = false

      // Streaming (Ollama path): deltas accumulate into a live bubble
      // rendered below the message list. On completion the parsed display
      // becomes a normal committed message.
      const makeStreamHandler = () => {
        streamedRef.current = ''
        const onDelta = (delta: string) => {
          streamedRef.current += delta
          setStreamingText(streamedRef.current)
        }
        return { onDelta, getStreamed: () => streamedRef.current }
      }

      for (let step = 0; step < MAX_STEPS; step++) {
        if (controller.signal.aborted) break

        const { onDelta, getStreamed } = makeStreamHandler()
        const callStart = performance.now()
        const response = await llmService.sendMessage(currentInput, context, historyForRequest, onDelta, controller.signal, llmPin)
        const latencyMs = Math.round(performance.now() - callStart)
        const { display, feedback, needsContinuation, checkpoint } = await parseAndExecuteFileCommands(response, requestApproval, requestCommandApproval, runCommandAndWait)
        setStreamingText(null)
        if (checkpoint && checkpoint.length > 0) {
          checkpointsRef.current.push(checkpoint)
          setCanRollback(true)
        }
        lastStepRanCommands = feedback.length > 0

        const finalText = display || getStreamed()
        if (finalText) {
          const assistantMessage: Message = {
            role: 'assistant',
            content: finalText,
            timestamp: Date.now(),
            latencyMs,
            model: runLabel || undefined,
            rawContent: response,
          }
          setMessages((prev) => [...prev, assistantMessage])
        }

        historyForRequest.push({ role: 'assistant', content: response, timestamp: Date.now() })

        // No command results the AI needs -> the AI is done
        if (!needsContinuation) break

        currentInput =
          `Command execution results:\n${feedback.join('\n\n')}\n\n` +
          `Continue with the user's request. If you have enough information, ` +
          `perform the requested file edit or give your final answer now.`
      }

      // If the last step executed commands (e.g. writes), the visible reply is
      // only command notes like "Wrote file: ..." - ask the model for a
      // closing answer addressed to the user.
      if (lastStepRanCommands && !controller.signal.aborted) {
        const summaryInput =
          `The file operations completed. Reply to the user with a brief summary ` +
          `of what you did, in the same language as the user's request. ` +
          `Do not emit any file commands.`
        historyForRequest.push({ role: 'user', content: summaryInput, timestamp: Date.now() })
        const { onDelta: onSummaryDelta, getStreamed: getSummaryStreamed } = makeStreamHandler()
        const summaryStart = performance.now()
        const summary = await llmService.sendMessage(summaryInput, context, historyForRequest, onSummaryDelta, controller.signal, llmPin)
        const summaryLatencyMs = Math.round(performance.now() - summaryStart)
        const { display: summaryDisplay } = await parseAndExecuteFileCommands(summary, requestApproval, requestCommandApproval, runCommandAndWait)
        setStreamingText(null)
        const summaryText = summaryDisplay || getSummaryStreamed()
        if (summaryText) {
          setMessages((prev) => [...prev, {
            role: 'assistant',
            content: summaryText,
            timestamp: Date.now(),
            latencyMs: summaryLatencyMs,
            model: runLabel || undefined,
            rawContent: summary,
          }])
        }
      }
      
    } catch (error) {
      console.error('Error sending message:', error)
      // User-cancelled: keep whatever was streamed so far, no error message
      if (!controller.signal.aborted) {
        const errorMessage: Message = {
          role: 'assistant',
          content: `${i18nService.t('Error')}: ${error instanceof Error ? error.message : i18nService.t('Failed to get response')}`,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, errorMessage])
      } else if (streamedRef.current) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: streamedRef.current,
          timestamp: Date.now(),
          model: runLabel || undefined,
        }])
      }
      setStreamingText(null)
      streamedRef.current = ''
    } finally {
      setIsLoading(false)
      setAbortController(null)
      setActiveModel('')
    }
  }

  const handleCancel = () => {
    // If approval dialogs are open, treat cancel as reject-all
    resolveApproval(null)
    resolveCommandApproval(null)
    if (abortController) {
      abortController.abort()
      setAbortController(null)
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat">
      <div className="chat-header">
        <div className="chat-title">
          <h3>{t('AI Chat')}</h3>
          {currentModel && (
            <span className="model-badge" title={`Current model: ${currentModel}`}>
              {currentModel}
            </span>
          )}
        </div>
        {canRollback && (
          <button
            className="rollback-button"
            onClick={handleRollback}
            title={t('Undo the last AI file changes')}
          >
            ↩ {t('Rollback')}
          </button>
        )}
        <button className="settings-button" onClick={onOpenSettings} title={t('Settings')}>
          ⚙️
        </button>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <h4>{t('Welcome to AI Chat')}</h4>
            <p>
              {isConfigured 
                ? t('Ask me anything about your code')
                : t('Please configure your Gemini API key in settings to start chatting')}
            </p>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`chat-message ${message.role}`}
          >
            <div className="message-content">
              <div className="message-role">
                {message.role}
                {message.role === 'assistant' && message.model && ` (${message.model})`}
                {message.role === 'assistant' && index === messages.length - 1 && !isLoading && (
                  <button
                    className="retry-button"
                    onClick={handleRetry}
                    title={t('Regenerate response')}
                  >
                    ↻
                  </button>
                )}
              </div>
              <div className="message-text">{message.content}</div>
              {message.latencyMs != null && (
                <div className="message-latency">({formatLatency(message.latencyMs)})</div>
              )}
            </div>
          </div>
        ))}
        {streamingText && (
          <div className="chat-message assistant">
            <div className="message-content">
              <div className="message-role">assistant{(activeModel || currentModel) && ` (${activeModel || currentModel})`}</div>
              <div className="message-text">{streamingText}</div>
            </div>
          </div>
        )}
        {isLoading && (
          <div className="chat-message assistant">
            <div className="message-content">
              <div className="message-role">assistant{(activeModel || currentModel) && ` (${activeModel || currentModel})`}</div>
              <div className="message-text loading">
                <span className="loading-dots">{t('Generating response')}</span>
                <button 
                  className="cancel-button" 
                  onClick={handleCancel}
                  title={t('Cancel request')}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isConfigured ? t('Type your message...') : t('Configure API key in settings to start chatting')}
          rows={3}
          disabled={isLoading || !isConfigured}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim() || !isConfigured}
          className="send-button"
        >
          {isConfigured ? t('Send') : t('Configure API Key')}
        </button>
      </div>
      {pendingEdits && pendingEdits.length > 0 && (
        <FileEditApproval
          edits={pendingEdits}
          onApprove={resolveApproval}
          onReject={() => resolveApproval(null)}
          onRejectOne={handleRejectOneEdit}
        />
      )}
      {pendingCommands && pendingCommands.length > 0 && (
        <CommandApproval
          commands={pendingCommands}
          onApprove={resolveCommandApproval}
          onReject={() => resolveCommandApproval(null)}
          onRejectOne={handleRejectOneCommand}
        />
      )}
    </div>
  )
}

export default Chat
