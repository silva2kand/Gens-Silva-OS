import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores'
import { invoke } from '@tauri-apps/api/core'
import { cn } from '@/lib/utils'
import {
  Home,
  MessageSquare,
  Bot,
  FolderKanban,
  Settings,
  Plug,
  Database,
  Monitor,
  Palette,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  BookOpen,
  Clock3,
} from 'lucide-react'
import type { ViewType } from '@/types'

const navItems: Array<{
  id: ViewType
  label: string
  icon: React.ElementType
  badge?: number
}> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'workspace', label: 'Workspace', icon: FolderKanban },
  { id: 'computer', label: 'My Computer', icon: Monitor },
  { id: 'model-hub', label: 'Model Hub', icon: Database },
  { id: 'connectors', label: 'Connectors', icon: Plug },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'channels', label: 'Channels', icon: MessageSquare },
  { id: 'scheduled-tasks', label: 'Scheduled Tasks', icon: Clock3 },
  { id: 'skills', label: 'Skills', icon: Layers },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'appearance', label: 'Appearance', icon: Palette },
]

export default function Sidebar() {
  const { currentView, setCurrentView, sidebarCollapsed, toggleSidebar } = useAppStore()
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [engineActive, setEngineActive] = useState(false)

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      try {
        const active = await invoke('check_ai_status') as boolean
        if (!cancelled) setEngineActive(active)
      } catch (error) {
        console.error('Failed to refresh engine status', error)
      }
    }

    refresh()
    const interval = window.setInterval(refresh, 2500)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return (
    <aside
      className={cn(
        'h-screen bg-white dark:bg-dark-lighter border-r border-gray-200 dark:border-gray-800',
        'flex flex-col transition-all duration-300 ease-in-out',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo Header */}
      <div className="h-16 flex items-center px-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center shadow-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-lg text-gray-900 dark:text-white">genz...Silva</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">OS v1.0</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentView === item.id
          const isHovered = hoveredItem === item.id

          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
                'transition-all duration-200 relative group',
                isActive
                  ? 'bg-primary/10 text-primary dark:text-primary-light'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-light-muted dark:hover:bg-dark hover:text-gray-900 dark:hover:text-gray-100'
              )}
            >
              <Icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'text-primary')} />
              {!sidebarCollapsed && (
                <span className="font-medium text-sm">{item.label}</span>
              )}
              {item.badge && item.badge > 0 && (
                <span className={cn(
                  'absolute top-1 min-w-[20px] h-5 flex items-center justify-center',
                  'text-xs font-bold rounded-full bg-primary text-white',
                  sidebarCollapsed ? 'right-1' : 'right-3'
                )}>
                  {item.badge}
                </span>
              )}
              {sidebarCollapsed && (
                <div className={cn(
                  'absolute left-full ml-2 px-3 py-1.5 bg-dark-lighter text-white',
                  'text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible',
                  'transition-all duration-200 whitespace-nowrap z-50 shadow-xl'
                )}>
                  {item.label}
                </div>
              )}
            </button>
          )
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-800">
        <button
          onClick={toggleSidebar}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-3 py-2',
            'rounded-lg text-gray-500 dark:text-gray-400',
            'hover:bg-light-muted dark:hover:bg-dark transition-colors duration-200'
          )}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
      </div>

        {/* Footer Status */}
        {!sidebarCollapsed && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                engineActive ? "bg-green-500" : "bg-gray-400"
              )} />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Local AI Engine {engineActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        )}
    </aside>
  )
}
