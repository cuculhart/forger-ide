import { configService } from './configService'
import { AGENT_SYSTEM_PROMPT } from './agentPrompt'

// Local LLM via Ollama's OpenAI-compatible endpoint (no extra deps).
// Same text-based file-command protocol as the Gemini path.
class OllamaService {
  private getBaseUrl(): string {
    return (configService.getOllamaBaseUrl() || 'http://localhost:11434').replace(/\/+$/, '')
  }

  private getModel(): string {
    return configService.getOllamaModel() || 'gemma4:e4b'
  }

  isConfigured(): boolean {
    return true // local - no key needed; failures surface at request time
  }

  // Model names installed in Ollama (for the Settings dropdown)
  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/tags`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.models || []).map((m: any) => m.name).filter(Boolean)
    } catch {
      return []
    }
  }

  async sendMessage(message: string, context?: string, history: Array<{ role: string; content: string }> = []): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: AGENT_SYSTEM_PROMPT.trim() },
    ]

    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    messages.push({
      role: 'user',
      content: context ? `Context:\n${context}\n\nUser message:\n${message}` : message,
    })

    let res: Response
    try {
      res = await fetch(`${this.getBaseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.getModel(),
          messages,
          stream: false,
        }),
      })
    } catch (error: any) {
      throw new Error(
        `Cannot reach Ollama at ${this.getBaseUrl()} - is Ollama running? (${error.message || error})`,
      )
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Ollama error ${res.status}: ${body.slice(0, 300) || res.statusText}`)
    }

    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text) {
      throw new Error('Ollama returned an empty response')
    }
    return text
  }
}

export const ollamaService = new OllamaService()
