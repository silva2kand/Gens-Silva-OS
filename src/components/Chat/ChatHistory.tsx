import { useState } from 'react'
import { cn, formatDate } from '@/lib/utils'
import { Search, Clock, Star, Trash2 } from 'lucide-react'
import { useChatStore } from '@/stores'

interface ChatHistoryItem {
  id: string
  title: string
  preview: string
  timestamp: Date
  starred: boolean
}

export default function ChatHistory() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'recent' | 'starred'>('recent')
  const { messages, updateMessage, deleteMessage, setComposerText } = useChatStore()

  const history = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map<ChatHistoryItem>((message) => {
      const title = message.role === 'user' ? message.content : `Reply from ${message.model || 'assistant'}`
      return {
        id: message.id,
        title: title.split('\n')[0].slice(0, 80) || 'Untitled message',
        preview: message.content.slice(0, 140),
        timestamp: message.timestamp,
        starred: Boolean(message.starred),
      }
    })
    .reverse()

  const filteredHistory = history.filter((item) => {
    if (activeTab === 'starred' && !item.starred) return false
    return (
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.preview.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-10 py-2 text-sm"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('recent')}
          className={cn(
            'flex-1 px-4 py-2 text-sm font-medium border-b-2',
            activeTab === 'recent'
              ? 'text-primary border-primary'
              : 'text-gray-500 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
          )}
        >
          Recent
        </button>
        <button
          onClick={() => setActiveTab('starred')}
          className={cn(
            'flex-1 px-4 py-2 text-sm font-medium border-b-2',
            activeTab === 'starred'
              ? 'text-primary border-primary'
              : 'text-gray-500 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
          )}
        >
          <Star className="w-4 h-4 inline mr-1" />
          Starred
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {filteredHistory.length === 0 && (
            <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
              No real chat history in this session yet.
            </div>
          )}
          {filteredHistory.map((item) => (
            <div
              key={item.id}
              onClick={() => setComposerText(item.preview)}
              className={cn(
                'w-full p-3 rounded-lg text-left transition-colors cursor-pointer',
                'hover:bg-light-muted dark:hover:bg-dark group'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {item.starred && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                    <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {item.title}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                    {item.preview}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    className={cn(
                      'p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded',
                      item.starred && 'text-yellow-500'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateMessage(item.id, { starred: !item.starred })
                    }}
                    title={item.starred ? 'Unstar message' : 'Star message'}
                  >
                    <Star className={cn('w-4 h-4', item.starred && 'fill-yellow-500')} />
                  </button>
                  <button 
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMessage(item.id)
                    }}
                    title="Delete message"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-400">
                <Clock className="w-3 h-3" />
                {formatDate(item.timestamp)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
