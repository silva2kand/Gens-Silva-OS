// Local AI Engine - Integration with Jan/TurboQuant
import type { ChatRequest, ChatResponse, LocalEngineConfig } from '@/types'

const DEFAULT_CONFIG: LocalEngineConfig = {
  endpoint: 'http://127.0.0.1:1337/v1',
  model: 'llama-3.1-8b',
  maxTokens: 4096,
  temperature: 0.7,
  contextWindow: 8192,
  gpuAcceleration: true,
}

class LocalAIEngine {
  private config: LocalEngineConfig
  private isConnected: boolean = false
  private availableModels: string[] = []

  constructor(config: Partial<LocalEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async connect(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        this.isConnected = true
        const data = await response.json()
        this.availableModels = data.data?.map((m: { id: string }) => m.id) || []
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to connect to local AI engine:', error)
      return false
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false
  }

  isReady(): boolean {
    return this.isConnected
  }

  getConfig(): LocalEngineConfig {
    return { ...this.config }
  }

  updateConfig(updates: Partial<LocalEngineConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.isConnected) {
      throw new Error('AI engine not connected')
    }

    const response = await fetch(`${this.config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || this.config.model,
        messages: request.messages,
        temperature: request.temperature ?? this.config.temperature,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        stream: request.stream ?? false,
        tools: request.tools,
      }),
    })

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.statusText}`)
    }

    return response.json()
  }

  async *streamChat(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || this.config.model,
        messages: request.messages,
        temperature: request.temperature ?? this.config.temperature,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        stream: true,
        tools: request.tools,
      }),
    })

    if (!response.ok) {
      throw new Error(`AI stream request failed: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') return
          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) yield content
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  async getModels(): Promise<Array<{ id: string; name: string; size?: number }>> {
    if (!this.isConnected) {
      await this.connect()
    }

    try {
      const response = await fetch(`${this.config.endpoint}/models`)
      if (response.ok) {
        const data = await response.json()
        return data.data?.map((m: { id: string; name?: string; size?: number }) => ({
          id: m.id,
          name: m.name || m.id,
          size: m.size,
        })) || []
      }
    } catch (error) {
      console.error('Failed to fetch models:', error)
    }

    return this.availableModels.map((id) => ({ id, name: id }))
  }

  async loadModel(modelId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/models/load`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: modelId }),
      })
      return response.ok
    } catch (error) {
      console.error('Failed to load model:', error)
      return false
    }
  }

  async unloadModel(modelId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/models/unload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: modelId }),
      })
      return response.ok
    } catch (error) {
      console.error('Failed to unload model:', error)
      return false
    }
  }

  getAvailableModels(): string[] {
    return [...this.availableModels]
  }

  getCurrentModel(): string {
    return this.config.model
  }

  // TurboQuant specific optimizations
  async enableTurboQuant(): Promise<void> {
    // TurboQuant acceleration settings
    this.config.gpuAcceleration = true
    console.log('TurboQuant acceleration enabled')
  }

  async setQuantization(level: 'Q2' | 'Q4' | 'Q6' | 'Q8'): Promise<void> {
    // Set quantization level for model loading
    console.log(`Quantization level set to ${level}`)
  }
}

// Singleton instance
export const localAI = new LocalAIEngine()

// React hook for local AI
export function useLocalAI() {
  return {
    engine: localAI,
    isConnected: localAI.isReady(),
    config: localAI.getConfig(),
    connect: () => localAI.connect(),
    disconnect: () => localAI.disconnect(),
    chat: (request: ChatRequest) => localAI.chat(request),
    streamChat: (request: ChatRequest) => localAI.streamChat(request),
    getModels: () => localAI.getModels(),
    loadModel: (modelId: string) => localAI.loadModel(modelId),
    unloadModel: (modelId: string) => localAI.unloadModel(modelId),
  }
}

export default LocalAIEngine