import { useState, useRef, FormEvent, useEffect } from 'react'
import { useAppStore, useChatStore, useConnectorsStore, useModelsStore } from '@/stores'
import { cn, generateId } from '@/lib/utils'
import { executeAssistantTools, queueCompletionNotification, type AssistantToolMode } from '@/lib/assistant-tools'
import { appendFollowUpSuggestions, fixTamilOutput, isSafeForVoice, isTamilSpeech, loadVoiceSettings, splitDisplayChunks, splitVoiceChunks, voiceLanguageLabels } from '@/lib/response-enhancements'
import { speakChunksSequentially, stopSpeaking } from '@/lib/speech-playback'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  Send,
  Mic,
  Paperclip,
  Sparkles,
  ChevronDown,
  Loader2,
  Plus,
  Brain,
  BookOpen,
  FolderOpen,
  Files,
  Globe,
  CalendarRange,
  MessageSquarePlus,
  Video,
  CheckCircle2,
  Terminal,
  Plug,
  Lightbulb,
} from 'lucide-react'
import type { ChatMessage, ModelOption, ToolCall, ViewType } from '@/types'

type AiProvider = {
  id: string
  label: string
  active: boolean
  connected: boolean
  freeOnly: boolean
  model: string
  baseUrl: string
  connectUrl: string
}

type ProviderModel = {
  id: string
  label: string
  provider: string
  freeOnly: boolean
}

