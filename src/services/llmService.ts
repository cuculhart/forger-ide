import { configService } from './configService'
import { geminiService } from './geminiService'
import { ollamaService } from './ollamaService'

// Provider router: the UI talks to llmService, which delegates to the
// configured backend. Both implement the same sendMessage contract.
export const llmService = {
  isConfigured(): boolean {
    return configService.getLlmProvider() === 'ollama'
      ? ollamaService.isConfigured()
      : geminiService.isConfigured()
  },

  sendMessage(
    message: string,
    context?: string,
    history: Array<{ role: string; content: string }> = [],
  ): Promise<string> {
    return configService.getLlmProvider() === 'ollama'
      ? ollamaService.sendMessage(message, context, history)
      : geminiService.sendMessage(message, context, history)
  },
}
