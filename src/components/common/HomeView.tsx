import { useEffect, useMemo, useState } from 'react'
import { useAppStore, useAgentsStore, useModelsStore, useChatStore, useConnectorsStore } from '@/stores'
import { cn } from '@/lib/utils'
import { invoke } from '@tauri-apps/api/core'
import type { ViewType } from '@/types'
import {
  Sparkles,
  Bot,
  Zap,
  FileText,
  Play,
  Clock,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  Wrench,
  Layers,
  Brain,
  Link2,
} from 'lucide-react'

const capabilities = [
  {
    icon: Bot,
    title: 'Local AI Engine',
    description: 'Powered by Jan + TurboQuant for local inference',
    color: 'primary',
    view: 'chat' as const,
  },
  {
    icon: Zap,
    title: 'Multi-Agent Orchestration',
    description: 'Coordinate multiple specialized agents',
    color: 'blue',
    view: 'agents' as const,
  },
  {
    icon: FileText,
    title: 'Deep Integrations',
    description: 'Connect to 50+ services and platforms',
    color: 'green',
    view: 'integrations' as const,
  },
  {
    icon: Play,
    title: 'Automation',
    description: 'Schedule tasks and workflow automations',
    color: 'purple',
    view: 'workspace' as const,
  },
]

const quickActions: Array<{ icon: React.ElementType; label: string; description: string; view: ViewType }> = [
  { icon: Bot, label: 'Start Chat', description: 'Begin a new conversation', view: 'chat' },
  { icon: Layers, label: 'Manage Agents', description: 'Configure AI agents', view: 'agents' },
  { icon: Zap, label: 'Browse Integrations', description: 'Connect new services', view: 'integrations' },
  { icon: Wrench, label: 'View Skills', description: 'Explore available tools', view: 'skills' },
]

export default function HomeView() {
  const { setCurrentView, sidebarCollapsed } = useAppStore()
  const { setComposerText } = useChatStore()
  const { connectors } = useConnectorsStore()
  const modelsStore = useModelsStore()
  const agentsStore = useAgentsStore()
  const [featuredPrompt, setFeaturedPrompt] = useState('')
  const [engineActive, setEngineActive] = useState(false)
  const [skillsCount, setSkillsCount] = useState(0)

  const enabledConnectors = useMemo(
    () => connectors.filter((connector) => connector.isEnabled).length,
    [connectors]
  )

  useEffect(() => {
    let cancelled = false

    const refreshHomeState = async () => {
      try {
        const [engine, skills] = await Promise.all([
          invoke('check_ai_status') as Promise<boolean>,
          invoke('list_skills') as Promise<Array<{ id: string }>>,
        ])

        if (!cancelled) {
          setEngineActive(engine)
          setSkillsCount(skills.length)
        }
      } catch (error) {
        console.error('Failed to refresh home state', error)
      }
    }

    refreshHomeState()
    const interval = window.setInterval(refreshHomeState, 2500)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  const handlePrompt = (prompt: string) => {
    if (!prompt.trim()) {
      setCurrentView('chat')
      return
    }
    setComposerText(prompt.trim())
    setCurrentView('chat')
  }

  const starterPrompts = [
    'Write code',
    'Analyze data',
    'Automate task',
    'Research',
    'Use my connected tools',
  ]
  return (
    <div className="h-full flex flex-col bg-light dark:bg-dark overflow-y-auto">
      {/* Hero Section */}
      <div className="flex-1 flex items-center justify-center px-8 py-12">
        <div className={cn('max-w-3xl w-full transition-all duration-300', sidebarCollapsed ? '' : '')}>
          {/* Logo */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center shadow-xl shadow-primary/20">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">genz...Silva OS</h1>
              <p className="text-gray-500 dark:text-gray-400">Local-First AI Workspace</p>
            </div>
          </div>

          {/* Status Badge */}
            <div className="flex items-center justify-center gap-2 mb-8">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 text-green-500">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium">Local AI Engine {useModelsStore(state => state.loadedModel ? 'Active' : 'Inactive')}</span>
            </div>
            {!useModelsStore(state => state.loadedModel) && (
              <button
                onClick={() => setCurrentView('model-hub')}
                className="px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
              >
                Load a Model
              </button>
            )}
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary">
                <span className="text-sm font-medium">{agentsStore.agents.length} Agents Available</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Brain className="w-4 h-4" />
                <span className="text-sm font-medium">{skillsCount} Skills Ready</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Link2 className="w-4 h-4" />
                <span className="text-sm font-medium">{enabledConnectors} Connected Tools</span>
              </div>
            </div>

          {/* Main Input */}
          <div className="relative mb-8">
            <div className="relative">
              <input
                type="text"
                placeholder="What can I do for you? Assign a task or ask anything."
                value={featuredPrompt}
                onChange={(e) => setFeaturedPrompt(e.target.value)}
                className="w-full px-6 py-4 pr-32 rounded-2xl bg-white dark:bg-dark-lighter border border-gray-200 dark:border-gray-700 text-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
              <button
                onClick={() => handlePrompt(featuredPrompt)}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors"
              >
                Ask
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 mt-4">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handlePrompt(prompt)}
                  className="px-4 py-2 rounded-full bg-light-muted dark:bg-dark text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Capabilities */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {capabilities.map((cap, index) => {
              const Icon = cap.icon
              return (
                <button
                  key={index}
                  onClick={() => setCurrentView(cap.view as 'chat' | 'agents' | 'integrations')}
                  className="p-4 rounded-xl bg-white dark:bg-dark-lighter border border-gray-100 dark:border-gray-800 hover:border-primary/50 transition-colors text-left group"
                >
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg mb-3 flex items-center justify-center',
                      cap.color === 'primary' && 'bg-primary/10',
                      cap.color === 'blue' && 'bg-blue-500/10',
                      cap.color === 'green' && 'bg-green-500/10',
                      cap.color === 'purple' && 'bg-purple-500/10'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-5 h-5',
                        cap.color === 'primary' && 'text-primary',
                        cap.color === 'blue' && 'text-blue-500',
                        cap.color === 'green' && 'text-green-500',
                        cap.color === 'purple' && 'text-purple-500'
                      )}
                    />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{cap.title}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{cap.description}</p>
                </button>
              )
            })}
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-dark-lighter rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {quickActions.map((action, index) => {
                const Icon = action.icon
                return (
                  <button
                    key={index}
                    onClick={() => setCurrentView(action.view as typeof action.view)}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-light-muted dark:hover:bg-dark transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">{action.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{action.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Recent Activity</h3>
              <button className="text-sm text-primary hover:underline">View all</button>
            </div>
            <div className="text-center py-8 text-gray-400">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No recent activity yet</p>
            </div>
          </div>

          {/* Tips */}
          <div className="mt-8 p-6 rounded-xl bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Pro Tip</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Press <kbd className="px-2 py-1 rounded bg-white dark:bg-dark text-xs font-mono">Ctrl+K</kbd> to open the command palette for quick access to all features.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">Powered by local AI</span>
            <span className="text-xs text-gray-400">|</span>
            <span className="text-sm text-gray-500">No data leaves your device</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="w-4 h-4" />
            <span>v1.0.0</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
