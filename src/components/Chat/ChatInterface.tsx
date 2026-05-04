import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/stores'
import { cn, formatDate } from '@/lib/utils'
import { invoke } from '@tauri-apps/api/core'
import { applyVoiceProfile, fixTamilOutput, formatSpeechForVoice, getFollowUpSuggestions, isTamilSpeech, loadVoiceSettings, saveVoiceSettings, shouldAutoSpeak, speechTranslationPrompt, type SpeechLanguage, type VoiceProfileId, voiceLanguageLabels, voiceProfiles } from '@/lib/response-enhancements'
import { Bot, User, Loader2, Code, AlertCircle, CheckCircle2, Copy, Volume2, RotateCcw, Pencil, PlayCircle, Settings2 } from 'lucide-react'
import type { ChatMessage, ToolCall } from '@/types'

type NativeVoice = {
  description: string
  language: string
}

type RunTimelineEvent = {
  id: string
  at: string
  runId: string
  eventType: string
  source: string
  agent: string
  title: string
  text: string
  status: string
  safeToSpeak: boolean
  requiresApproval: boolean
}

export default function ChatInterface() {
  const { messages, isStreaming, currentTaskTools, setComposerText } = useChatStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [voiceSettings, setVoiceSettings] = useState(loadVoiceSettings)
  const [showVoiceSettings, setShowVoiceSettings] = useState(false)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [nativeVoices, setNativeVoices] = useState<NativeVoice[]>([])
  const [timeline, setTimeline] = useState<RunTimelineEvent[]>([])

  const updateVoiceSettings = (updates: Partial<typeof voiceSettings>) => {
    const next = { ...voiceSettings, ...updates }
    setVoiceSettings(next)
    saveVoiceSettings(next)
  }

  const speakNative = async (text: string) => {
    await invoke('speak_text_native', {
      text,
      language: voiceSettings.language,
      rate: voiceSettings.rate,
    })
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const loadVoices = () => setAvailableVoices(window.speechSynthesis.getVoices())
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    return () => {
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [])

  useEffect(() => {
    invoke('list_run_timeline', { limit: 12 })
      .then((events) => setTimeline(Array.isArray(events) ? events as RunTimelineEvent[] : []))
      .catch(() => setTimeline([]))
    let mounted = true
    let cleanup: (() => void) | undefined
    import('@tauri-apps/api/event').then(({ listen }) => {
      if (!mounted) return
      listen<RunTimelineEvent>('unified_run_timeline_event', (event) => {
        setTimeline((current) => [event.payload, ...current].slice(0, 12))
      }).then((unlisten) => {
        cleanup = unlisten
      })
    })
    return () => {
      mounted = false
      cleanup?.()
    }
  }, [])

  useEffect(() => {
    invoke('list_native_voices')
      .then((voices) => setNativeVoices(Array.isArray(voices) ? voices as NativeVoice[] : []))
      .catch(() => setNativeVoices([]))
  }, [])

  useEffect(() => {
    const latest = messages[messages.length - 1]
    if (!latest || latest.role !== 'assistant' || !shouldAutoSpeak(latest.content, voiceSettings)) return
    const text = formatSpeechForVoice(latest.content, voiceSettings)
    speakNative(text).catch(() => {
      if (!('speechSynthesis' in window)) return
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = voiceSettings.language
      utterance.rate = voiceSettings.rate
      utterance.pitch = voiceSettings.pitch
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="sticky top-0 z-10 flex justify-end">
          <div className="relative">
            <button
              onClick={() => setShowVoiceSettings((value) => !value)}
              className="px-3 py-2 rounded-xl bg-white dark:bg-dark-lighter border border-gray-100 dark:border-gray-800 shadow-sm text-xs font-bold text-gray-600 dark:text-gray-300 flex items-center gap-2"
              title="Voice settings"
            >
              <Settings2 className="w-4 h-4" />
              Speech: {voiceLanguageLabels[voiceSettings.language]}
            </button>
            {showVoiceSettings && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white dark:bg-dark-lighter border border-gray-100 dark:border-gray-800 shadow-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase text-gray-500">Speech output</span>
                  <input type="checkbox" checked={voiceSettings.enabled} onChange={(e) => updateVoiceSettings({ enabled: e.target.checked })} />
                </div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300">
                  Voice profile
                  <select
                    value={voiceSettings.profile}
                    onChange={(e) => updateVoiceSettings(applyVoiceProfile(voiceSettings, e.target.value as VoiceProfileId))}
                    className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark px-3 py-2"
                  >
                    {Object.entries(voiceProfiles).map(([value, profile]) => (
                      <option key={value} value={value}>{profile.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300">
                  Voice language
                  <select
                    value={voiceSettings.language}
                    onChange={(e) => updateVoiceSettings({ language: e.target.value as SpeechLanguage })}
                    className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark px-3 py-2"
                  >
                    {Object.entries(voiceLanguageLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                {isTamilSpeech(voiceSettings.language) && (
                  <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                    Tamil mode now asks the AI to reply in Tamil and translates speech before reading. WebView Tamil voices: {availableVoices.filter((voice) => voice.lang.toLowerCase().startsWith('ta') || voice.name.toLowerCase().includes('tamil')).length}. Windows native Tamil voices: {nativeVoices.filter((voice) => voice.description.toLowerCase().includes('tamil') || voice.description.toLowerCase().includes('valluvar') || voice.language === '449' || voice.language === '0449' || voice.language === '849' || voice.language === '0849').length}.
                  </p>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase text-gray-500">Clean mode</span>
                  <input type="checkbox" checked={voiceSettings.cleanMode} onChange={(e) => updateVoiceSettings({ cleanMode: e.target.checked })} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase text-gray-500">Voice command mode</span>
                  <input type="checkbox" checked={voiceSettings.voiceCommandMode} onChange={(e) => updateVoiceSettings({ voiceCommandMode: e.target.checked })} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase text-gray-500">Auto short replies</span>
                  <input type="checkbox" checked={voiceSettings.autoSpeakShortReplies} onChange={(e) => updateVoiceSettings({ autoSpeakShortReplies: e.target.checked })} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase text-gray-500">Streaming speech</span>
                  <input type="checkbox" checked={voiceSettings.streamingSpeech} onChange={(e) => updateVoiceSettings({ streamingSpeech: e.target.checked })} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase text-gray-500">Agent voice updates</span>
                  <input type="checkbox" checked={voiceSettings.autoReadAgentResults} onChange={(e) => updateVoiceSettings({ autoReadAgentResults: e.target.checked })} />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    window.speechSynthesis?.cancel()
                    invoke('speak_text_native', { text: ' ', language: voiceSettings.language, rate: voiceSettings.rate }).catch(() => {})
                  }}
                  className="w-full rounded-xl bg-red-500/10 px-3 py-2 text-xs font-black uppercase text-red-600 dark:text-red-300"
                >
                  Interrupt Speech
                </button>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300">
                  Speed {voiceSettings.rate.toFixed(2)}
                  <input type="range" min="0.7" max="1.25" step="0.05" value={voiceSettings.rate} onChange={(e) => updateVoiceSettings({ rate: Number(e.target.value) })} className="w-full" />
                </label>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300">
                  Pitch {voiceSettings.pitch.toFixed(2)}
                  <input type="range" min="0.7" max="1.3" step="0.05" value={voiceSettings.pitch} onChange={(e) => updateVoiceSettings({ pitch: Number(e.target.value) })} className="w-full" />
                </label>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300">
                  Pause {voiceSettings.pauseMs}ms
                  <input type="range" min="80" max="420" step="20" value={voiceSettings.pauseMs} onChange={(e) => updateVoiceSettings({ pauseMs: Number(e.target.value) })} className="w-full" />
                </label>
              </div>
            )}
          </div>
        </div>
        {timeline.length > 0 && (
          <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-dark-lighter/80 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-black uppercase text-gray-500">Unified Run Timeline</p>
              <span className="text-[10px] font-bold text-primary">{timeline.length} live</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {timeline.slice(0, 8).map((event) => (
                <div key={event.id} className="min-w-[210px] rounded-xl bg-light-muted dark:bg-dark px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase text-primary">{event.eventType.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] text-gray-400">{event.source}</span>
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold text-gray-700 dark:text-gray-200">{event.text || event.title}</p>
                  {event.requiresApproval && <p className="mt-1 text-[10px] font-bold text-amber-600">Approval needed</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-400/20 flex items-center justify-center mb-6">
              <Bot className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              What can I do for you?
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">
              I'm powered by a local AI engine. Ask me anything about coding, research,
              automation, or your connected apps.
            </p>
            <div className="mt-8 flex flex-wrap gap-2 justify-center">
              {['Write code', 'Analyze documents', 'Automate tasks', 'Research topics'].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setComposerText(prompt)}
                  className="px-4 py-2 rounded-full bg-light-muted dark:bg-dark-lighter text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} voiceSettings={voiceSettings} />
          ))
        )}

        {isStreaming && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <div className="px-5 py-4 rounded-2xl bg-white dark:bg-dark-lighter border border-gray-100 dark:border-gray-800 shadow-sm space-y-3">
                <div className="inline-flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm font-bold text-primary tracking-wide uppercase">Live Task View</span>
                </div>
                <div className="space-y-2">
                  {currentTaskTools.map((tool) => (
                    <ToolCallItem key={tool.id} tool={tool} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}

function MessageBubble({ message, voiceSettings }: { message: ChatMessage; voiceSettings: ReturnType<typeof loadVoiceSettings> }) {
  const [expandedTools, setExpandedTools] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const { messages, setComposerText } = useChatStore()

  const isUser = message.role === 'user'
  const previousUserMessage = messages
    .slice(0, messages.findIndex((item) => item.id === message.id))
    .reverse()
    .find((item) => item.role === 'user')

  const copyMessage = async () => {
    await navigator.clipboard?.writeText(message.content)
  }

  const speakText = async (text: string) => {
    try {
      await invoke('speak_text_native', {
        text: text || 'Nothing to speak.',
        language: voiceSettings.language,
        rate: voiceSettings.rate,
      })
      setIsSpeaking(false)
      return
    } catch (error) {
      console.warn('Native Windows speech failed; falling back to Web Speech.', error)
    }

    const synth = window.speechSynthesis
    const utterance = new SpeechSynthesisUtterance(text || 'Nothing to speak.')
    utterance.lang = voiceSettings.language
    utterance.rate = voiceSettings.rate
    utterance.pitch = voiceSettings.pitch
    const voices = synth.getVoices()
    utterance.voice = voices.find((voice) => voice.lang === voiceSettings.language)
      || voices.find((voice) => isTamilSpeech(voiceSettings.language) && (voice.lang.toLowerCase().startsWith('ta') || voice.name.toLowerCase().includes('tamil')))
      || voices.find((voice) => voice.lang.toLowerCase().startsWith(voiceSettings.language.split('-')[0].toLowerCase()))
      || null
    const done = () => setIsSpeaking(false)
    utterance.onend = done
    utterance.onerror = done
    synth.cancel()
    synth.speak(utterance)
    synth.resume()
    window.setTimeout(() => synth.resume(), 250)
    window.setTimeout(() => setIsSpeaking(false), Math.max(8000, Math.min(text.length * 90, 45000)))
  }

  const speakMessage = async () => {
    if (!voiceSettings.enabled || !('speechSynthesis' in window)) return
    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }
    setIsSpeaking(true)
    const baseText = formatSpeechForVoice(message.content, voiceSettings)
    let speechText = fixTamilOutput(baseText, voiceSettings.language)
    if (isTamilSpeech(voiceSettings.language) && /[A-Za-z]/.test(baseText)) {
      try {
        speechText = await Promise.race([
          invoke('chat_completion', { prompt: speechTranslationPrompt(baseText.slice(0, 2500), voiceSettings.language) }) as Promise<string>,
          new Promise<string>((resolve) => window.setTimeout(() => resolve(''), 20000)),
        ])
      } catch (error) {
        console.warn('Tamil speech translation failed; using original text.', error)
      }
      if (!speechText.trim() || /[A-Za-z]{4,}/.test(speechText)) {
        speechText = 'மன்னிக்கவும், தமிழ் மொழிபெயர்ப்பு இப்போது கிடைக்கவில்லை. தயவு செய்து மீண்டும் முயற்சி செய்யுங்கள்.'
      }
    }
    await speakText((speechText || baseText).trim())
  }
  const suggestions = !isUser ? getFollowUpSuggestions(previousUserMessage?.content || '', message.content) : []

  return (
    <div className={cn('flex items-start gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          isUser ? 'bg-primary' : 'bg-primary/10'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-primary" />
        )}
      </div>

      <div className={cn('flex-1 max-w-[80%]', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'px-5 py-4 rounded-2xl shadow-sm',
            isUser
              ? 'bg-primary text-white rounded-tr-sm'
              : 'bg-white dark:bg-dark-lighter border border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-100 rounded-tl-sm'
          )}
        >
          <div className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{message.content}</div>
        </div>

        {message.model && (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">
              {message.model} • {formatDate(message.timestamp)}
            </span>
          </div>
        )}

        <div className={cn('mt-2 flex items-center gap-1.5', isUser && 'justify-end')}>
          <button onClick={copyMessage} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors" title="Copy">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={speakMessage} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50" title={isTamilSpeech(voiceSettings.language) ? 'Translate and speak in Tamil' : 'Speak'} disabled={isSpeaking}>
            <Volume2 className={cn('w-3.5 h-3.5', isSpeaking && 'animate-pulse text-primary')} />
          </button>
          {isUser ? (
            <button onClick={() => setComposerText(message.content)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors" title="Edit and resend">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          ) : (
            <>
              <button onClick={() => setComposerText('Continue your previous answer.')} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors" title="Continue">
                <PlayCircle className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => previousUserMessage && setComposerText(previousUserMessage.content)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Regenerate"
                disabled={!previousUserMessage}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        {!isUser && suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setComposerText(suggestion)}
                className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* Tool Calls */}
        {message.tools && message.tools.length > 0 && (
          <div className="mt-3 w-full">
            <button
              onClick={() => setExpandedTools(!expandedTools)}
              className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <Code className="w-3 h-3" />
              <span>{message.tools.length} tool(s) used</span>
            </button>

            {expandedTools && (
              <div className="mt-2 space-y-2">
                {message.tools.map((tool) => (
                  <ToolCallItem key={tool.id} tool={tool} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ToolCallItem({ tool }: { tool: ToolCall }) {
  const getStatusIcon = () => {
    switch (tool.status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />
      default:
        return <div className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600" />
    }
  }

  return (
    <div className="px-3 py-2 rounded-lg bg-light-muted dark:bg-dark text-xs">
      <div className="flex items-center gap-2 mb-1">
        {getStatusIcon()}
        <span className="font-mono text-primary">{tool.name}</span>
      </div>
      {tool.result !== undefined && (
        <div className="mt-2 p-2 rounded bg-white dark:bg-dark-lighter overflow-x-auto">
          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(tool.result, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
