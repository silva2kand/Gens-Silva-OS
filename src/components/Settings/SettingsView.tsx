import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores'
import {
  User,
  Monitor,
  Database,
  Palette,
  FolderKanban,
  Plug,
  Shield,
  Bell,
  Clock,
  FileText,
  Mail,
  ChevronRight,
  Save,
} from 'lucide-react'

type SettingsSection = 'user' | 'system' | 'workspace' | 'integrations' | 'privacy' | 'appearance'

type LocalSettings = {
  userName: string
  email: string
  dataControls: boolean
  myComputer: boolean
  personalization: boolean
  knowledge: boolean
  skills: boolean
  storeHistory: boolean
  allowAnalytics: boolean
  theme: string
  language: string
  accentColor: string
  customTheme: string
}

const defaultSettings: LocalSettings = {
  userName: 'genz...Silva User',
  email: 'user@example.com',
  dataControls: true,
  myComputer: true,
  personalization: true,
  knowledge: true,
  skills: true,
  storeHistory: true,
  allowAnalytics: false,
  theme: 'dark',
  language: 'en',
  accentColor: '#8B5CF6',
  customTheme: '',
}

export default function SettingsView() {
  const { setCurrentView, setTheme } = useAppStore()
  const [activeSection, setActiveSection] = useState<SettingsSection>('user')
  const [saveStatus, setSaveStatus] = useState('')
  const [settings, setSettings] = useState<LocalSettings>(() => {
    const saved = localStorage.getItem('gsos.settings')
    if (saved) {
      try {
        return { ...defaultSettings, ...JSON.parse(saved) }
      } catch {
        localStorage.removeItem('gsos.settings')
      }
    }
    return defaultSettings
  })

  useEffect(() => {
    document.documentElement.style.setProperty('--gsos-accent', settings.accentColor)
  }, [settings.accentColor])

  const sections: Array<{ id: SettingsSection; label: string; icon: React.ElementType }> = [
    { id: 'user', label: 'User', icon: User },
    { id: 'system', label: 'System', icon: Monitor },
    { id: 'workspace', label: 'Workspace', icon: FolderKanban },
    { id: 'integrations', label: 'Integrations', icon: Plug },
    { id: 'privacy', label: 'Privacy & Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ]

  const handleToggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const saveSettings = () => {
    localStorage.setItem('gsos.settings', JSON.stringify(settings))
    setTheme(settings.theme as 'light' | 'dark' | 'system')
    setSaveStatus('Saved locally')
    window.setTimeout(() => setSaveStatus(''), 1800)
  }

  return (
    <div className="h-full flex bg-light dark:bg-dark">
      {/* Settings Sidebar */}
      <aside className="w-64 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter p-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>
        <nav className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon
            const isActive = activeSection === section.id
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary dark:text-primary-light'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-light-muted dark:hover:bg-dark'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{section.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Settings Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          {activeSection === 'user' && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">User Profile</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={settings.userName}
                    onChange={(e) => setSettings((prev) => ({ ...prev, userName: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings((prev) => ({ ...prev, email: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Scheduled Tasks</h3>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-light-muted dark:bg-dark">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">Daily Report</p>
                        <p className="text-sm text-gray-500">9:00 AM daily</p>
                      </div>
                    </div>
                    <button onClick={() => setCurrentView('scheduled-tasks')} className="text-sm text-primary hover:underline">Edit</button>
                    <button
                      onClick={() => setCurrentView('scheduled-tasks')}
                      className="text-sm text-primary hover:underline"
                    >
                      Manage
                    </button>
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Mail ME</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-primary" />
                      <span className="text-gray-700 dark:text-gray-300">Email summary to inbox</span>
                    </div>
                    <button onClick={() => setCurrentView('channels')} className="btn-primary">Configure</button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'system' && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">System</h2>
              <div className="space-y-4">
                <ToggleItem
                  id="dataControls"
                  label="Data Controls"
                  description="Manage local data storage and privacy"
                  checked={settings.dataControls}
                  onChange={() => handleToggle('dataControls')}
                />
                <ToggleItem
                  id="myComputer"
                  label="My Computer"
                  description="Access local files and system resources"
                  checked={settings.myComputer}
                  onChange={() => handleToggle('myComputer')}
                />
                <ToggleItem
                  id="personalization"
                  label="Personalization"
                  description="Customize AI behavior and responses"
                  checked={settings.personalization}
                  onChange={() => handleToggle('personalization')}
                />
                <ToggleItem
                  id="knowledge"
                  label="Knowledge Base"
                  description="Enable knowledge retrieval and context"
                  checked={settings.knowledge}
                  onChange={() => handleToggle('knowledge')}
                />
                <ToggleItem
                  id="skills"
                  label="Skills & Tools"
                  description="Enable MCP tools and integrations"
                  checked={settings.skills}
                  onChange={() => handleToggle('skills')}
                />
              </div>
            </section>
          )}

          {activeSection === 'integrations' && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Connected Services</h2>
              <div className="space-y-4">
                <div className="card flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <span className="text-xl">G</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Google</p>
                      <p className="text-sm text-gray-500">Gmail, Calendar, Drive</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCurrentView('integrations')}
                    className="btn-secondary"
                  >
                    Connect
                  </button>
                </div>
                <div className="card flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gray-900/10 flex items-center justify-center">
                      <span className="text-xl">GH</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">GitHub</p>
                      <p className="text-sm text-gray-500">Repositories, Issues, Actions</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCurrentView('integrations')}
                    className="btn-secondary"
                  >
                    Connect
                  </button>
                </div>
                <button
                  onClick={() => setCurrentView('integrations')}
                  className="w-full py-3 text-center text-primary hover:underline text-sm"
                >
                  View all integrations
                </button>
              </div>
            </section>
          )}

          {activeSection === 'privacy' && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Privacy & Security</h2>
              <div className="space-y-4">
                <ToggleItem
                  id="storeHistory"
                  label="Store Chat History"
                  description="Save conversation history locally"
                  checked={settings.storeHistory}
                  onChange={() => handleToggle('storeHistory')}
                />
                <ToggleItem
                  id="allowAnalytics"
                  label="Anonymous Analytics"
                  description="Help improve genz...Silva OS"
                  checked={settings.allowAnalytics}
                  onChange={() => handleToggle('allowAnalytics')}
                />
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Local AI Engine</h3>
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <Shield className="w-5 h-5" />
                      <span className="font-medium">All AI inference is local</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      No data is sent to external AI services. All reasoning happens on your device.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'appearance' && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Appearance</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Theme
                  </label>
                  <div className="flex gap-4">
                    {['light', 'dark', 'system'].map((theme) => (
                      <button
                        key={theme}
                        onClick={() => {
                          setSettings((prev) => ({ ...prev, theme }))
                          setTheme(theme as 'light' | 'dark' | 'system')
                        }}
                        className={`px-4 py-2 rounded-lg capitalize ${
                          settings.theme === theme
                            ? 'bg-primary text-white'
                            : 'bg-light-muted dark:bg-dark text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Language
                  </label>
                  <select
                    value={settings.language}
                    onChange={(e) => setSettings((prev) => ({ ...prev, language: e.target.value }))}
                    className="input-field"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="zh">中文</option>
                    <option value="ja">日本語</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Accent Color
                  </label>
                  <div className="flex gap-3">
                    {['#8B5CF6', '#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'].map((color) => (
                      <button
                        key={color}
                        onClick={() => setSettings((prev) => ({ ...prev, accentColor: color }))}
                        className={`w-10 h-10 rounded-full transition-transform ${
                          settings.accentColor === color ? 'scale-110 ring-2 ring-offset-2 ring-primary' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Custom Themes
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {['Quantum Blue', 'Cyber Neon', 'Aurora Green', 'Sunset Orange'].map((themeName) => (
                      <button
                        key={themeName}
                        onClick={() => setSettings((prev) => ({ ...prev, customTheme: themeName }))}
                        className="p-4 rounded-xl bg-gradient-to-br from-primary/20 to-purple-400/20 border border-primary/20 hover:border-primary/40 transition-colors text-left"
                      >
                        <span className="font-medium text-gray-900 dark:text-white">{themeName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
            <button onClick={saveSettings} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              Save Changes
            </button>
            {saveStatus && <span className="text-sm text-green-600 dark:text-green-400">{saveStatus}</span>}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function ToggleItem({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string
  label: string
  description?: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="card flex items-center justify-between">
      <div>
        <p className="font-medium text-gray-900 dark:text-white">{label}</p>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        data-checked={checked ? 'true' : 'false'}
        onClick={onChange}
        className="toggle-switch"
      />
    </div>
  )
}
