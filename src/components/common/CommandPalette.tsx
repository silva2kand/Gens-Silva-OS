import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores'
import { cn } from '@/lib/utils'
import { 
  Search, 
  Command, 
  Zap, 
  Monitor, 
  Database, 
  Bot, 
  Plug, 
  Settings, 
  Palette,
  Terminal,
  Folder,
  ArrowRight,
  Sparkles,
  Clock,
  MessageSquare,
} from 'lucide-react'
import type { ViewType } from '@/types'

interface CommandItem {
  id: string
  label: string
  description: string
  icon: React.ElementType
  category: string
  action: () => void
}

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { setCurrentView } = useAppStore()
  const inputRef = useRef<HTMLInputElement>(null)

  const commands: CommandItem[] = [
    { id: 'chat', label: 'Start New Chat', description: 'Open a new conversation with local AI', icon: Sparkles, category: 'General', action: () => setCurrentView('chat') },
    { id: 'hub', label: 'Model Hub', description: 'Browse and download AI models', icon: Database, category: 'Navigation', action: () => setCurrentView('model-hub') },
    { id: 'computer', label: 'My Computer', description: 'Access local files and system', icon: Monitor, category: 'Navigation', action: () => setCurrentView('computer') },
    { id: 'agents', label: 'Agents', icon: Bot, description: 'Manage AI agents', category: 'Navigation', action: () => setCurrentView('agents') },
    { id: 'connectors', label: 'Connectors', description: 'Add and manage tool connections', icon: Plug, category: 'Navigation', action: () => setCurrentView('connectors') },
    { id: 'integrations', label: 'Integrations', description: 'Connect external services', icon: Plug, category: 'Navigation', action: () => setCurrentView('integrations') },
    { id: 'channels', label: 'Channels', description: 'Manage messaging channels', icon: MessageSquare, category: 'Navigation', action: () => setCurrentView('channels') },
    { id: 'scheduled', label: 'Scheduled Tasks', description: 'Manage recurring automations', icon: Clock, category: 'Navigation', action: () => setCurrentView('scheduled-tasks') },
    { id: 'terminal', label: 'Open Terminal', description: 'Run system commands', icon: Terminal, category: 'Quick Actions', action: () => { setCurrentView('computer'); /* Set active tab to terminal logic needed */ } },
    { id: 'theme', label: 'Appearance', description: 'Change theme and colors', icon: Palette, category: 'Settings', action: () => setCurrentView('appearance') },
    { id: 'settings', label: 'Settings', description: 'Configure application', icon: Settings, category: 'Settings', action: () => setCurrentView('settings') },
  ]

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  const filteredCommands = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      {/* Palette Container */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-dark-lighter rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Search Input */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <Command className="w-5 h-5 text-primary" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands, features, or tools..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400 text-lg font-medium"
          />
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-100 dark:bg-dark text-[10px] font-bold text-gray-400 uppercase">
            <span>Esc</span>
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filteredCommands.length > 0 ? (
            <div className="space-y-4">
              {/* Group by category */}
              {Array.from(new Set(filteredCommands.map(c => c.category))).map(category => (
                <div key={category}>
                  <h3 className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    {category}
                  </h3>
                  <div className="space-y-1">
                    {filteredCommands.filter(c => c.category === category).map(cmd => (
                      <button
                        key={cmd.id}
                        onClick={() => {
                          cmd.action()
                          setIsOpen(false)
                        }}
                        className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-primary/5 hover:text-primary transition-all group text-left"
                      >
                        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-dark flex items-center justify-center group-hover:bg-primary/10 group-hover:scale-110 transition-all">
                          <cmd.icon className="w-5 h-5 text-gray-500 group-hover:text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-primary transition-colors">
                            {cmd.label}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {cmd.description}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400">
              <Search className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">No results found for "{query}"</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-dark border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          <div className="flex gap-4">
            <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3 rotate-90" /> Select</span>
            <span className="flex items-center gap-1">Enter Run</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-3 h-3 text-yellow-500" />
            <span>genz...Silva OS v1.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}
