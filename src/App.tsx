import { useState, useEffect } from 'react'
import { useAppStore } from '@/stores'
import Sidebar from '@/components/Sidebar/Sidebar'
import ChatView from '@/components/Chat/ChatView'
import AgentsView from '@/components/Agents/AgentsView'
import WorkspaceView from '@/components/workspace/WorkspaceView'
import SettingsView from '@/components/Settings/SettingsView'
import IntegrationsView from '@/components/integrations/IntegrationsView'
import ModelHubView from '@/components/model-hub/ModelHubView'
import ComputerView from '@/components/computer/ComputerView'
import AppearanceView from '@/components/Settings/AppearanceView'
import HomeView from '@/components/common/HomeView'
import CommandPalette from '@/components/common/CommandPalette'
import SkillsView from '@/components/skills/SkillsView'
import KnowledgeView from '@/components/knowledge/KnowledgeView'
import ChannelsView from '@/components/channels/ChannelsView'
import ScheduledTasksView from '@/components/scheduled/ScheduledTasksView'
import ConnectorsView from '@/components/Connectors/ConnectorsView'

function App() {
  const { currentView, theme } = useAppStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    // Apply theme to document
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'light') {
      root.classList.remove('dark')
    } else {
      // System preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
  }, [theme])

  if (!mounted) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-light dark:bg-dark">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-gray-500 dark:text-gray-400">Loading genz...Silva OS</span>
        </div>
      </div>
    )
  }

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return <HomeView />
      case 'chat':
        return <ChatView />
      case 'agents':
        return <AgentsView />
      case 'workspace':
        return <WorkspaceView />
      case 'settings':
        return <SettingsView />
      case 'connectors':
        return <ConnectorsView />
      case 'integrations':
        return <IntegrationsView />
      case 'model-hub':
        return <ModelHubView />
      case 'computer':
        return <ComputerView />
      case 'appearance':
        return <AppearanceView />
      case 'skills':
        return <SkillsView />
      case 'knowledge':
        return <KnowledgeView />
      case 'channels':
        return <ChannelsView />
      case 'scheduled-tasks':
        return <ScheduledTasksView />
      default:
        return <HomeView />
    }
  }

  return (
    <div className="h-screen w-screen flex bg-light dark:bg-dark overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {renderView()}
      </main>
      <CommandPalette />
    </div>
  )
}

export default App
