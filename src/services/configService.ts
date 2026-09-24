export interface RecentProject {
  name: string
  path: string
  openCount: number
  lastOpenedAt: number
}

const RECENT_PROJECTS_KEY = 'recent_projects'
const MAX_RECENT_PROJECTS = 10

export type ThemeMode = 'system' | 'dark' | 'light' | 'quiet'

// 'tree' = send only the file list (AI fetches contents via tools).
// 'full' = send scored file contents up to the token budget (legacy).
export type ContextMode = 'tree' | 'full'

// 'gemini' = Google Gemini API (or LiteLLM proxy). 'ollama' = local Ollama.
export type LlmProvider = 'gemini' | 'ollama'

class ConfigService {
  private config: Map<string, string> = new Map()

  constructor() {
    this.loadConfig()
  }

  private loadConfig() {
    // Load from localStorage
    const apiKey = localStorage.getItem('gemini_api_key')
    const model = localStorage.getItem('gemini_model')
    const customModel = localStorage.getItem('gemini_custom_model')
    const proxyUrl = localStorage.getItem('llm_proxy_url')
    const theme = localStorage.getItem('theme')
    const uiFontFamily = localStorage.getItem('ui_font_family')
    const uiFontSize = localStorage.getItem('ui_font_size')
    const contextMode = localStorage.getItem('context_mode')
    const contextMaxFiles = localStorage.getItem('context_max_files')
    const llmProvider = localStorage.getItem('llm_provider')
    const ollamaBaseUrl = localStorage.getItem('ollama_base_url')
    const ollamaModel = localStorage.getItem('ollama_model')
    const language = localStorage.getItem('language')

    if (apiKey) this.config.set('GEMINI_API_KEY', apiKey)
    if (model) this.config.set('GEMINI_MODEL', model)
    if (customModel) this.config.set('GEMINI_CUSTOM_MODEL', customModel)
    if (proxyUrl) this.config.set('LLM_PROXY_URL', proxyUrl)
    if (theme) this.config.set('THEME', theme)
    if (uiFontFamily) this.config.set('UI_FONT_FAMILY', uiFontFamily)
    if (uiFontSize) this.config.set('UI_FONT_SIZE', uiFontSize)
    if (contextMode) this.config.set('CONTEXT_MODE', contextMode)
    if (contextMaxFiles) this.config.set('CONTEXT_MAX_FILES', contextMaxFiles)
    if (llmProvider) this.config.set('LLM_PROVIDER', llmProvider)
    if (ollamaBaseUrl) this.config.set('OLLAMA_BASE_URL', ollamaBaseUrl)
    if (ollamaModel) this.config.set('OLLAMA_MODEL', ollamaModel)
    if (language) this.config.set('LANGUAGE', language)
  }

  get(key: string): string | undefined {
    return this.config.get(key)
  }

  set(key: string, value: string): void {
    this.config.set(key, value)
    
    // Sync to localStorage
    if (key === 'GEMINI_API_KEY') {
      localStorage.setItem('gemini_api_key', value)
    } else if (key === 'GEMINI_MODEL') {
      localStorage.setItem('gemini_model', value)
    } else if (key === 'GEMINI_CUSTOM_MODEL') {
      localStorage.setItem('gemini_custom_model', value)
    } else if (key === 'LLM_PROXY_URL') {
      localStorage.setItem('llm_proxy_url', value)
    } else if (key === 'THEME') {
      localStorage.setItem('theme', value)
    } else if (key === 'UI_FONT_FAMILY') {
      localStorage.setItem('ui_font_family', value)
    } else if (key === 'UI_FONT_SIZE') {
      localStorage.setItem('ui_font_size', value)
    } else if (key === 'CONTEXT_MODE') {
      localStorage.setItem('context_mode', value)
    } else if (key === 'CONTEXT_MAX_FILES') {
      localStorage.setItem('context_max_files', value)
    } else if (key === 'LLM_PROVIDER') {
      localStorage.setItem('llm_provider', value)
    } else if (key === 'OLLAMA_BASE_URL') {
      localStorage.setItem('ollama_base_url', value)
    } else if (key === 'OLLAMA_MODEL') {
      localStorage.setItem('ollama_model', value)
    } else if (key === 'LANGUAGE') {
      localStorage.setItem('language', value)
    }
  }

  getGeminiApiKey(): string | undefined {
    return this.get('GEMINI_API_KEY')
  }

  getGeminiModel(): string {
    return this.get('GEMINI_MODEL') || 'gemini-3.8-flash'
  }

  getGeminiCustomModel(): string | undefined {
    return this.get('GEMINI_CUSTOM_MODEL')
  }

  getLlmProxyUrl(): string | undefined {
    return this.get('LLM_PROXY_URL')
  }

