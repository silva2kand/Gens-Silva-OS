import { useState } from 'react'
import { useAppStore } from '@/stores'
import { cn } from '@/lib/utils'
import { Monitor, Palette } from 'lucide-react'

const presetThemes = [
  { id: 'default', name: 'Default', colors: { primary: '#8B5CF6', bg: '#111827' } },
  { id: 'quantum-blue', name: 'Quantum Blue', colors: { primary: '#3B82F6', bg: '#0a1628' } },
  { id: 'cyber-neon', name: 'Cyber Neon', colors: { primary: '#00FF88', bg: '#0a0a0a' } },
  { id: 'aurora-green', name: 'Aurora Green', colors: { primary: '#10B981', bg: '#064e3b' } },
  { id: 'sunset-orange', name: 'Sunset Orange', colors: { primary: '#F59E0B', bg: '#1c1410' } },
  { id: 'rose-pink', name: 'Rose Pink', colors: { primary: '#EC4899', bg: '#1f1021' } },
]

export default function AppearanceView() {
  const { theme, setTheme } = useAppStore()
  const [accentColor, setAccentColorState] = useState(localStorage.getItem('gsos.accentColor') || '#8B5CF6')
  const [selectedTheme, setSelectedThemeState] = useState(localStorage.getItem('gsos.appearanceTheme') || 'default')
  const [interfaceFont, setInterfaceFont] = useState(localStorage.getItem('gsos.interfaceFont') || 'Inter')
  const [codeFont, setCodeFont] = useState(localStorage.getItem('gsos.codeFont') || 'JetBrains Mono')
  const [effects, setEffects] = useState({
    transparentWindows: localStorage.getItem('gsos.transparentWindows') === 'true',
    blurEffects: localStorage.getItem('gsos.blurEffects') !== 'false',
    animations: localStorage.getItem('gsos.animations') !== 'false',
  })

  const setAccentColor = (color: string) => {
    localStorage.setItem('gsos.accentColor', color)
    document.documentElement.style.setProperty('--gsos-accent', color)
    setAccentColorState(color)
  }

  const setSelectedTheme = (id: string) => {
    localStorage.setItem('gsos.appearanceTheme', id)
    setSelectedThemeState(id)
    const preset = presetThemes.find((item) => item.id === id)
    if (preset) setAccentColor(preset.colors.primary)
  }

  const toggleEffect = (key: keyof typeof effects) => {
    setEffects((current) => {
      const next = { ...current, [key]: !current[key] }
      localStorage.setItem(`gsos.${key}`, String(next[key]))
      return next
    })
  }

  return (
    <div className="h-full flex flex-col bg-light dark:bg-dark">
      {/* Header */}
      <header className="h-14 px-6 flex items-center border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter">
        <Palette className="w-5 h-5 text-primary mr-3" />
        <h1 className="font-semibold text-gray-900 dark:text-white">Appearance</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Theme Selection */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Theme</h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { id: 'light', name: 'Light', bg: '#FFFFFF', text: '#111827' },
                { id: 'dark', name: 'Dark', bg: '#111827', text: '#F9FAFB' },
                { id: 'system', name: 'System', bg: 'linear-gradient(90deg, #fff 50%, #111827 50%)', text: '#111827' },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => setTheme(option.id as 'light' | 'dark' | 'system')}
                  className={cn(
                    'relative p-4 rounded-xl border-2 transition-all',
                    theme === option.id
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  )}
                >
                  <div
                    className="w-full h-24 rounded-lg mb-3 flex items-center justify-center text-sm font-medium"
                    style={{
                      background: option.bg,
                      color: option.id === 'dark' ? '#fff' : option.id === 'light' ? '#111' : '#111',
                    }}
                  >
                    {option.name}
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{option.name}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Accent Color */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Accent Color</h2>
            <div className="flex flex-wrap gap-3">
              {[
                { color: '#8B5CF6', name: 'Purple' },
                { color: '#6366F1', name: 'Indigo' },
                { color: '#3B82F6', name: 'Blue' },
                { color: '#10B981', name: 'Emerald' },
                { color: '#F59E0B', name: 'Amber' },
                { color: '#EF4444', name: 'Red' },
                { color: '#EC4899', name: 'Pink' },
                { color: '#14B8A6', name: 'Teal' },
              ].map((option) => (
                <button
                  key={option.color}
                  onClick={() => setAccentColor(option.color)}
                  className={cn(
                    'relative w-12 h-12 rounded-full transition-transform',
                    accentColor === option.color && 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white scale-110'
                  )}
                  style={{ backgroundColor: option.color }}
                  title={option.name}
                >
                  {accentColor === option.color && (
                    <span className="absolute inset-0 flex items-center justify-center text-white">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Custom Themes */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">TurboQuant Themes</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Custom GPU-accelerated themes powered by TurboQuant technology
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {presetThemes.map((themeOption) => (
                <button
                  key={themeOption.id}
                  onClick={() => setSelectedTheme(themeOption.id)}
                  className={cn(
                    'p-4 rounded-xl border-2 transition-all text-left',
                    selectedTheme === themeOption.id
                      ? 'border-primary'
                      : 'border-transparent hover:border-gray-200 dark:hover:border-gray-700'
                  )}
                  style={{
                    background: `linear-gradient(135deg, ${themeOption.colors.bg} 0%, ${themeOption.colors.bg} 100%)`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: themeOption.colors.primary }}
                    />
                    <span className="text-sm font-medium text-white">{themeOption.name}</span>
                  </div>
                  <div className="text-xs text-gray-400">Powered by TurboQuant</div>
                </button>
              ))}
            </div>
          </section>

          {/* Font Settings */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Typography</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Interface Font</p>
                  <p className="text-sm text-gray-500">Used for UI elements</p>
                </div>
                <select
                  value={interfaceFont}
                  onChange={(event) => {
                    setInterfaceFont(event.target.value)
                    localStorage.setItem('gsos.interfaceFont', event.target.value)
                  }}
                  className="input-field w-48"
                >
                  <option>Inter</option>
                  <option>SF Pro</option>
                  <option>Segoe UI</option>
                  <option>Roboto</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Code Font</p>
                  <p className="text-sm text-gray-500">Used for code blocks</p>
                </div>
                <select
                  value={codeFont}
                  onChange={(event) => {
                    setCodeFont(event.target.value)
                    localStorage.setItem('gsos.codeFont', event.target.value)
                  }}
                  className="input-field w-48"
                >
                  <option>JetBrains Mono</option>
                  <option>Fira Code</option>
                  <option>Consolas</option>
                  <option>Monaco</option>
                </select>
              </div>
            </div>
          </section>

          {/* Window Effects */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Window Effects</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Transparent Windows</p>
                  <p className="text-sm text-gray-500">Enable transparency for window backgrounds</p>
                </div>
                <button onClick={() => toggleEffect('transparentWindows')} className="toggle-switch" data-checked={effects.transparentWindows ? 'true' : 'false'} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Blur Effects</p>
                  <p className="text-sm text-gray-500">Apply blur to behind windows</p>
                </div>
                <button onClick={() => toggleEffect('blurEffects')} className="toggle-switch" data-checked={effects.blurEffects ? 'true' : 'false'} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Animations</p>
                  <p className="text-sm text-gray-500">Enable smooth window transitions</p>
                </div>
                <button onClick={() => toggleEffect('animations')} className="toggle-switch" data-checked={effects.animations ? 'true' : 'false'} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