type SpeechRecognitionCtor = new () => {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type ChatStreamEvent = {
  eventType: 'token' | 'sentence_ready' | 'tool_started' | 'tool_finished' | 'approval_needed' | 'done' | 'error'
  runId: string
  agent: string
  text: string
  safeToSpeak: boolean
  done: boolean
  error?: string | null
}

export default function ChatInput() {
  const { setCurrentView } = useAppStore()
  const [input, setInput] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showProviderPicker, setShowProviderPicker] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [activeProviderId, setActiveProviderId] = useState('local')
  const [activeProviderLabel, setActiveProviderLabel] = useState('Local (Built-in)')
  const [activeModelLabel, setActiveModelLabel] = useState('Local default')
  const [thinkingEnabled, setThinkingEnabled] = useState(() => localStorage.getItem('gsos.chat.thinking') !== 'false')
  const [toolModes, setToolModes] = useState<Record<AssistantToolMode, boolean>>(() => {
    try {
      return {
        browser: true,
        files: true,
        knowledge: true,
        workspace: true,
        terminal: true,
        channels: true,
        connectors: true,
        ...JSON.parse(localStorage.getItem('gsos.chat.toolModes') || '{}'),
      }
    } catch {
      return {
        browser: true,
        files: true,
        knowledge: true,
        workspace: true,
        terminal: true,
        channels: true,
        connectors: true,
      }
    }
  })
  const [videoOpen, setVideoOpen] = useState(false)
  const [meetingNotes, setMeetingNotes] = useState('')
  const [videoStatus, setVideoStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle')
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const speechCancelRef = useRef(false)
  const speechQueueRef = useRef(Promise.resolve())
  const {
    addMessage,
    updateMessage,
    setStreaming,
    activeModel,
    composerText,
    setComposerText,
    setCurrentTaskTools,
    setActiveModel,
  } = useChatStore()
  const { loadedModel, models, setLoadedModel } = useModelsStore()
  const { connectors } = useConnectorsStore()

  const refreshModelOptions = async () => {
    try {
      const providers = await invoke('list_ai_providers') as AiProvider[]
      setProviders(providers)
      const localModels = await invoke('list_ai_provider_models', { providerId: 'local' }) as ProviderModel[]
      const freeProviderIds = providers
        .filter((provider) => provider.id !== 'local' && provider.id !== 'nvidia' && provider.connected && provider.freeOnly)
        .map((provider) => provider.id)

      const providerLists = await Promise.all(
        freeProviderIds.map(async (providerId) => {
          try {
            const list = await invoke('list_ai_provider_models', { providerId }) as ProviderModel[]
            return { providerId, list }
          } catch {
            return { providerId, list: [] as ProviderModel[] }
          }
        })
      )

      const localOptions: ModelOption[] = localModels.map((model) => ({
        id: model.id,
        label: model.label,
        providerId: 'local',
        providerLabel: 'Local Library',
        kind: 'local',
        freeOnly: true,
      }))

      const remoteOptions: ModelOption[] = providerLists.flatMap(({ providerId, list }) => {
        const provider = providers.find((item) => item.id === providerId)
        return list.map((model) => ({
          id: model.id,
          label: model.label,
          providerId,
          providerLabel: provider?.label || providerId,
          kind: 'provider' as const,
          freeOnly: model.freeOnly,
        }))
      })

      setModelOptions([...localOptions, ...remoteOptions])

      const activeProvider = providers.find((provider) => provider.active)
      setActiveProviderId(activeProvider?.id || 'local')
      setActiveProviderLabel(activeProvider?.label || 'Local (Built-in)')
      if (activeProvider?.id === 'local') {
        const activeLocal = localOptions.find((option) => option.id === loadedModel) || localOptions[0]
        setActiveModelLabel(activeLocal?.label || loadedModel || 'Local default')
      } else {
        setActiveModelLabel(activeProvider?.model || activeModel || 'Select model')
      }
    } catch (error) {
      console.error('Failed to refresh chat model options', error)
    }
  }

  useEffect(() => {
    refreshModelOptions()
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionCtor
      webkitSpeechRecognition?: SpeechRecognitionCtor
    }
    setVoiceSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition))
  }, [loadedModel, activeModel, models.length])

  useEffect(() => {
    if (!composerText || isLoading) return
    setComposerText('')
    handleSubmit(undefined, composerText)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerText])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('gsos.chat.toolModes', JSON.stringify(toolModes))
  }, [toolModes])

  useEffect(() => {
    localStorage.setItem('gsos.chat.thinking', String(thinkingEnabled))
  }, [thinkingEnabled])

  const updateTaskTool = (
    steps: ToolCall[],
    index: number,
    status: ToolCall['status'],
    result?: unknown
  ) => {
    const next = steps.map((tool, toolIndex) =>
      toolIndex === index ? { ...tool, status, result } : tool
    )
    setCurrentTaskTools(next)
    return next
  }

  const stopSpeech = () => {
    speechCancelRef.current = true
    stopSpeaking()
  }

  const speakQueuedChunks = async (text: string, settings = loadVoiceSettings()) => {
    if (!settings.enabled || !settings.streamingSpeech) return
    if (!isSafeForVoice(text, settings.autoReadAgentResults)) return
    speechQueueRef.current = speechQueueRef.current.then(async () => {
      const chunks = splitVoiceChunks(text, settings)
      await speakChunksSequentially(chunks, settings, () => speechCancelRef.current)
    })
    return speechQueueRef.current
  }

  const runEventStream = async (
    prompt: string,
    assistantId: string,
    settings = loadVoiceSettings()
  ) => {
    const runId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    let streamed = ''
    let finalText = ''
    let streamError = ''
    const unlisten = await listen<ChatStreamEvent>('chat_stream_event', (event) => {
      const payload = event.payload
      if (payload.runId !== runId) return
      if (payload.eventType === 'token') {
        streamed += payload.text
        updateMessage(assistantId, { content: streamed })
      }
      if (payload.eventType === 'sentence_ready' && settings.streamingSpeech && payload.safeToSpeak) {
        speakQueuedChunks(payload.text, settings)
      }
      if (payload.eventType === 'done') {
        finalText = payload.text || streamed
      }
      if (payload.eventType === 'error') {
        streamError = payload.error || 'Stream failed'
      }
    })
    try {
      const response = await invoke('start_chat_stream', { runId, prompt }) as string
      if (streamError) throw new Error(streamError)
      return finalText || response || streamed
    } finally {
      unlisten()
    }
  }

  const getActiveModelSnapshot = async () => {
    try {
      const providers = await invoke('list_ai_providers') as AiProvider[]
      const activeProvider = providers.find((provider) => provider.active)

      if (!activeProvider || activeProvider.id === 'local') {
        const localModels = await invoke('list_ai_provider_models', { providerId: 'local' }) as ProviderModel[]
        const activeLocal = localModels.find((model) => model.id === loadedModel) || localModels[0]
        return {
          providerId: 'local',
          providerLabel: 'Local (Built-in)',
          modelLabel: activeLocal?.label || loadedModel || 'Local default',
        }
      }

      return {
        providerId: activeProvider.id,
        providerLabel: activeProvider.label,
        modelLabel: activeProvider.model || activeModel || 'Selected provider model',
      }
    } catch {
      return {
        providerId: activeProviderId,
        providerLabel: activeProviderLabel,
        modelLabel: activeModelLabel,
      }
    }
  }

  const handleSubmit = async (e?: FormEvent, forcedPrompt?: string) => {
    e?.preventDefault()
    const promptToSend = (forcedPrompt ?? input).trim()
    if (!promptToSend || isRecording || isLoading) return

    const modelSnapshot = await getActiveModelSnapshot()
    const voiceSettings = loadVoiceSettings()
    setActiveProviderLabel(modelSnapshot.providerLabel)
    setActiveModelLabel(modelSnapshot.modelLabel)

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: promptToSend,
      timestamp: new Date(),
    }

    addMessage(userMessage)
    const userPrompt = promptToSend
    setInput('')
    setIsLoading(true)
    setStreaming(true)

    let taskSteps: ToolCall[] = [
      {
        id: generateId(),
        name: 'Prepare request',
        arguments: { promptLength: userPrompt.length, thinking: thinkingEnabled, tools: toolModes },
        status: 'running',
      },
      {
        id: generateId(),
        name: 'Resolve model',
        arguments: { provider: modelSnapshot.providerLabel },
        status: 'pending',
      },
      {
        id: generateId(),
        name: 'Generate answer',
        arguments: { model: modelSnapshot.modelLabel },
        status: 'pending',
      },
    ]
    setCurrentTaskTools(taskSteps)

    try {
      taskSteps = updateTaskTool(taskSteps, 0, 'completed', 'Prompt prepared')
      taskSteps = updateTaskTool(taskSteps, 1, 'running')
      if (modelSnapshot.providerLabel.startsWith('Local')) {
        const engineOnline = await invoke('check_ai_status') as boolean
        if (!engineOnline) {
          const modelId = loadedModel || activeModel || undefined
          if (!modelId) {
            throw new Error('Local engine is offline and no local model is selected. Open Model Hub and load a GGUF model.')
          }
          await invoke('start_local_engine', { modelId })
        }
      }
      taskSteps = updateTaskTool(taskSteps, 1, 'completed', {
        provider: modelSnapshot.providerLabel,
        model: modelSnapshot.modelLabel,
      })
      taskSteps = updateTaskTool(taskSteps, 2, 'running')

      const toolRun = await executeAssistantTools(userPrompt, setCurrentView, toolModes)
      if (toolRun.tools.length > 0) {
        for (const tool of toolRun.tools) {
          invoke('add_run_timeline_event', {
            runId: `chat_tools_${userMessage.id}`,
            eventType: tool.status === 'failed' ? 'error' : 'tool_finished',
            source: 'tool',
            agent: 'assistant',
            title: tool.name,
            text: `${tool.name} ${tool.status}`,
            status: tool.status,
            requiresApproval: false,
            metadata: { arguments: tool.arguments, result: tool.result },
          }).catch(() => {})
        }
        taskSteps = [
          ...taskSteps.slice(0, 2),
          ...toolRun.tools,
          taskSteps[2],
        ]
        setCurrentTaskTools(taskSteps)
      }

      if (toolRun.handled && toolRun.directAnswer) {
        taskSteps = updateTaskTool(taskSteps, taskSteps.length - 1, 'completed', 'Tool action completed')
        const enhancedAnswer = fixTamilOutput(appendFollowUpSuggestions(toolRun.directAnswer, userPrompt), voiceSettings.language)
        await queueCompletionNotification(userPrompt, enhancedAnswer, 'assistant')
        addMessage({
          id: generateId(),
          role: 'assistant',
          content: enhancedAnswer,
          timestamp: new Date(),
          model: 'desktop-tools',
          tools: taskSteps,
        })
        return
      }

      const thinkingInstruction = thinkingEnabled
        ? 'Thinking mode is ON: reason carefully internally, check assumptions, then provide only the useful final answer without hidden chain-of-thought.'
        : 'Thinking mode is OFF: answer directly and concisely without extended reasoning.'
      const languageInstruction = isTamilSpeech(voiceSettings.language)
        ? `The user selected ${voiceLanguageLabels[voiceSettings.language]} for speech/replies. Reply in clean, natural Tamil. Never split names: Silva is சில்வா and Genz Silva is ஜென்ஸ் சில்வா. Use ${voiceSettings.language === 'ta-LK' ? 'casual Jaffna/Sri Lankan Tamil with நீங்க/இருக்கீங்க where natural' : 'standard Indian Tamil with நீங்கள்/இருக்கிறீர்கள்'}. Keep names, email addresses, invoice references, addresses, source quotes, and legal/financial terms accurate. Do not answer in English unless the user explicitly asks for English.`
        : 'Reply in English unless the user asks for another language.'
      const naturalStyleInstruction = [
        'Conversation style: sound natural and direct, not formal or robotic.',
        'For Hermes/email tasks, say something like: "Sure Silva — I’ll check Outlook and organise the emails properly. I won’t send, delete, archive, move, or label anything without your approval."',
        'For Tamil greetings, never start with "நீங்க காலை வணக்கம்" or "நீங்கள் காலை வணக்கம்". Use "காலை வணக்கம் Silva! எப்படி இருக்கீங்க?" for Sri Lankan Tamil, or "காலை வணக்கம் Silva! நீங்கள் எப்படி இருக்கிறீர்கள்?" for Indian Tamil.',
      ].join('\n')
      const enrichedPrompt = [
        userPrompt,
        thinkingInstruction,
        languageInstruction,
        naturalStyleInstruction,
        'Safety and accuracy rules: never invent invoice amounts, rent amounts, due dates, legal facts, payment status, or attachment details. If the real email body/attachment/source does not contain a value, say "not found in the available source" and offer to open/extract the original item. For speech-friendly output, avoid raw JSON unless asked.',
        toolRun.context ? `Desktop tool context already gathered:\n${toolRun.context}` : '',
      ].filter(Boolean).join('\n\n')
      speechCancelRef.current = false
      const assistantId = generateId()
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        model: modelSnapshot.modelLabel || loadedModel || activeModel || 'assistant',
        tools: taskSteps,
      }
      addMessage(assistantMessage)
      let response = ''
      try {
        response = await runEventStream(enrichedPrompt, assistantId, voiceSettings)
      } catch (error) {
        const responseChunks = await invoke('stream_chat', { prompt: enrichedPrompt }) as string[]
        response = responseChunks.join('')
        let streamed = ''
        const displayChunks = responseChunks.length > 1 ? responseChunks : splitDisplayChunks(response)
        for (const chunk of displayChunks) {
          streamed = [streamed, chunk].filter(Boolean).join(streamed ? ' ' : '')
          updateMessage(assistantId, { content: streamed })
          if (voiceSettings.streamingSpeech && isSafeForVoice(chunk, voiceSettings.autoReadAgentResults)) {
            speakQueuedChunks(chunk, voiceSettings)
          }
          await new Promise((resolve) => window.setTimeout(resolve, 35))
        }
      }
      const enhancedResponse = fixTamilOutput(appendFollowUpSuggestions(response, userPrompt), voiceSettings.language)
      taskSteps = updateTaskTool(taskSteps, 2, 'completed', 'Response received')
      updateMessage(assistantId, { content: enhancedResponse, tools: taskSteps })
      await queueCompletionNotification(userPrompt, enhancedResponse, 'assistant')
    } catch (error) {
      console.error('Inference failed:', error)
      taskSteps = updateTaskTool(taskSteps, 2, 'failed', String(error))
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: `Error: ${error}`,
        timestamp: new Date(),
        model: modelSnapshot.modelLabel || activeModel || 'assistant',
        tools: taskSteps,
      })
    } finally {
      setCurrentTaskTools([])
      setIsLoading(false)
      setStreaming(false)
    }

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }

  const startRecognition = (target: 'composer' | 'notes') => {
    stopSpeech()
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionCtor
      webkitSpeechRecognition?: SpeechRecognitionCtor
    }
    const RecognitionCtor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!RecognitionCtor) {
      setCameraError('Speech recognition is not supported in this runtime.')
      return
    }

    recognitionRef.current?.stop()
    const recognition = new RecognitionCtor()
    const voiceSettings = loadVoiceSettings()
    let lastTranscript = ''
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = voiceSettings.language

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0]?.transcript || '')
        .join(' ')
        .trim()
      lastTranscript = transcript

      if (target === 'composer') {
        setInput(transcript)
      } else {
        setMeetingNotes(transcript)
      }
    }

    recognition.onerror = () => {
      setIsRecording(false)
    }
    recognition.onend = () => {
      setIsRecording(false)
      if (target === 'composer' && voiceSettings.voiceCommandMode && lastTranscript.trim()) {
        window.setTimeout(() => handleSubmit(undefined, lastTranscript.trim()), 80)
      }
    }

    recognition.start()
    recognitionRef.current = recognition
    setIsRecording(true)
  }

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      return
    }
    startRecognition('composer')
  }

  const toggleVideoPanel = async () => {
    if (videoOpen) {
      recognitionRef.current?.stop()
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
      }
      setVideoOpen(false)
      setVideoStatus('idle')
      return
    }

    setVideoStatus('connecting')
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      mediaStreamRef.current = stream
      setVideoOpen(true)
      setVideoStatus('active')
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      }, 0)
    } catch (error) {
      setVideoStatus('error')
      setCameraError(String(error))
    }
  }

  const handleAttachFile = () => {
    fileInputRef.current?.click()
  }

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    const summary = files.map((file) => `[Attached: ${file.name}]`).join(' ')
    setInput((current) => [current, summary].filter(Boolean).join('\n'))
    event.target.value = ''
  }

  const selectModelOption = async (option: ModelOption) => {
    try {
      if (option.kind === 'local') {
        await invoke('set_active_ai_provider', { providerId: 'local' })
        await invoke('start_local_engine', { modelId: option.id })
        setLoadedModel(option.id)
        setActiveModel(option.id)
      } else {
        await invoke('set_ai_provider_model', { providerId: option.providerId, modelId: option.id })
        await invoke('set_active_ai_provider', { providerId: option.providerId })
        setActiveModel(option.id)
      }
      setActiveModelLabel(option.label)
      setActiveProviderLabel(option.providerLabel)
      setActiveProviderId(option.providerId)
      setShowModelPicker(false)
      await refreshModelOptions()
    } catch (error) {
      console.error('Failed to switch model', error)
      alert(`Could not switch model: ${error}`)
    }
  }

  const selectProvider = async (provider: AiProvider) => {
    try {
      await invoke('set_active_ai_provider', { providerId: provider.id })
      setActiveProviderId(provider.id)
      setActiveProviderLabel(provider.label)
      setActiveModelLabel(provider.model || 'Select model')
      setShowProviderPicker(false)

      const list = await invoke('list_ai_provider_models', { providerId: provider.id }) as ProviderModel[]
      const providerOptions: ModelOption[] = list.map((model) => ({
        id: model.id,
        label: model.label,
        providerId: provider.id,
        providerLabel: provider.id === 'local' ? 'Local Library' : provider.label,
        kind: provider.id === 'local' ? 'local' : 'provider',
        freeOnly: model.freeOnly,
      }))
      setModelOptions((current) => [
        ...current.filter((option) => option.providerId !== provider.id),
        ...providerOptions,
      ])
      setShowModelPicker(true)
    } catch (error) {
      console.error('Failed to switch provider', error)
      setCurrentView('integrations')
      alert(`Could not activate ${provider.label}: ${error}`)
    }
  }

  const toggleToolMode = (mode: AssistantToolMode) => {
    setToolModes((current) => ({ ...current, [mode]: !current[mode] }))
  }

  const toolButtons: Array<{
    id: AssistantToolMode
    label: string
    icon: typeof Globe
    view: ViewType
  }> = [
    { id: 'browser', label: 'Browser', icon: Globe, view: 'connectors' },
    { id: 'files', label: 'Files', icon: Files, view: 'computer' },
    { id: 'knowledge', label: 'Knowledge', icon: BookOpen, view: 'knowledge' },
    { id: 'workspace', label: 'Workspace', icon: FolderOpen, view: 'workspace' },
    { id: 'terminal', label: 'Terminal', icon: Terminal, view: 'computer' },
    { id: 'channels', label: 'Channels', icon: CalendarRange, view: 'channels' },
    { id: 'connectors', label: 'Connectors', icon: Plug, view: 'connectors' },
  ]

  const enabledConnectors = connectors.filter((connector) => connector.isEnabled).slice(0, 8)
  const activeProvider = providers.find((provider) => provider.id === activeProviderId)
  const filteredModelOptions = modelOptions.filter((option) => option.providerId === activeProviderId)
  const modelOptionsForMenu = filteredModelOptions.length > 0 ? filteredModelOptions : modelOptions
  const modelMenuHeader = filteredModelOptions.length > 0
    ? `${activeProvider?.label || activeProviderLabel} Models`
    : 'Available Models'
  const activeToolCount = Object.values(toolModes).filter(Boolean).length

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter p-4">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <input ref={fileInputRef} type="file" multiple hidden onChange={handleFilesSelected} />

        {videoOpen && (
          <div className="mb-4 rounded-[2rem] border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark shadow-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-black text-gray-900 dark:text-white">Video Notes Studio</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Camera {videoStatus}. Capture video, speak, and keep notes live in the desktop chat.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startRecognition('notes')}
                  className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-black uppercase tracking-wider"
                >
                  {isRecording ? 'Listening...' : 'Take Notes'}
                </button>
                <button
                  type="button"
                  onClick={() => setInput((current) => [current, meetingNotes].filter(Boolean).join('\n\n'))}
                  className="px-3 py-2 rounded-xl bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-black uppercase tracking-wider"
                >
                  Add To Chat
                </button>
              </div>
            </div>
            <div className="grid md:grid-cols-[320px_1fr] gap-4">
              <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black">
                <video ref={videoRef} autoPlay muted playsInline className="w-full aspect-video object-cover" />
              </div>
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-light-muted/40 dark:bg-dark/40 p-4">
                <div className="flex items-center gap-2 mb-3 text-xs font-black uppercase tracking-wider text-gray-500">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  Meeting Notes
                </div>
                <textarea
                  value={meetingNotes}
                  onChange={(event) => setMeetingNotes(event.target.value)}
                  className="w-full min-h-[180px] bg-transparent resize-none text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
                  placeholder="Transcript and notes appear here while you talk."
                />
                {cameraError && <p className="mt-2 text-xs text-red-500">{cameraError}</p>}
              </div>
            </div>
          </div>
        )}

        <div
          className={cn(
            'relative rounded-[2rem] border border-gray-200 dark:border-gray-700 overflow-hidden',
            'bg-white dark:bg-dark shadow-[0_12px_40px_rgba(0,0,0,0.06)]',
            'focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary',
            'transition-all duration-200'
          )}
        >
          <div className="px-5 pt-4">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Assign a task or ask anything"
              rows={2}
              className={cn(
                'w-full bg-transparent resize-none text-gray-900 dark:text-white',
                'placeholder-gray-400 text-base focus:outline-none',
                'max-h-[220px]'
              )}
              style={{ minHeight: '48px' }}
            />
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-light-muted/30 dark:bg-dark-lighter/40">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleAttachFile}
                className="p-2 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-primary hover:border-primary/30"
                title="Attach file"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('model-hub')}
                className="p-2 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-primary hover:border-primary/30"
                title="Brain / model hub"
              >
                <Brain className="w-4 h-4" />
              </button>
              {toolButtons.map((tool) => {
                const Icon = tool.icon
                const active = toolModes[tool.id]
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => toggleToolMode(tool.id)}
                    onDoubleClick={() => setCurrentView(tool.view)}
                    className={cn(
                      'p-2 rounded-full border transition-all',
                      active
                        ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:text-primary hover:border-primary/30'
                    )}
                    title={`${tool.label} ${active ? 'active' : 'off'} - double click to open`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setThinkingEnabled((state) => !state)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-black transition-all',
                  thinkingEnabled
                    ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20'
                    : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:text-amber-600 hover:border-amber-300'
                )}
                title={thinkingEnabled ? 'Thinking mode on' : 'Thinking mode off'}
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{thinkingEnabled ? 'Think On' : 'Think Off'}</span>
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowProviderPicker((state) => !state)
                    setShowModelPicker(false)
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                  title="Select provider"
                >
                  <Sparkles className="w-3 h-3" />
                  <span className="max-w-[160px] truncate">{activeProviderLabel}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showProviderPicker && (
                  <div className="absolute left-0 bottom-12 z-30 w-[300px] max-h-80 overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark shadow-2xl p-3">
                    <div className="mb-3 text-[11px] font-black uppercase tracking-widest text-gray-400">
                      Providers
                    </div>
                    <div className="space-y-1">
                      {providers.map((provider) => (
                        <button
                          key={provider.id}
                          type="button"
                          onClick={() => selectProvider(provider)}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-xl transition-colors',
                            provider.id === activeProviderId
                              ? 'bg-primary/10 text-primary'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium truncate">{provider.label}</span>
                            <span className={cn(
                              'text-[10px] font-black uppercase',
                              provider.connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'
                            )}>
                              {provider.connected ? 'Ready' : 'Setup'}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-400 truncate">{provider.model || provider.baseUrl || provider.id}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowModelPicker((state) => !state)
                    setShowProviderPicker(false)
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-xs font-medium hover:opacity-90 transition-opacity"
                  title="Select model"
                >
                  <Brain className="w-3 h-3" />
                  <span className="max-w-[200px] truncate">{activeModelLabel}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showModelPicker && (
                  <div className="absolute left-0 bottom-12 z-20 w-[360px] max-h-80 overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark shadow-2xl p-3">
                    <div className="mb-3 text-[11px] font-black uppercase tracking-widest text-gray-400">
                      {modelMenuHeader}
                    </div>
                    {modelOptionsForMenu.length > 0 ? (
                      <div className="space-y-1">
                        {modelOptionsForMenu.map((option) => (
                          <button
                            key={`${option.providerId}:${option.id}`}
                            type="button"
                            onClick={() => selectModelOption(option)}
                            className={cn(
                              'w-full text-left px-3 py-2 rounded-xl transition-colors',
                              option.id === activeModel || option.id === loadedModel
                                ? 'bg-primary/10 text-primary'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium truncate">{option.label}</span>
                              <span className="shrink-0 text-[10px] font-black uppercase text-gray-400">
                                {option.providerLabel}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
                              <span className="truncate">{option.id}</span>
                              {option.freeOnly && (
                                <span className="shrink-0 font-black uppercase text-emerald-600 dark:text-emerald-400">
                                  Free
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                        No models listed yet for this provider. Open Integrations or Model Hub to connect/load one.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAttachFile}
                className="p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Attach file"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={toggleRecording}
                disabled={!voiceSupported}
                className={cn(
                  'p-2 rounded-full transition-colors',
                  isRecording
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
                  !voiceSupported && 'opacity-50 cursor-not-allowed'
                )}
                title={voiceSupported ? 'Microphone' : 'Speech recognition unavailable'}
              >
                <Mic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={toggleVideoPanel}
                className={cn(
                  'p-2 rounded-full transition-colors',
                  videoOpen
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
                title="Video notes"
              >
                <Video className="w-4 h-4" />
              </button>
              <button
                type="submit"
                disabled={!input.trim() || isRecording}
                className={cn(
                  'p-2.5 rounded-full transition-all duration-200',
                  input.trim()
                    ? 'bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/20'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                )}
                title="Send"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-4 px-2">
          <button
            type="button"
            onClick={() => setCurrentView('connectors')}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <MessageSquarePlus className="w-4 h-4" />
            Desktop tools active: {activeToolCount}/7
          </button>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {enabledConnectors.map((connector) => (
              <button
                key={connector.id}
                type="button"
                onClick={() => setCurrentView('connectors')}
                className="px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-[11px] text-gray-500 hover:text-primary hover:border-primary/30"
                title={`${connector.name} connected in workspace`}
              >
                {connector.name}
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  )
}
