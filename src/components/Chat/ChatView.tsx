import { useState } from 'react'
import { useAppStore, useChatStore } from '@/stores'
import ChatInterface from './ChatInterface'
import ChatHistory from './ChatHistory'
import ChatInput from './ChatInput'
import { cn } from '@/lib/utils'
import { MessageSquare, Plus, MoreVertical, Search } from 'lucide-react'

export default function ChatView() {
  const { setCurrentView } = useAppStore()
  const { clearMessages } = useChatStore()
  const [showHistory, setShowHistory] = useState(true)
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="h-full flex flex-col bg-light dark:bg-dark">
      {/* Header */}
      <header className="h-14 px-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-gray-900 dark:text-white">Chat</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              showHistory
                ? 'bg-primary/10 text-primary'
                : 'text-gray-500 hover:bg-light-muted dark:hover:bg-dark'
            )}
          >
            <Search className="w-4 h-4" />
          </button>
          <button onClick={() => setShowMenu((value) => !value)} className="p-2 rounded-lg text-gray-500 hover:bg-light-muted dark:hover:bg-dark">
            <MoreVertical className="w-4 h-4" />
          </button>
          {showMenu && (
            <div className="absolute right-32 top-12 z-20 w-44 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-lighter shadow-xl p-2">
              <button
                onClick={() => {
                  clearMessages()
                  setShowMenu(false)
                }}
                className="w-full px-3 py-2 text-left text-sm rounded-lg hover:bg-light-muted dark:hover:bg-dark text-gray-700 dark:text-gray-200"
              >
                Clear chat
              </button>
              <button
                onClick={() => {
                  setShowHistory((value) => !value)
                  setShowMenu(false)
                }}
                className="w-full px-3 py-2 text-left text-sm rounded-lg hover:bg-light-muted dark:hover:bg-dark text-gray-700 dark:text-gray-200"
              >
                Toggle history
              </button>
            </div>
          )}
          <button
            onClick={() => {
              clearMessages()
              setCurrentView('chat')
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat History Sidebar */}
        {showHistory && (
          <div className="w-72 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter">
            <ChatHistory />
          </div>
        )}

        {/* Chat Interface */}
        <div className="flex-1 flex flex-col">
          <ChatInterface />
          <ChatInput />
        </div>
      </div>
    </div>
  )
}
