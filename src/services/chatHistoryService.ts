// Chat history persistence.
// Currently stores one conversation per project in localStorage (free tier /
// local-only usage). The store is structured as project -> Conversation[] so
// that multiple chat tabs (1:n) and a future server-side backend (paid tier)
// can be introduced without changing the data model.

export interface ChatMessageRecord {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  // Round-trip time of the LLM call that produced this message (ms)
  latencyMs?: number
  // Model that produced this response (e.g. "ollama:qwen3.5:4b")
  model?: string
  // Raw model output before command blocks became display notes (see Chat.tsx)
  rawContent?: string
}

export interface Conversation {
  id: string
  title?: string
  messages: ChatMessageRecord[]
  createdAt: number
  updatedAt: number
}

const STORE_KEY = 'chat_conversations'
const MAX_MESSAGES_PER_CONVERSATION = 200

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

function readStore(): Record<string, Conversation[]> {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, Conversation[]>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch (error) {
    console.warn('Failed to persist chat history:', error)
  }
}

class ChatHistoryService {
  // Returns the single conversation for a project (1:1 model).
  getConversation(projectPath: string): Conversation | null {
    const list = readStore()[normalizePath(projectPath)]
    return list && list.length > 0 ? list[0] : null
  }

  // Upserts the project's conversation. Under the 1:1 model the first
  // conversation slot is always used.
  saveConversation(projectPath: string, messages: ChatMessageRecord[]): void {
    const key = normalizePath(projectPath)
    const store = readStore()
    const list = store[key] || []
    const now = Date.now()
    const trimmed = messages.slice(-MAX_MESSAGES_PER_CONVERSATION)

    if (list.length > 0) {
      list[0] = { ...list[0], messages: trimmed, updatedAt: now }
    } else {
      list.push({ id: `conv_${now}`, messages: trimmed, createdAt: now, updatedAt: now })
    }

    store[key] = list
    writeStore(store)
  }

  clearConversation(projectPath: string): void {
    const key = normalizePath(projectPath)
    const store = readStore()
    if (store[key]) {
      delete store[key]
      writeStore(store)
    }
  }
}

export const chatHistoryService = new ChatHistoryService()
