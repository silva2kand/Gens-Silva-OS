import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  BookOpen,
  Search,
  Plus,
  FileText,
  Brain,
  ShieldCheck,
  ChevronRight,
  Clock,
  MoreVertical,
  Trash2,
  Settings,
  Globe,
  Database,
} from 'lucide-react'

type KnowledgeDocument = {
  id: string
  title: string
  type: string
  size: string
  date: string
  status: 'indexed' | 'processing'
}

const defaultDocuments: KnowledgeDocument[] = [
  { id: '1', title: 'Company Policy 2024', type: 'pdf', size: '1.2 MB', date: '2 days ago', status: 'indexed' },
  { id: '2', title: 'Q3 Financial Report', type: 'docx', size: '840 KB', date: '5 hours ago', status: 'indexed' },
  { id: '3', title: 'Technical Architecture', type: 'md', size: '42 KB', date: 'Just now', status: 'processing' },
  { id: '4', title: 'User Interview Notes', type: 'txt', size: '12 KB', date: '1 week ago', status: 'indexed' },
]

export default function KnowledgeView() {
  const [searchQuery, setSearchQuery] = useState('')
  const [documents, setDocuments] = useState<KnowledgeDocument[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('gsos.knowledge.documents') || '') || defaultDocuments
    } catch {
      return defaultDocuments
    }
  })

  const saveDocuments = (next: KnowledgeDocument[]) => {
    setDocuments(next)
    localStorage.setItem('gsos.knowledge.documents', JSON.stringify(next))
  }

  const addSource = () => {
    const title = prompt('Knowledge source title or path?')
    if (!title?.trim()) return
    const type = title.includes('.') ? title.split('.').pop() || 'source' : 'source'
    saveDocuments([
      {
        id: Date.now().toString(),
        title: title.trim(),
        type,
        size: 'Pending',
        date: 'Just now',
        status: 'processing',
      },
      ...documents,
    ])
  }

  const deleteSource = (id: string) => {
    saveDocuments(documents.filter((doc) => doc.id !== id))
  }

  const filteredDocuments = documents.filter((doc) => (
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.status.toLowerCase().includes(searchQuery.toLowerCase())
  ))

  return (
    <div className="h-full flex flex-col bg-light dark:bg-dark overflow-hidden">
      {/* Header */}
      <header className="h-14 px-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter shadow-sm">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-gray-900 dark:text-white text-lg">Knowledge Base</h1>
          <div className="px-3 py-1 rounded-full bg-blue-500/5 border border-blue-500/10">
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider">Vector Index Active</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search knowledge..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-10 w-80 text-sm"
            />
          </div>
          <button onClick={addSource} className="btn-primary flex items-center gap-2 px-4 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" />
            <span className="font-bold">Add Source</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-light-muted/20 dark:bg-dark/10">
        <div className="max-w-6xl mx-auto">
          {/* Stats & Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="card bg-gradient-to-br from-primary/5 to-transparent">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Neural Memory</p>
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter">{documents.length * 312} Vectors</h3>
                </div>
              </div>
              <p className="text-xs text-gray-500 font-medium">Embeddings stored locally in SQLite-VSS</p>
            </div>

            <div className="card">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <Database className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Local Sources</p>
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter">{documents.length} Files</h3>
                </div>
              </div>
              <p className="text-xs text-gray-500 font-medium">Synchronized with your Workspace</p>
            </div>

            <div className="card">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Web Crawls</p>
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter">{documents.filter((doc) => doc.type === 'url' || doc.title.startsWith('http')).length} Sites</h3>
                </div>
              </div>
              <p className="text-xs text-gray-500 font-medium">Auto-updated documentation</p>
            </div>
          </div>

          {/* Documents List */}
          <div className="space-y-6">
            <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter flex items-center gap-3">
              Indexed Documents
              <span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-black text-gray-500">
                {filteredDocuments.length} Items
              </span>
            </h2>

            <div className="space-y-3">
              {filteredDocuments.map((doc) => (
                <div 
                  key={doc.id}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-dark-lighter border border-gray-100 dark:border-gray-800 hover:border-primary/30 hover:shadow-xl hover:shadow-black/5 transition-all group"
                >
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    doc.status === 'processing' ? "bg-yellow-500/10" : "bg-gray-100 dark:bg-dark"
                  )}>
                    <FileText className={cn(
                      "w-6 h-6",
                      doc.status === 'processing' ? "text-yellow-600 animate-pulse" : "text-gray-400"
                    )} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-gray-900 dark:text-white truncate">{doc.title}</h4>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{doc.type}</span>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">•</span>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{doc.size}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right hidden md:block">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Added</p>
                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{doc.date}</p>
                    </div>

                    <div className={cn(
                      "px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest",
                      doc.status === 'indexed' ? "bg-green-500/10 border-green-500/20 text-green-600" : "bg-yellow-500/10 border-yellow-500/20 text-yellow-600"
                    )}>
                      {doc.status}
                    </div>

                    <button onClick={() => deleteSource(doc.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security Banner */}
          <div className="mt-12 p-8 rounded-[2.5rem] bg-gradient-to-br from-green-500/5 via-transparent to-primary/5 border border-green-500/10 flex items-center gap-8">
            <div className="w-20 h-20 rounded-[2rem] bg-green-500 flex items-center justify-center shadow-2xl shadow-green-500/30">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">Private Context Engine</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium max-w-2xl">
                Your documents never leave this machine. Embeddings are generated using your local GPU and stored in an encrypted vector database. 
                <strong> No external APIs are used for knowledge retrieval.</strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
