export type SpeechLanguage = 'en-GB' | 'en-US' | 'ta-IN' | 'ta-LK'
export type VoiceProfileId =
  | 'silva-default'
  | 'silva-assistant'
  | 'silva-professional'
  | 'silva-tamil-india'
  | 'silva-jaffna-tamil'
  | 'silva-uk-english'
  | 'silva-us-english'

export type VoiceSettings = {
  enabled: boolean
  profile: VoiceProfileId
  language: SpeechLanguage
  cleanMode: boolean
  autoReadAgentResults: boolean
  autoSpeakShortReplies: boolean
  streamingSpeech: boolean
  askBeforeLongResponses: boolean
  voiceAlerts: boolean
  voiceCommandMode: boolean
  rate: number
  pitch: number
  tone: 'balanced' | 'friendly' | 'professional' | 'casual'
  pauseMs: number
}

export const defaultVoiceSettings: VoiceSettings = {
  enabled: true,
  profile: 'silva-default',
  language: 'en-GB',
  cleanMode: true,
  autoReadAgentResults: false,
  autoSpeakShortReplies: false,
  streamingSpeech: false,
  askBeforeLongResponses: true,
  voiceAlerts: true,
  voiceCommandMode: false,
  rate: 0.95,
  pitch: 1,
  tone: 'balanced',
  pauseMs: 180,
}

export const voiceLanguageLabels: Record<SpeechLanguage, string> = {
  'en-GB': 'English UK',
  'en-US': 'English US',
  'ta-IN': 'Tamil India',
  'ta-LK': 'Tamil Sri Lanka',
}

export const voiceProfiles: Record<VoiceProfileId, { label: string; settings: Partial<VoiceSettings> }> = {
  'silva-default': { label: 'Silva Default', settings: { language: 'en-GB', rate: 0.95, pitch: 1, tone: 'balanced', pauseMs: 180 } },
  'silva-assistant': { label: 'Silva Assistant', settings: { language: 'en-GB', rate: 1, pitch: 1.05, tone: 'friendly', pauseMs: 160 } },
  'silva-professional': { label: 'Silva Professional', settings: { language: 'en-GB', rate: 0.9, pitch: 0.95, tone: 'professional', pauseMs: 240 } },
  'silva-tamil-india': { label: 'Silva Tamil India', settings: { language: 'ta-IN', rate: 0.88, pitch: 1, tone: 'professional', pauseMs: 260 } },
  'silva-jaffna-tamil': { label: 'Silva Jaffna Tamil', settings: { language: 'ta-LK', rate: 0.9, pitch: 1, tone: 'casual', pauseMs: 240 } },
  'silva-uk-english': { label: 'Silva UK English', settings: { language: 'en-GB', rate: 0.94, pitch: 1, tone: 'professional', pauseMs: 210 } },
  'silva-us-english': { label: 'Silva US English', settings: { language: 'en-US', rate: 0.97, pitch: 1, tone: 'friendly', pauseMs: 180 } },
}

export function applyVoiceProfile(current: VoiceSettings, profile: VoiceProfileId): VoiceSettings {
  return { ...current, profile, ...voiceProfiles[profile].settings }
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    return { ...defaultVoiceSettings, ...JSON.parse(localStorage.getItem('gsos.voice.settings') || '{}') }
  } catch {
    return defaultVoiceSettings
  }
}

export function saveVoiceSettings(settings: VoiceSettings) {
  localStorage.setItem('gsos.voice.settings', JSON.stringify(settings))
}

function spellReference(value: string) {
  return value.split('').map((char) => {
    if (/[A-Za-z]/.test(char)) return char.toUpperCase()
    if (char === '@') return ' at '
    if (char === '.') return ' dot '
    if (char === '-') return ' dash '
    if (char === '_') return ' underscore '
    return ` ${char} `
  }).join(' ').replace(/\s+/g, ' ').trim()
}

