import { useState, useEffect, useRef } from 'react'
import { useSystemStore } from '@/stores'
import { cn, formatBytes, normalizeMemoryBytes } from '@/lib/utils'
import { invoke } from '@tauri-apps/api/core'
import {
  Monitor,
  Folder,
  HardDrive,
  Cpu,
  MemoryStick,
  ChevronRight,
  File,
  FileText,
  Image,
  FolderOpen,
  Terminal as TerminalIcon,
  Settings,
  Search,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react'

export default function ComputerView() {
  const { systemInfo, setSystemInfo } = useSystemStore()
  const [activeTab, setActiveTab] = useState<'files' | 'terminal' | 'system'>('files')
  const [currentPath, setCurrentPath] = useState('C:\\')
  const [searchQuery, setSearchQuery] = useState('')
  const [files, setFiles] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [knownPaths, setKnownPaths] = useState([
    { name: 'Root', path: '.' },
    { name: 'Documents', path: '.' },
    { name: 'Downloads', path: '.' },
    { name: 'Desktop', path: '.' },
  ])
  const [hardwareInfo, setHardwareInfo] = useState<any>(null)
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    'Windows PowerShell',
    'Copyright (C) Microsoft Corporation. All rights reserved.',
    ''
  ])
  const [terminalInput, setTerminalInput] = useState('')
  const terminalEndRef = useRef<HTMLDivElement>(null)

  // Real File System Logic
  const loadDirectory = async (path: string) => {
    setIsLoading(true)
    try {
      const result = await invoke('list_directory', { path }) as any[]
      setFiles(result.map(item => ({
        name: item.name,
        type: item.is_dir ? 'folder' : (item.name.includes('.') ? item.name.split('.').pop() : 'file'),
        size: item.size,
        modifiedAt: new Date(),
        path: item.path
      })))
      setCurrentPath(path)
    } catch (e) {
      console.error('Failed to load directory', e)
    } finally {
      setIsLoading(false)
    }
  }

  // Real System Logic
  useEffect(() => {
    const fetchSystem = async () => {
      try {
        const info = await invoke('get_system_info') as any
        setSystemInfo(info)
        const hw = await invoke('get_hardware_info') as any
        setHardwareInfo(hw)
      } catch (e) {
        console.error('Failed to fetch system info', e)
      }
    }
    fetchSystem()
    // Default to current directory instead of hardcoded C:\
    invoke('get_shell_info').then((info: any) => {
      setKnownPaths([
        { name: 'Root', path: info.cwd || '.' },
        { name: 'Documents', path: info.documents || info.cwd || '.' },
        { name: 'Downloads', path: info.downloads || info.cwd || '.' },
        { name: 'Desktop', path: info.desktop || info.cwd || '.' },
      ])
      loadDirectory(info.cwd || '.')
    })
  }, [])

  // Terminal Logic
  const handleTerminalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!terminalInput) return

    const cmd = terminalInput
    setTerminalInput('')
    setTerminalOutput(prev => [...prev, `> ${cmd}`])

    try {
      const result = await invoke('execute_command', { command: cmd }) as any
      if (result.stdout) setTerminalOutput(prev => [...prev, result.stdout])
      if (result.stderr) setTerminalOutput(prev => [...prev, `Error: ${result.stderr}`])
    } catch (e: any) {
      setTerminalOutput(prev => [...prev, `Error: ${e}`])
    }
  }

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalOutput])

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'folder': return Folder
      case 'pdf': return FileText
      case 'txt':
      case 'md': return FileText
      case 'jpg':
      case 'png': return Image
      default: return File
    }
  }

  return (
    <div className="h-full flex flex-col bg-light dark:bg-dark">
      {/* Header */}
      <header className="h-14 px-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter shadow-sm">
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-gray-900 dark:text-white">My Computer</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search files and folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-10 w-64 text-sm"
            />
          </div>
          <button onClick={() => setActiveTab('system')} className="p-2 rounded-lg hover:bg-light-muted dark:hover:bg-dark text-gray-500 transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-6 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter">
        <div className="flex gap-2">
          {[
            { id: 'files', label: 'Explorer', icon: Folder },
            { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
            { id: 'system', label: 'Performance', icon: Cpu },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                'flex items-center gap-2 px-4 py-1.5 rounded-lg font-bold text-xs transition-all',
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-light-muted dark:hover:bg-dark'
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-56 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter p-4 hidden md:block">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
            Pinned
          </h3>
          <div className="space-y-1">
            {knownPaths.map((item) => (
              <button
                key={item.name}
                onClick={() => loadDirectory(item.path)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-primary/5 hover:text-primary transition-all text-sm group"
              >
                <FolderOpen className="w-4 h-4 group-hover:fill-primary/20" />
                <span className="font-medium">{item.name}</span>
              </button>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
              Devices
            </h3>
            <div className="space-y-1">
              {['Local Disk (C:)', 'Recovery (D:)'].map((drive) => (
                <button
                  key={drive}
                  onClick={() => loadDirectory(drive.includes('C:') ? 'C:\\' : 'D:\\')}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-light-muted dark:hover:bg-dark text-sm transition-all"
                >
                  <HardDrive className="w-4 h-4" />
                  <span className="font-medium">{drive}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 overflow-y-auto p-6 bg-light-muted/30 dark:bg-dark/20">
          {activeTab === 'files' && (
            <div className="space-y-6">
              {/* Path Navigation */}
              <div className="flex items-center gap-3 p-2 bg-white dark:bg-dark-lighter rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                <button 
                  onClick={() => {
                    const parts = currentPath.split('\\').filter(Boolean)
                    parts.pop()
                    loadDirectory(parts.join('\\') + '\\' || 'C:\\')
                  }}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark rounded-lg"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {currentPath.split('\\').filter(Boolean).map((part, i, arr) => (
                    <div key={i} className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          const nextPath = arr.slice(0, i + 1).join('\\') + '\\'
                          loadDirectory(currentPath.match(/^[A-Za-z]:\\/) ? nextPath : nextPath || '.')
                        }}
                        className="text-sm font-medium hover:text-primary transition-colors whitespace-nowrap"
                      >
                        {part}
                      </button>
                      {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-gray-400" />}
                    </div>
                  ))}
                </div>
                <button onClick={() => loadDirectory(currentPath)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark rounded-lg">
                  <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                </button>
              </div>

              {/* Grid Explorer */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {files
                .filter((file) => file.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((file, index) => {
                  const Icon = getFileIcon(file.type)
                  return (
                    <button
                      key={index}
                      onClick={() => file.type === 'folder' && loadDirectory(file.path)}
                      className="flex flex-col items-center p-4 rounded-2xl hover:bg-white dark:hover:bg-dark-lighter hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-primary/5 transition-all group border border-transparent hover:border-primary/20"
                    >
                      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-dark flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <Icon className={cn('w-8 h-8', file.type === 'folder' ? 'text-primary' : 'text-gray-400')} />
                      </div>
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-200 text-center truncate w-full px-1">
                        {file.name}
                      </span>
                      <span className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tighter">
                        {file.type === 'folder' ? 'Directory' : `${file.type} file`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'terminal' && (
            <div className="h-full flex flex-col bg-dark-lighter rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-2 bg-dark border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/80 shadow-lg shadow-red-500/20" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 shadow-lg shadow-yellow-500/20" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/80 shadow-lg shadow-green-500/20" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">PowerShell Core</span>
                </div>
              </div>
              <div className="flex-1 p-4 font-mono text-sm overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800">
                {terminalOutput.map((line, i) => (
                  <div key={i} className="mb-1 text-green-400/90 whitespace-pre-wrap leading-relaxed">
                    {line}
                  </div>
                ))}
                <form onSubmit={handleTerminalSubmit} className="flex items-center gap-2 mt-2">
                  <span className="text-primary font-bold">PS {currentPath}&gt;</span>
                  <input
                    autoFocus
                    type="text"
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    className="flex-1 bg-transparent outline-none border-none text-white caret-primary"
                  />
                </form>
                <div ref={terminalEndRef} />
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* CPU Monitoring */}
              <div className="card group">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                    <Cpu className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">Processor</h3>
                    <p className="text-xs text-gray-500">{systemInfo?.cpuModel || systemInfo?.arch || 'Unknown architecture'}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Utilization</span>
                    <span className="text-lg font-black text-gray-900 dark:text-white">{Math.round(hardwareInfo?.cpu?.usage || 0)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-dark rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${Math.round(hardwareInfo?.cpu?.usage || 0)}%` }} />
                  </div>
                </div>
              </div>

              {/* Memory Monitoring */}
              <div className="card group">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                    <MemoryStick className="w-6 h-6 text-purple-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">Physical Memory</h3>
                    <p className="text-xs text-gray-500">{systemInfo?.hostname || 'Local system'}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Committed</span>
                    <span className="text-lg font-black text-gray-900 dark:text-white">
                      {hardwareInfo ? formatBytes(normalizeMemoryBytes(hardwareInfo.memory_used || 0), 1) : '0 Bytes'}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-dark rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all duration-1000"
                      style={{
                        width: `${hardwareInfo?.memory_total ? Math.min(100, (normalizeMemoryBytes(hardwareInfo.memory_used || 0) / normalizeMemoryBytes(hardwareInfo.memory_total || 0)) * 100) : 0}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
