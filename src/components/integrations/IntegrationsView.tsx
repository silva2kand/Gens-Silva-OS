import { useState, useEffect } from 'react'
import { useAppStore, useConnectorsStore } from '@/stores'
import { cn } from '@/lib/utils'
import { invoke } from '@tauri-apps/api/core'
import {
  Plug,
  Search,
  Plus,
  Settings,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  ShieldCheck,
  Zap,
  Lock,
} from 'lucide-react'
import type { Connector, ConnectorCategory } from '@/types'
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
type AiProviderModel = {
  id: string
  label: string
  provider: string
  freeOnly: boolean
}
type MicrosoftGraphConfig = {
  clientId: string
  tenantId: string
  redirectUri: string
  scopes: string[]
  configured: boolean
  tokenConnected: boolean
}
type ClassicOutlookStatus = {
  installed: boolean
  running: boolean
  profileConnected: boolean
  accounts: Array<{ displayName: string; smtpAddress: string }>
  message: string
}

const categoryLabels: Record<ConnectorCategory, string> = {
  social: 'Social Media',
  email: 'Email & Calendar',
  calendar: 'Calendar',
  storage: 'File Storage',
  crm: 'CRM & Business',
  development: 'Development',
  database: 'Database',
  automation: 'Automation',
  ai: 'AI & Media',
  browser: 'Browser',
}

const categoryIcons: Record<ConnectorCategory, string> = {
  social: '📱',
  email: '📧',
  calendar: '📅',
  storage: '💾',
  crm: '💼',
  development: '🔧',
  database: '🗄️',
  automation: '⚡',
  ai: '🤖',
  browser: '🌐',
}

const featuredConnectors = [
  { id: 'my-browser', title: 'My Browser', description: 'Access the web on your own browser' },
  { id: 'gmail', title: 'Gmail', description: 'Draft replies, search your inbox, and summarize email threads instantly' },
  { id: 'outlook', title: 'Outlook Mail', description: 'Write, search, and manage your Outlook emails seamlessly' },
  { id: 'github', title: 'GitHub', description: 'Manage repositories, track code changes, and collaborate on projects' },
  { id: 'chatgpt', title: 'OpenAI', description: 'Leverage GPT models for intelligent text generation and processing' },
  { id: 'gemini', title: 'Google Gemini', description: 'Process multimodal content including text, images, and code' },
  { id: 'openrouter', title: 'OpenRouter', description: 'Access multiple AI models through one unified API' },
  { id: 'notion', title: 'Notion', description: 'Search workspace content, update notes, and automate workflows in Notion' },
  { id: 'huggingface', title: 'Hugging Face', description: 'Explore AI models, access datasets, and discover research trends' },
]