function poundsToSpeech(match: string, amount: string) {
  const normalized = amount.replace(/,/g, '')
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric)) return match
  return `${numeric.toLocaleString('en-GB', { maximumFractionDigits: 2 })} pounds`
}

function redactSensitiveSpeech(text: string) {
  return text
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|or-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,})\b/g, ' sensitive key omitted ')
    .replace(/\b(password|passcode|api key|secret|token)\s*[:=]\s*\S+/gi, '$1 omitted')
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, ' card number omitted ')
    .replace(/\b\d{2}-\d{2}-\d{2}\b/g, ' bank sort code omitted ')
}

function splitLongSentence(sentence: string, maxWords = 12) {
  const words = sentence.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return sentence.trim()
  const chunks: string[] = []
  for (let index = 0; index < words.length; index += maxWords) {
    chunks.push(words.slice(index, index + maxWords).join(' '))
  }
  return chunks.join('. ')
}

export function cleanSpeechText(text: string) {
  return redactSensitiveSpeech(text)
    .replace(/```[\s\S]*?```/g, ' code block omitted ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[A-Za-z]:\\[^\n]+/g, ' local file path omitted ')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (email) => spellReference(email))
    .replace(/\bppi\d+\b/gi, (ref) => spellReference(ref))
    .replace(/£\s*([\d,]+(?:\.\d{1,2})?)/g, poundsToSpeech)
    .replace(/\b(tool\(s\) used|desktop-tools)\b/gi, '')
    .replace(/\b(Hermes|OpenClaw|Paperclip|SpaceAgent|Solicister|Accountants)\b\s*[:\-]?\s*/g, '')
    .replace(/-{3,}/g, '. ')
    .replace(/\//g, ' or ')
    .replace(/&/g, ' and ')
    .replace(/Suggested next actions:[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatSpeechForVoice(text: string, settings: VoiceSettings) {
  const cleaned = settings.cleanMode ? cleanSpeechText(text) : redactSensitiveSpeech(text)
  const tamilFixed = fixTamilOutput(cleaned, settings.language)
  const normalized = tamilFixed
    .replace(/\s*([.!?])\s*/g, '$1 ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => splitLongSentence(sentence, isTamilSpeech(settings.language) ? 9 : 12))
    .join(`. ${settings.pauseMs > 220 ? '… ' : ''}`)
    .replace(/\. \./g, '.')
    .trim()
}

export function shouldAutoSpeak(text: string, settings: VoiceSettings) {
  if (!settings.enabled || !settings.autoSpeakShortReplies) return false
  const clean = cleanSpeechText(text)
  if (/\b(password|api key|secret|token|card number|sort code)\b/i.test(text)) return false
  if (!settings.autoReadAgentResults && /\b(approval|invoice|legal|court|tax|finance|email item|tool\(s\) used)\b/i.test(text)) return false
  return clean.length > 0 && clean.length <= 420
}

export function isSafeForVoice(text: string, allowPrivate = false) {
  if (allowPrivate) return true
  return !/\b(password|passcode|api key|secret|token|private key|recovery code|full email body|legal submission|court form|bank|card number|sort code)\b/i.test(text)
}

export function splitVoiceChunks(text: string, settings: VoiceSettings) {
  const formatted = formatSpeechForVoice(text, settings)
  const chunks = formatted
    .split(/(?<=[.!?])\s+|…\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  if (chunks.length === 0 && formatted) return [formatted]
  return chunks.flatMap((chunk) => {
    if (chunk.length <= 220) return [chunk]
    const words = chunk.split(/\s+/)
    const pieces: string[] = []
    for (let index = 0; index < words.length; index += 18) {
      pieces.push(words.slice(index, index + 18).join(' '))
    }
    return pieces
  })
}

export function splitDisplayChunks(text: string) {
  const chunks = text
    .split(/(?<=[.!?])\s+|\n\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
  return chunks.length > 0 ? chunks : [text]
}

export function isTamilSpeech(language: SpeechLanguage) {
  return language.startsWith('ta')
}

export function speechTranslationPrompt(text: string, language: SpeechLanguage) {
  const dialect = language === 'ta-LK' ? 'Sri Lankan Tamil / Jaffna-friendly casual Tamil' : 'standard Indian Tamil'
  const greeting = language === 'ta-LK'
    ? 'Use natural phrasing like: "வணக்கம்! நான் சில்வா. நீங்க எப்படி இருக்கீங்க?"'
    : 'Use natural phrasing like: "வணக்கம்! நான் சில்வா. நீங்கள் எப்படி இருக்கிறீர்கள்?"'
  return [
    `Translate/fix the following assistant answer into clean, natural spoken ${dialect}.`,
    'Never split or literally translate names. "Genz Silva", "GENZ SILVA OS", and "Silva" should be spoken naturally as "சில்வா" unless the full app name is required.',
    'Fix machine Tamil grammar. Avoid phrases like "இருக்கிறதோம்".',
    greeting,
    'Keep email addresses, invoice references, addresses, dates, and money values accurate.',
    'Keep sentences short and natural. Do not add new facts. Do not explain the translation. Return only the Tamil spoken text.',
    '',
    text,
  ].join('\n')
}

function tamilSuggestion(label: string, language: SpeechLanguage) {
  const casual = language === 'ta-LK'
  const map: Record<string, string> = {
    'Show more detail': casual ? 'மேலும் விவரம் பார்க்க' : 'மேலும் விவரம் பார்க்க',
    'Turn this into a task plan': casual ? 'இதை ஒரு செயல் திட்டமாக மாற்று' : 'இதை ஒரு செயல் திட்டமாக மாற்றவும்',
    'Search related files and emails': casual ? 'தொடர்புடைய கோப்புகள்/மின்னஞ்சல்கள் தேடு' : 'தொடர்புடைய கோப்புகள்/மின்னஞ்சல்கள் தேடவும்',
    'Draft the next message': casual ? 'அடுத்த செய்தி வரைவு எழுது' : 'அடுத்த செய்தி வரைவு உருவாக்கவும்',
    'Remind me later': casual ? 'பிறகு நினைவூட்டு' : 'பிறகு நினைவூட்டவும்',
    'Show the full original email': casual ? 'முழு அசல் மின்னஞ்சல் காட்டு' : 'முழு அசல் மின்னஞ்சலைக் காட்டவும்',
    'Find related emails in the same thread': casual ? 'அதே தொடரில் உள்ள மின்னஞ்சல்கள் தேடு' : 'அதே தொடரில் உள்ள மின்னஞ்சல்களைத் தேடவும்',
    'Extract attachments and real amounts only': casual ? 'இணைப்புகள் மற்றும் உண்மையான தொகைகள் மட்டும் எடு' : 'இணைப்புகள் மற்றும் உண்மையான தொகைகள் மட்டும் எடுக்கவும்',
    'Draft a reply for my approval': casual ? 'என் ஒப்புதலுக்கு பதில் வரைவு எழுது' : 'என் ஒப்புதலுக்காக பதில் வரைவு உருவாக்கவும்',
    'Add a reminder or follow-up task': casual ? 'நினைவூட்டு அல்லது follow-up பணி சேர்' : 'நினைவூட்டு அல்லது follow-up பணி சேர்க்கவும்',
  }
  return map[label] || label
}

export function fixTamilOutput(text: string, language: SpeechLanguage) {
  if (!isTamilSpeech(language)) return text
  let fixed = text
    .replace(/நீங்க\s+காலை\s+வணக்கம்[!,]?\s*/g, 'காலை வணக்கம் Silva! ')
    .replace(/நீங்கள்\s+காலை\s+வணக்கம்[!,]?\s*/g, 'காலை வணக்கம் Silva! ')
    .replace(/நீங்க\s+வணக்கம்[!,]?\s*/g, 'வணக்கம் Silva! ')
    .replace(/நீங்கள்\s+வணக்கம்[!,]?\s*/g, 'வணக்கம் Silva! ')
    .replace(/ஜென்\s*சில்\s*வா/g, 'ஜென்ஸ் சில்வா')
    .replace(/ஜென்\s*சில்வா/g, 'ஜென்ஸ் சில்வா')
    .replace(/ஜென்ஸ் சில்வா இருக்கிறேன்/g, 'ஜென்ஸ் சில்வா')
    .replace(/நான் ஜென்ஸ் சில்வா இருக்கிறேன்/g, 'நான் ஜென்ஸ் சில்வா')
    .replace(/நான் சில்வா இருக்கிறேன்/g, 'நான் சில்வா')
    .replace(/உங்களுக்கு எப்படி இருக்கிறதோம்\?/g, language === 'ta-LK' ? 'நீங்க எப்படி இருக்கீங்க?' : 'நீங்கள் எப்படி இருக்கிறீர்கள்?')
    .replace(/எப்படி இருக்கிறதோம்\?/g, language === 'ta-LK' ? 'எப்படி இருக்கீங்க?' : 'எப்படி இருக்கிறீர்கள்?')
    .replace(/நீங்கள் எப்படி இருக்கிறீர்கள்\?/g, language === 'ta-LK' ? 'நீங்க எப்படி இருக்கீங்க?' : 'நீங்கள் எப்படி இருக்கிறீர்கள்?')
    .replace(/Suggested next actions:/gi, 'அடுத்த பரிந்துரைகள்:')

  for (const suggestion of getFollowUpSuggestions('', text)) {
    fixed = fixed.replace(new RegExp(suggestion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), tamilSuggestion(suggestion, language))
  }

  if (/^வணக்கம்/i.test(fixed) && /நான் ஜென்ஸ் சில்வா/.test(fixed)) {
    fixed = fixed.replace(/வணக்கம்[!,]?\s*நான் ஜென்ஸ் சில்வா[.!]?\s*/i, language === 'ta-LK'
      ? 'வணக்கம்! நான் சில்வா. '
      : 'வணக்கம்! நான் ஜென்ஸ் சில்வா. ')
  }
  return fixed
}

export function getFollowUpSuggestions(prompt: string, response: string): string[] {
  const haystack = `${prompt}\n${response}`.toLowerCase()
  if (/\b(email|mail|inbox|outlook|invoice|rent|lancaster|debtors|reply)\b/.test(haystack)) {
    return [
      'Show the full original email',
      'Find related emails in the same thread',
      'Extract attachments and real amounts only',
      'Draft a reply for my approval',
      'Add a reminder or follow-up task',
    ]
  }
  if (/\b(property|shop|premises|undervalued|rent|yield)\b/.test(haystack)) {
    return [
      'Show images and listing links',
      'Compare sold prices nearby',
      'Estimate rental yield and refurb risk',
      'Check lease/freehold and planning risk',
      'Make a viewing/contact checklist',
    ]
  }
  if (/\b(code|build|fix|test|app|bug)\b/.test(haystack)) {
    return [
      'Run the relevant tests',
      'Show the changed files',
      'Check the app in browser',
      'Add missing edge cases',
      'Create a short implementation note',
    ]
  }
  if (/\b(legal|court|visa|solicitor|case|claim)\b/.test(haystack)) {
    return [
      'Show the evidence needed',
      'Draft a letter for approval',
      'Create a timeline of events',
      'List risks and deadlines',
      'Prepare questions for a human solicitor',
    ]
  }
  return [
    'Show more detail',
    'Turn this into a task plan',
    'Search related files and emails',
    'Draft the next message',
    'Remind me later',
  ]
}

export function appendFollowUpSuggestions(response: string, prompt: string) {
  if (/Suggested next actions:/i.test(response)) return response
  const suggestions = getFollowUpSuggestions(prompt, response)
  return `${response.trim()}\n\nSuggested next actions:\n${suggestions.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
}