  setGeminiApiKey(apiKey: string): void {
    this.set('GEMINI_API_KEY', apiKey)
  }

  setGeminiModel(model: string): void {
    this.set('GEMINI_MODEL', model)
  }

  setGeminiCustomModel(customModel: string): void {
    this.set('GEMINI_CUSTOM_MODEL', customModel)
  }

  setLlmProxyUrl(proxyUrl: string): void {
    this.set('LLM_PROXY_URL', proxyUrl)
  }

  getTheme(): ThemeMode {
    const value = this.get('THEME')
    return value === 'dark' || value === 'light' || value === 'quiet' ? value : 'system'
  }

  setTheme(theme: ThemeMode): void {
    this.set('THEME', theme)
  }

  getUIFontFamily(): string | undefined {
    return this.get('UI_FONT_FAMILY')
  }

  setUIFontFamily(fontFamily: string): void {
    this.set('UI_FONT_FAMILY', fontFamily)
  }

  getUIFontSize(): number | undefined {
    const value = this.get('UI_FONT_SIZE')
    const size = value ? parseInt(value, 10) : NaN
    return Number.isFinite(size) && size > 0 ? size : undefined
  }

  setUIFontSize(fontSize: number): void {
    this.set('UI_FONT_SIZE', String(fontSize))
  }

  getRecentProjects(): RecentProject[] {
    try {
      const raw = localStorage.getItem(RECENT_PROJECTS_KEY)
      if (!raw) return []
      const list = JSON.parse(raw)
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }

  // Sorted by open count (most used first), then most recent
  addRecentProject(name: string, path: string): void {
    const list = this.getRecentProjects()
    const existing = list.find(p => p.path === path)
    if (existing) {
      existing.openCount += 1
      existing.lastOpenedAt = Date.now()
      existing.name = name
    } else {
      list.push({ name, path, openCount: 1, lastOpenedAt: Date.now() })
    }
    list.sort((a, b) => b.openCount - a.openCount || b.lastOpenedAt - a.lastOpenedAt)
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(list.slice(0, MAX_RECENT_PROJECTS)))
  }

  removeRecentProject(path: string): void {
    const list = this.getRecentProjects().filter(p => p.path !== path)
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(list))
  }

  getLlmProvider(): LlmProvider {
    return this.get('LLM_PROVIDER') === 'ollama' ? 'ollama' : 'gemini'
  }

  setLlmProvider(provider: LlmProvider): void {
    this.set('LLM_PROVIDER', provider)
  }

  getOllamaBaseUrl(): string {
    return this.get('OLLAMA_BASE_URL') || 'http://localhost:11434'
  }

  setOllamaBaseUrl(url: string): void {
    this.set('OLLAMA_BASE_URL', url)
  }

  getOllamaModel(): string {
    return this.get('OLLAMA_MODEL') || 'gemma4:e4b'
  }

  setOllamaModel(model: string): void {
    this.set('OLLAMA_MODEL', model)
  }

  getLanguage(): string {
    return this.get('LANGUAGE') || 'en'
  }

  setLanguage(code: string): void {
    this.set('LANGUAGE', code)
  }

  getContextMode(): ContextMode {
    return this.get('CONTEXT_MODE') === 'full' ? 'full' : 'tree'
  }

  setContextMode(mode: ContextMode): void {
    this.set('CONTEXT_MODE', mode)
  }

  getContextMaxFiles(): number {
    const value = parseInt(this.get('CONTEXT_MAX_FILES') || '', 10)
    return Number.isFinite(value) && value > 0 ? value : 2000
  }

  setContextMaxFiles(maxFiles: number): void {
    this.set('CONTEXT_MAX_FILES', String(maxFiles))
  }

  // Clears the Recent Projects list shown in the Explorer
  clearRecentProjects(): void {
    localStorage.removeItem(RECENT_PROJECTS_KEY)
  }

  // Session restore: reopen the last project/file after a reload
  getLastProjectPath(): string | undefined {
    return localStorage.getItem('last_project_path') || undefined
  }

  setLastProjectPath(path: string): void {
    if (path) {
      localStorage.setItem('last_project_path', path)
    } else {
      localStorage.removeItem('last_project_path')
    }
  }

  getLastOpenFile(): string | undefined {
    return localStorage.getItem('last_open_file') || undefined
  }

  setLastOpenFile(path: string): void {
    if (path) {
      localStorage.setItem('last_open_file', path)
    } else {
      localStorage.removeItem('last_open_file')
    }
  }

  clear(): void {
    this.config.clear()
    localStorage.removeItem('gemini_api_key')
    localStorage.removeItem('gemini_model')
    localStorage.removeItem('gemini_custom_model')
    localStorage.removeItem('llm_proxy_url')
  }
}

export const configService = new ConfigService()
