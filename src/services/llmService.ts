import { configService } from './configService'
import { geminiService } from './geminiService'
import { ollamaService } from './ollamaService'

// Pins a request to the provider/model captured when the user hit Send.
// Without it, changing Settings mid-generation would silently retarget
// later agent-loop steps to the new provider/model.
export interface LlmPin {
  provider?: string
  model?: string
}

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
    onDelta?: (delta: string) => void,
    signal?: AbortSignal,
    pin?: LlmPin,
  ): Promise<string> {
    const provider = pin?.provider ?? configService.getLlmProvider()
    return provider === 'ollama'
      ? ollamaService.sendMessage(message, context, history, onDelta, signal, pin?.model)
      : geminiService.sendMessage(message, context, history, pin?.model)
  },
}
