import { invoke } from '@tauri-apps/api/core'
import { isTamilSpeech, type SpeechLanguage, type VoiceSettings } from '@/lib/response-enhancements'

type SpeakOptions = {
  text: string
  language: SpeechLanguage
  rate: number
  pitch: number
  preferNative?: boolean
}

function waitForVoices(timeoutMs = 1200): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([])
  const current = window.speechSynthesis.getVoices()
  if (current.length > 0) return Promise.resolve(current)

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.speechSynthesis.onvoiceschanged = null
      resolve(window.speechSynthesis.getVoices())
    }, timeoutMs)

    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(timer)
      window.speechSynthesis.onvoiceschanged = null
      resolve(window.speechSynthesis.getVoices())
    }
  })
}

function chooseBrowserVoice(voices: SpeechSynthesisVoice[], language: SpeechLanguage) {
  const normalized = language.toLowerCase()
  const base = normalized.split('-')[0]
  const tamil = isTamilSpeech(language)

  return voices.find((voice) => voice.lang.toLowerCase() === normalized)
    || voices.find((voice) => tamil && (voice.lang.toLowerCase().startsWith('ta') || voice.name.toLowerCase().includes('tamil')))
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(base))
    || voices.find((voice) => language === 'en-GB' && /uk|great britain|united kingdom|english/i.test(`${voice.name} ${voice.lang}`))
    || voices.find((voice) => language === 'en-US' && /us|united states|english/i.test(`${voice.name} ${voice.lang}`))
    || null
}

async function speakWithBrowser({ text, language, rate, pitch }: SpeakOptions) {
  if (!('speechSynthesis' in window)) {
    throw new Error('Browser speech synthesis is unavailable.')
  }

  const voices = await waitForVoices()
  const voice = chooseBrowserVoice(voices, language)

  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language
    utterance.rate = rate
    utterance.pitch = pitch
    utterance.voice = voice
    utterance.onend = () => resolve()
    utterance.onerror = (event) => reject(new Error(`Browser speech failed: ${event.error}`))

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    window.speechSynthesis.resume()
    window.setTimeout(() => window.speechSynthesis.resume(), 150)
    window.setTimeout(() => resolve(), Math.max(6000, Math.min(text.length * 120, 45000)))
  })
}

async function speakWithNative({ text, language, rate }: SpeakOptions) {
  await invoke('speak_text_native', { text, language, rate })
}

export async function speakWithBestEngine(options: SpeakOptions) {
  const trimmed = options.text.trim()
  if (!trimmed) return

  if (!options.preferNative) {
    try {
      await speakWithBrowser({ ...options, text: trimmed })
      return
    } catch (browserError) {
      console.warn('Browser speech failed; trying native Windows speech.', browserError)
    }
  }

  try {
    await speakWithNative({ ...options, text: trimmed })
    return
  } catch (nativeError) {
    if (options.preferNative) {
      await speakWithBrowser({ ...options, text: trimmed })
      return
    }
    throw nativeError
  }
}

export async function speakChunksSequentially(
  chunks: string[],
  settings: VoiceSettings,
  shouldCancel: () => boolean,
) {
  for (const chunk of chunks) {
    if (shouldCancel()) break
    await speakWithBestEngine({
      text: chunk,
      language: settings.language,
      rate: settings.rate,
      pitch: settings.pitch,
      preferNative: false,
    })
  }
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel()
}