export default function IntegrationsView() {
  const { connectors, toggleConnector, addConnector } = useConnectorsStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory | 'all'>('all')
  const [isSyncing, setIsSyncing] = useState(false)
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [providerModels, setProviderModels] = useState<Record<string, AiProviderModel[]>>({})
  const [providerModelErrors, setProviderModelErrors] = useState<Record<string, string>>({})
  const [loadingProviderModels, setLoadingProviderModels] = useState<string | null>(null)
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null)
  const [microsoftGraph, setMicrosoftGraph] = useState<MicrosoftGraphConfig | null>(null)
  const [microsoftGraphMessage, setMicrosoftGraphMessage] = useState('')
  const [classicOutlook, setClassicOutlook] = useState<ClassicOutlookStatus | null>(null)

  const loadProviders = async () => {
    try {
      const list = await invoke('list_ai_providers') as AiProvider[]
      setProviders(list)
    } catch (e) {
      console.error('Failed to load AI providers', e)
    }
  }

  useEffect(() => {
    loadProviders()
    loadMicrosoftGraph()
  }, [])

  const loadMicrosoftGraph = async () => {
    try {
      const config = await invoke('get_microsoft_graph_config') as MicrosoftGraphConfig
      setMicrosoftGraph(config)
      const classicStatus = await invoke('classic_outlook_status') as ClassicOutlookStatus
      setClassicOutlook(classicStatus)
    } catch (e) {
      setMicrosoftGraphMessage(String(e))
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await invoke('get_system_info')
    } catch (e) {
      console.error('Sync failed', e)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleConnect = (id: string) => {
    toggleConnector(id)
  }

  const handleAddConnector = () => {
    const name = prompt('Connector name?')
    if (!name?.trim()) return
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    addConnector({
      id,
      name: name.trim(),
      description: 'Custom workspace connector',
      icon: 'plug',
      category: 'automation',
      status: 'disconnected',
      config: {},
      tools: ['custom_action'],
      authType: 'api_key',
      isEnabled: false,
    })
    setActiveCategory('automation')
    setSearchQuery(name.trim())
  }

  const loadProviderModels = async (id: string) => {
    setLoadingProviderModels(id)
    setProviderModelErrors((current) => ({ ...current, [id]: '' }))
    try {
      const models = await invoke('list_ai_provider_models', { providerId: id }) as AiProviderModel[]
      setProviderModels((current) => ({ ...current, [id]: models }))
    } catch (e) {
      setProviderModelErrors((current) => ({ ...current, [id]: String(e) }))
    } finally {
      setLoadingProviderModels(null)
    }
  }

  const saveMicrosoftGraph = async () => {
    const clientId = prompt('Microsoft Application (client) ID:', microsoftGraph?.clientId || '90613455-9738-4f79-8ad6-d257d173c929')
    if (!clientId?.trim()) return
    const tenantId = prompt('Microsoft Directory (tenant) ID:', microsoftGraph?.tenantId || '39f9740f-7162-4ff5-93ea-149c79ee1b7a')
    if (!tenantId?.trim()) return
    const redirectUri = prompt('Redirect URI:', microsoftGraph?.redirectUri || 'http://localhost:1420/') || 'http://localhost:1420/'
    try {
      const config = await invoke('save_microsoft_graph_config', { clientId, tenantId, redirectUri }) as MicrosoftGraphConfig
      setMicrosoftGraph(config)
      setMicrosoftGraphMessage('Microsoft Graph app registration saved locally. Sign in next to create a mailbox token.')
    } catch (e) {
      setMicrosoftGraphMessage(String(e))
    }
  }

  const openMicrosoftGraphSignIn = async () => {
    try {
      const url = await invoke('get_microsoft_graph_auth_url') as string
      await invoke('navigate', { url })
      setMicrosoftGraphMessage('Opened Microsoft Graph sign-in. If Microsoft says redirect mismatch, add http://localhost:1420/ as a SPA/public-client redirect URI in Azure. Classic Outlook is already the working free path.')
    } catch (e) {
      setMicrosoftGraphMessage(String(e))
    }
  }

  const connectorDisplayStatus = (connector: Connector) => {
    if (['outlook', 'onedrive'].includes(connector.id)) {
      if (connector.id === 'outlook' && classicOutlook?.profileConnected) return 'classic desktop connected'
      if (microsoftGraph?.tokenConnected) return 'connected'
      if (microsoftGraph?.configured) return 'app saved, sign-in needed'
      return 'not configured'
    }
    if (connector.authType === 'oauth' && connector.isEnabled && connector.status === 'connected') {
      return 'enabled, auth needed'
    }
    return connector.status
  }

  const filteredConnectors = connectors.filter((connector) => {
    const matchesSearch =
      connector.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      connector.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = activeCategory === 'all' || connector.category === activeCategory
    return matchesSearch && matchesCategory
  })

  return (
    <div className="h-full flex flex-col bg-light dark:bg-dark overflow-hidden">
      {/* Header */}
      <header className="h-14 px-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter shadow-sm">
        <div className="flex items-center gap-3">
          <Plug className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-gray-900 dark:text-white text-lg">Integrations</h1>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-black text-green-600 dark:text-green-400 uppercase tracking-wider">
              {connectors.filter((c) => c.isEnabled).length} Enabled
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleSync}
            className={cn(
              "p-2 rounded-xl hover:bg-light-muted dark:hover:bg-dark text-gray-500 transition-all",
              isSyncing && "animate-spin text-primary"
            )}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={handleAddConnector} className="btn-primary flex items-center gap-2 px-4 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" />
            <span className="font-bold">Add New</span>
          </button>
        </div>
      </header>

      {/* Search & Filters */}
      <div className="px-6 py-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter">
        <div className="flex flex-col gap-6">
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search 50+ integrations and tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-12 py-3 text-base shadow-inner"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
            <button
              onClick={() => setActiveCategory('all')}
              className={cn(
                'px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shrink-0',
                activeCategory === 'all'
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'bg-light-muted dark:bg-dark text-gray-500 hover:text-primary'
              )}
            >
              All
            </button>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveCategory(key as ConnectorCategory)}
                className={cn(
                  'px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2',
                  activeCategory === key
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-light-muted dark:bg-dark text-gray-500 hover:text-primary'
                )}
              >
                <span>{categoryIcons[key as ConnectorCategory]}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Integrations Grid */}
      <div className="flex-1 overflow-y-auto p-8 bg-light-muted/20 dark:bg-dark/10">
        <div className="mb-10">
          <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4 uppercase tracking-tighter">Add Connectors</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {featuredConnectors.map((item) => {
              const provider = providers.find((provider) =>
                provider.id === item.id ||
                provider.id === (item.id === 'chatgpt' ? 'chatgpt' : item.id) ||
                provider.id === (item.id === 'gemini' ? 'gemini' : item.id) ||
                provider.id === (item.id === 'openrouter' ? 'openrouter' : item.id)
              )
              const connector = connectors.find((connector) => connector.id === item.id)

              return (
                <div key={item.id} className="card border border-gray-100 dark:border-gray-800">
                  <h3 className="font-black text-gray-900 dark:text-white">{item.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-4">{item.description}</p>
                  <div className="flex gap-2">
                    {provider ? (
                      <>
                        <button
                          onClick={async () => {
                            await invoke('set_active_ai_provider', { providerId: provider.id })
                            await loadProviders()
                          }}
                          className="btn-primary flex-1 text-xs"
                        >
                          Use
                        </button>
                        <button
                          onClick={async () => {
                            const key = prompt(`Paste API key for ${provider.label}:`)
                            if (!key) return
                            await invoke('set_ai_provider_api_key', { providerId: provider.id, apiKey: key })
                            await loadProviders()
                          }}
                          className="btn-secondary flex-1 text-xs"
                        >
                          {provider.connected ? 'Settings' : 'Connect'}
                        </button>
                      </>
                    ) : connector ? (
                      <>
                        <button
                          onClick={() => handleConnect(connector.id)}
                          className="btn-primary flex-1 text-xs"
                        >
                          {connector.isEnabled ? 'Enabled' : 'Enable'}
                        </button>
                        <button onClick={() => connector && setSelectedConnector(connector)} className="btn-secondary flex-1 text-xs">
                          Settings
                        </button>
                      </>
                    ) : (
                      <button className="btn-secondary flex-1 text-xs">Coming Soon</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mb-10">
          <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4 uppercase tracking-tighter">AI Providers</h2>
          <div className="mb-4 p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-sm text-emerald-700 dark:text-emerald-300 font-semibold">
            Local is the default. OpenRouter and NVIDIA are protected by backend free-only guards, so paid model IDs are refused before any API call is sent.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {providers.map((p) => (
              <div key={p.id} className="card border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-black text-gray-900 dark:text-white">{p.label}</h3>
                  <div className="flex items-center gap-2">
                    {p.freeOnly && (
                      <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">
                        Free only
                      </span>
                    )}
                    <span className={cn('text-[10px] font-black uppercase', p.active ? 'text-primary' : 'text-gray-400')}>
                      {p.active ? 'Active' : 'Idle'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-2 truncate">{p.model}</p>
                <p className="text-xs text-gray-400 mb-4 truncate">{p.baseUrl}</p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await invoke('set_active_ai_provider', { providerId: p.id })
                      await loadProviders()
                    }}
                    className="btn-primary flex-1 text-xs"
                  >
                    Use
                  </button>
                  <button
                    onClick={async () => {
                      const key = prompt(`Paste API key for ${p.label}:`)
                      if (!key) return
                      await invoke('set_ai_provider_api_key', { providerId: p.id, apiKey: key })
                      await loadProviders()
                    }}
                    className="btn-secondary flex-1 text-xs"
                  >
                    {p.connected ? 'Update Key' : 'Add Key'}
                  </button>
                  {p.connectUrl && (
                    <button
                      onClick={() => window.open(p.connectUrl, '_blank')}
                      className="p-2 rounded-lg bg-light-muted dark:bg-dark text-gray-500"
                      title="Open provider portal"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {p.freeOnly && p.id !== 'local' && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <button
                      onClick={() => loadProviderModels(p.id)}
                      className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      {loadingProviderModels === p.id ? 'Checking free models...' : 'Show verified free models'}
                    </button>
                    {providerModelErrors[p.id] && (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{providerModelErrors[p.id]}</p>
                    )}
                    {providerModels[p.id] && (
                      <div className="mt-3 max-h-40 overflow-y-auto space-y-2">
                        {providerModels[p.id].length === 0 ? (
                          <p className="text-xs text-gray-500">
                            No verified free models found. This provider remains blocked from paid calls.
                          </p>
                        ) : (
                          providerModels[p.id].map((model) => (
                            <div key={model.id} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                              <p className="text-xs font-bold text-gray-800 dark:text-gray-100 truncate">{model.label}</p>
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 truncate">{model.id}</p>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-dark/40">
          <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">
            AI providers above are live connection targets. The catalog below lets you enable product capabilities in the workspace while deeper OAuth and API setup is added service-by-service.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredConnectors.map((connector) => (
            <div
              key={connector.id}
              className="card group hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/5 dark:hover:shadow-primary/5 transition-all duration-300 border border-gray-100 dark:border-gray-800 hover:border-primary/30"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-[1.25rem] bg-gradient-to-br from-primary/10 to-purple-500/10 flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition-transform">
                    {categoryIcons[connector.category]}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-gray-900 dark:text-white text-lg truncate group-hover:text-primary transition-colors">
                      {connector.name}
                    </h3>
                    <p className="text-xs text-gray-400 font-medium line-clamp-1">{connector.description}</p>
                  </div>
                </div>
                <div className={cn(
                  "p-1.5 rounded-lg border",
                  connector.isEnabled ? "bg-green-500/10 border-green-500/20" : "bg-gray-100 dark:bg-dark border-transparent"
                )}>
                  {connector.isEnabled ? (
                    <ShieldCheck className="w-4 h-4 text-green-500" />
                  ) : (
                    <Lock className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Tools Chips */}
              <div className="mb-8">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Available Tools</p>
                <div className="flex flex-wrap gap-2">
                  {connector.tools.map((tool) => (
                    <span
                      key={tool}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-dark border border-gray-100 dark:border-gray-800 text-[10px] font-bold text-gray-600 dark:text-gray-300 shadow-sm group-hover:border-primary/20 transition-colors"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-6 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => handleConnect(connector.id)}
                  className={cn(
                    'flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all',
                    connector.isEnabled
                      ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white'
                      : 'bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/20'
                  )}
                >
                  {connector.isEnabled ? 'Disable' : 'Enable'}
                </button>
                  <button onClick={() => setSelectedConnector(connector)} className="p-3 rounded-xl bg-light-muted dark:bg-dark text-gray-400 hover:text-primary transition-colors">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {selectedConnector && (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setSelectedConnector(null)}
          >
            <div
              className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl bg-white dark:bg-dark-lighter border border-gray-200 dark:border-gray-800 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 p-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter">
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">{selectedConnector.name}</h3>
                  <p className="text-sm text-gray-500">{selectedConnector.description}</p>
                </div>
                <button
                  onClick={() => setSelectedConnector(null)}
                  className="btn-secondary flex items-center gap-2 shrink-0"
                >
                  <XCircle className="w-5 h-5" />
                  <span>Close</span>
                </button>
              </div>
              <div className="space-y-4 p-6">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-light-muted dark:bg-dark p-3">
                    <p className="text-xs text-gray-400 uppercase font-black">Status</p>
                    <p className="font-bold text-gray-900 dark:text-white">{connectorDisplayStatus(selectedConnector)}</p>
                  </div>
                  <div className="rounded-xl bg-light-muted dark:bg-dark p-3">
                    <p className="text-xs text-gray-400 uppercase font-black">Auth</p>
                    <p className="font-bold text-gray-900 dark:text-white">{selectedConnector.authType}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-black mb-2">Tools</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedConnector.tools.map((tool) => (
                      <span key={tool} className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold">{tool}</span>
                    ))}
                  </div>
                </div>
                {['outlook', 'onedrive'].includes(selectedConnector.id) && (
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                    {selectedConnector.id === 'outlook' && (
                      <div className="mb-4 rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-green-600 dark:text-green-300 uppercase font-black">Classic Outlook Desktop</p>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                              {classicOutlook?.profileConnected
                                ? 'Free local desktop bridge is available. Hermes can read/search Inbox, Sent, and Drafts through your signed-in Outlook profile.'
                                : 'Open classic Outlook and make sure your mailbox profile is signed in, then refresh this panel.'}
                            </p>
                          </div>
                          {classicOutlook?.profileConnected ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg bg-white dark:bg-dark px-3 py-2 border border-gray-100 dark:border-gray-800">
                            <p className="text-gray-400 font-black uppercase">Installed</p>
                            <p className="font-bold text-gray-900 dark:text-white">{classicOutlook?.installed ? 'Yes' : 'Unknown'}</p>
                          </div>
                          <div className="rounded-lg bg-white dark:bg-dark px-3 py-2 border border-gray-100 dark:border-gray-800">
                            <p className="text-gray-400 font-black uppercase">Running</p>
                            <p className="font-bold text-gray-900 dark:text-white">{classicOutlook?.running ? 'Yes' : 'No'}</p>
                          </div>
                        </div>
                        {classicOutlook?.accounts?.length ? (
                          <div className="mt-3 space-y-1">
                            {classicOutlook.accounts.map((account) => (
                              <p key={`${account.displayName}-${account.smtpAddress}`} className="text-xs text-gray-600 dark:text-gray-300">
                                {account.displayName} {account.smtpAddress ? `(${account.smtpAddress})` : ''}
                              </p>
                            ))}
                          </div>
                        ) : null}
                        <button
                          onClick={loadMicrosoftGraph}
                          className="btn-secondary text-xs mt-3"
                        >
                          Refresh Outlook Status
                        </button>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-xs text-blue-600 dark:text-blue-300 uppercase font-black">Microsoft Graph</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                          {microsoftGraph?.tokenConnected
                            ? 'Live Microsoft Graph token is connected.'
                            : 'Optional cloud OAuth path. Classic Outlook Desktop is the free working path; Graph still needs token capture before live cloud access.'}
                        </p>
                      </div>
                      {microsoftGraph?.tokenConnected ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                      )}
                    </div>
                    <div className={cn(
                      'mb-3 rounded-lg px-3 py-2 text-xs font-bold',
                      microsoftGraph?.tokenConnected
                        ? 'bg-green-500/10 text-green-600 dark:text-green-300'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                    )}>
                      {microsoftGraph?.tokenConnected
                        ? 'Connected: Outlook/Calendar/Files token available.'
                        : 'Not connected yet: Graph token exchange still needs to be completed. Hermes can use Classic Outlook Desktop instead.'}
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs">
                      <div className="rounded-lg bg-white dark:bg-dark px-3 py-2 border border-gray-100 dark:border-gray-800">
                        <p className="text-gray-400 font-black uppercase">Client ID</p>
                        <p className="font-mono text-gray-700 dark:text-gray-200 break-all">{microsoftGraph?.clientId || 'Not saved'}</p>
                      </div>
                      <div className="rounded-lg bg-white dark:bg-dark px-3 py-2 border border-gray-100 dark:border-gray-800">
                        <p className="text-gray-400 font-black uppercase">Tenant ID</p>
                        <p className="font-mono text-gray-700 dark:text-gray-200 break-all">{microsoftGraph?.tenantId || 'Not saved'}</p>
                      </div>
                      <div className="rounded-lg bg-white dark:bg-dark px-3 py-2 border border-gray-100 dark:border-gray-800">
                        <p className="text-gray-400 font-black uppercase">Redirect URI</p>
                        <p className="font-mono text-gray-700 dark:text-gray-200 break-all">{microsoftGraph?.redirectUri || 'http://localhost:1420/'}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={saveMicrosoftGraph} className="btn-secondary text-xs">Save IDs</button>
                      <button onClick={openMicrosoftGraphSignIn} className="btn-primary text-xs">Open Graph Sign In</button>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-amber-600 dark:text-amber-300">
                      Azure redirect URI must include http://localhost:1420/. The old http://localhost redirect causes ERR_CONNECTION_REFUSED because no app is listening on port 80.
                    </p>
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                      Scopes: {(microsoftGraph?.scopes || []).join(', ')}
                    </p>
                    {microsoftGraphMessage && (
                      <p className="mt-3 text-xs font-semibold text-blue-600 dark:text-blue-300">{microsoftGraphMessage}</p>
                    )}
                  </div>
                )}
                <button
                  onClick={() => {
                    handleConnect(selectedConnector.id)
                    setSelectedConnector({ ...selectedConnector, isEnabled: !selectedConnector.isEnabled })
                  }}
                  className="btn-primary w-full"
                >
                  {selectedConnector.isEnabled ? 'Disable Connector' : 'Enable Connector'}
                </button>
                <button
                  onClick={() => setSelectedConnector(null)}
                  className="btn-secondary w-full"
                >
                  Close Settings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Security Banner */}
        <div className="mt-12 p-8 rounded-[2.5rem] bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 border border-primary/10 flex flex-col md:flex-row items-center gap-8">
          <div className="w-20 h-20 rounded-[2rem] bg-primary flex items-center justify-center shadow-2xl shadow-primary/30">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">Local-First Security</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium max-w-2xl">
              OAuth credentials and API tokens are encrypted and stored exclusively in your system's secure keychain. 
              <strong> genz...Silva OS</strong> never transmits your private keys to our servers.
            </p>
          </div>
          <div className="flex gap-4">
            {['G', 'GH', 'S'].map(p => (
              <div key={p} className="w-12 h-12 rounded-2xl bg-white dark:bg-dark shadow-xl flex items-center justify-center font-black text-primary border border-gray-100 dark:border-gray-800">
                {p}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
