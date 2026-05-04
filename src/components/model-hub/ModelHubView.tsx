import { useState, useEffect, useRef } from 'react'
import { useModelsStore } from '@/stores'
import { useAppStore, useChatStore } from '@/stores'
import { cn, formatBytes, normalizeMemoryBytes } from '@/lib/utils'
import { invoke } from '@tauri-apps/api/core'
import {
  Database,
  Download,
  Trash2,
  CheckCircle2,
  Loader2,
  Search,
  HardDrive,
  Cpu,
  MemoryStick,
  ExternalLink,
  Zap,
  Shield,
  Activity,
  Box,
} from 'lucide-react'

export default function ModelHubView() {
  const { models, loadedModel, setLoadedModel, addModel, deleteModel } = useModelsStore()
  const { setCurrentView } = useAppStore()
  const { setActiveModel } = useChatStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'local' | 'huggingface'>('all')
  const [downloadingIds, setDownloadingIds] = useState<string[]>([])
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({})
  const [downloadStatus, setDownloadStatus] = useState<Record<string, any>>({})
  const [stalledDownloads, setStalledDownloads] = useState<Record<string, boolean>>({})
  const [hfModels, setHfModels] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isEngineActive, setIsEngineActive] = useState(false)
  const [engineDiagnostics, setEngineDiagnostics] = useState<any>(null)
  const [resources, setResources] = useState({
    gpu: { name: 'Detecting...', usage: 0, temp: 0 },
    vram: { used: 0, total: 0 },
    storage: { free: 0, total: 0 },
    ram: { used: 0, total: 0 }
  })
  const progressWatchRef = useRef<Record<string, { value: number; since: number }>>({})

  // Load persistent models from disk on mount
  useEffect(() => {
    const loadLocalModels = async () => {
      try {
        const localModels = await invoke('get_local_models') as any[]
        // Reset and sync with real disk registry
        const currentModelIds = new Set(localModels.map(m => m.id))
        
        // Remove models from store that are not on disk
        models.forEach(m => {
          if (!currentModelIds.has(m.id)) {
            deleteModel(m.id)
          }
        })

        // Add models from disk that are not in store
        localModels.forEach(model => {
          addModel(model)
        })
      } catch (e) {
        console.error('Failed to load local models', e)
      }
    }
    loadLocalModels()
  }, [])

  // Poll for resources and download progress
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const hwInfo = await invoke('get_hardware_info') as any
        const storageInfo = await invoke('get_storage_info') as any
        const engineStatus = await invoke('check_ai_status') as boolean
        const diagnostics = await invoke('get_local_engine_diagnostics') as any
        
        setIsEngineActive(engineStatus)
        setEngineDiagnostics(diagnostics)
         setResources(prev => ({
          ...prev,
          gpu: { 
            name: hwInfo.gpu?.name || 'Unknown GPU', 
            usage: hwInfo.gpu?.usage || 0,
            temp: hwInfo.gpu?.temp || 0
          },
          vram: { 
            used: (hwInfo.gpu?.vram_used || 0) * 1024 * 1024 * 1024, 
            total: (hwInfo.gpu?.vram_total || 0) * 1024 * 1024 * 1024 
          },
          ram: {
            used: normalizeMemoryBytes(hwInfo.memory_used || 0),
            total: normalizeMemoryBytes(hwInfo.memory_total || 0)
          },
          storage: { 
            free: storageInfo.free || 0, 
            total: storageInfo.total || 0 
          }
        }))

        // Recover and update download progress from backend, even if the UI state was lost.
        const progressCandidates = Array.from(new Set([
          ...downloadingIds,
          ...hfModels.map((model) => model.id),
        ]))

        if (progressCandidates.length > 0) {
          const entries = await Promise.all(
            progressCandidates.map(async (id) => {
              const [progress, status] = await Promise.all([
                invoke('get_download_progress', { id }) as Promise<number>,
                invoke('get_download_status', { id }) as Promise<any>,
              ])
              return { id, progress, status }
            })
          )

          setDownloadStatus(prev => {
            const next = { ...prev }
            entries.forEach(({ id, status }) => {
              next[id] = status
            })
            return next
          })

          setDownloadProgress(prev => {
            const next = { ...prev }
            entries.forEach(({ id, progress }) => {
              const percent = Math.round(progress * 100)
              next[id] = percent

              if (percent > 0 && percent < 100) {
                const previous = progressWatchRef.current[id]
                const now = Date.now()
                if (!previous || previous.value !== percent) {
                  progressWatchRef.current[id] = { value: percent, since: now }
                  setStalledDownloads((state) => ({ ...state, [id]: false }))
                } else if (now - previous.since > 30000) {
                  setStalledDownloads((state) => ({ ...state, [id]: true }))
                }
              }
            })
            return next
          })

          const activeIds = entries
            .filter((entry) => entry.progress > 0 && entry.progress < 1.0)
            .map((entry) => entry.id)
          setDownloadingIds(activeIds)

          const failedIds = entries.filter((entry) => entry.progress < 0).map((entry) => entry.id)
          if (failedIds.length > 0) {
            setDownloadingIds((prev) => prev.filter((id) => !failedIds.includes(id)))
            setStalledDownloads((prev) => {
              const next = { ...prev }
              failedIds.forEach((id) => {
                next[id] = true
              })
              return next
            })
          }

          const completedIds = entries.filter((entry) => entry.progress >= 1.0).map((entry) => entry.id)
          if (completedIds.length > 0) {
            completedIds.forEach((completedId) => {
              const model = hfModels.find(m => m.id === completedId)
              if (model) {
                addModel({
                  id: model.id,
                  name: model.name || model.id,
                  provider: 'Hugging Face',
                  size: model.size,
                  quantization: model.quantization || 'Unknown',
                  contextLength: model.contextLength || 0,
                  status: 'available',
                  description: model.description || 'Downloaded from Hugging Face'
                })
              }
            })
            setDownloadingIds((prev) => prev.filter((id) => !completedIds.includes(id)))
            setStalledDownloads((prev) => {
              const next = { ...prev }
              completedIds.forEach((id) => {
                delete next[id]
                delete progressWatchRef.current[id]
              })
              return next
            })
          }
        }
      } catch (e) {
        console.error('Failed to fetch hardware/progress info', e)
      }
    }, 1000) // Increased frequency for smoother progress
    return () => clearInterval(interval)
  }, [downloadingIds, hfModels, addModel])

  const handleSearchHf = async () => {
    if (!searchQuery) return
    setIsSearching(true)
    try {
      const results = await invoke('search_models', { query: searchQuery }) as any[]
      setHfModels(results)
      setActiveTab('huggingface')
    } catch (e) {
      console.error('HF Search failed', e)
    } finally {
      setIsSearching(false)
    }
  }

  const handleDownload = async (model: any) => {
    setDownloadingIds((prev) => (prev.includes(model.id) ? prev : [...prev, model.id]))
    setDownloadProgress(prev => ({ ...prev, [model.id]: 0 }))
    setStalledDownloads(prev => ({ ...prev, [model.id]: false }))
    progressWatchRef.current[model.id] = { value: 0, since: Date.now() }
    try {
      await invoke('download_model', { id: model.id })
    } catch (e) {
      console.error('Download start failed', e)
      setDownloadingIds((prev) => prev.filter((id) => id !== model.id))
      setDownloadProgress(prev => ({ ...prev, [model.id]: -1 }))
    }
  }

  const handleResetDownload = async (modelId: string) => {
    try {
      await invoke('clear_download_progress', { id: modelId })
    } catch (e) {
      console.error('Failed to clear download state', e)
    } finally {
      setDownloadingIds((prev) => prev.filter((id) => id !== modelId))
      setDownloadProgress((prev) => ({ ...prev, [modelId]: -1 }))
      setStalledDownloads((prev) => ({ ...prev, [modelId]: true }))
      delete progressWatchRef.current[modelId]
    }
  }

  const handleLoadModel = async (modelId: string) => {
    try {
      await invoke('load_model', { modelId })
      setLoadedModel(modelId)
    } catch (e) {
      console.error('Failed to load model', e)
      alert(`Model Loading Error: ${e}`)
    }
  }

  const handleDeleteModel = async (modelId: string) => {
    try {
      await invoke('delete_model', { id: modelId })
      deleteModel(modelId)
      if (loadedModel === modelId) {
        setLoadedModel(null)
      }
    } catch (e) {
      console.error('Failed to delete model', e)
      alert(`Delete Error: ${e}`)
    }
  }

  const handleImportLocalModel = async () => {
    const path = prompt('Enter local model file path (.gguf/.bin/.safetensors):')
    if (!path) return
    const name = prompt('Optional display name (leave blank to use filename):') || undefined
    try {
      const imported = await invoke('import_local_model', { path, modelName: name }) as any
      addModel(imported)
      alert(`Imported model: ${imported.name}`)
      setActiveTab('local')
    } catch (e) {
      console.error('Import failed', e)
      alert(`Import failed: ${e}`)
    }
  }

  const hasFailedDownload = (modelId: string) => (downloadProgress[modelId] ?? 0) < 0 || stalledDownloads[modelId]
  const isDownloading = (modelId: string) =>
    !stalledDownloads[modelId] && (downloadingIds.includes(modelId) || (((downloadProgress[modelId] ?? 0) > 0) && ((downloadProgress[modelId] ?? 0) < 100)))
  const isAvailableLocally = (modelId: string) => models.some((model) => model.id === modelId)
  const downloadMeta = (modelId: string) => downloadStatus[modelId] || {}

  const filteredModels = models.filter(
    (model) =>
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.provider.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col bg-light dark:bg-dark overflow-hidden">
      {/* Header */}
      <header className="h-14 px-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter shadow-sm">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-gray-900 dark:text-white text-lg">Model Hub</h1>
          <div className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-full border transition-all",
            isEngineActive 
              ? "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400" 
              : "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
          )}>
            <Activity className={cn("w-3 h-3", isEngineActive && "animate-pulse")} />
            <span className="text-[10px] font-black uppercase tracking-wider">
              {isEngineActive ? 'Local Engine Active' : engineDiagnostics?.serverBinaryFound ? 'Runtime Ready' : 'Local Engine Offline'}
            </span>
          </div>
          {!isEngineActive && (
            <button 
              onClick={async () => {
                try {
                  const fallbackModelId = loadedModel || models[0]?.id || null
                  if (!fallbackModelId) {
                    setActiveTab('local')
                    alert('Download or import a local model first, then load it into VRAM to start the engine.')
                    return
                  }
                  const result = await invoke('start_local_engine', { modelId: fallbackModelId }) as string
                  setLoadedModel(fallbackModelId)
                  alert(result)
                } catch (e) {
                  alert(`Could not start local engine: ${e}`)
                }
              }}
              className="text-[10px] font-black text-primary underline uppercase tracking-wider ml-2"
            >
              How to start?
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search local or Hugging Face..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchHf()}
              className="input-field pl-10 w-80 text-sm"
            />
          </div>
          <button 
            onClick={handleSearchHf}
            disabled={isSearching}
            className="btn-primary flex items-center gap-2 px-4 shadow-lg shadow-primary/20"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="font-bold">{isSearching ? 'Searching...' : 'Search HF'}</span>
          </button>
          <button
            onClick={handleImportLocalModel}
            className="btn-secondary flex items-center gap-2 px-4"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="font-bold">Import Local</span>
          </button>
        </div>
      </header>

      {!isEngineActive && (
        <div className="px-6 py-3 border-b border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10">
          <div className="flex items-center justify-between gap-4 text-sm">
            <div className="min-w-0 text-amber-800 dark:text-amber-200">
              <span className="font-bold">
                {engineDiagnostics?.serverBinaryFound ? 'Built-in runtime found.' : 'Runtime binary missing.'}
              </span>{' '}
              <span>
                {engineDiagnostics?.localModelCount > 0
                  ? `${engineDiagnostics.localModelCount} local model${engineDiagnostics.localModelCount === 1 ? '' : 's'} ready. Load one to bring the engine online.`
                  : 'Download or import a GGUF model, then load it into VRAM.'}
              </span>
            </div>
            <button
              onClick={() => setActiveTab('local')}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-amber-700"
            >
              Local Library
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {[
            { id: 'all', label: 'All Models', icon: Box },
            { id: 'local', label: 'Local Library', icon: Shield },
            { id: 'huggingface', label: 'Hugging Face', icon: ExternalLink }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2',
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]'
                  : 'bg-light-muted dark:bg-dark text-gray-500 hover:text-primary'
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-light-muted/20 dark:bg-dark/10">
        {/* System Resources */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="card group hover:border-blue-500/30 transition-all p-5 overflow-hidden">
            <div className="flex items-center gap-3 mb-6 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                <Cpu className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em] truncate">Compute GPU</p>
                <p className="font-black text-gray-900 dark:text-white text-xs truncate" title={resources.gpu.name}>{resources.gpu.name}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-end text-[10px] font-black">
                <span className="text-gray-400 uppercase tracking-widest">Processing Load</span>
                <span className="text-blue-500">{resources.gpu.usage}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-dark rounded-full overflow-hidden shadow-inner">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(59,130,246,0.5)]",
                    resources.gpu.usage > 80 ? "bg-red-500" : "bg-blue-500"
                  )} 
                  style={{ width: `${resources.gpu.usage}%` }} 
                />
              </div>
            </div>
          </div>

          <div className="card group hover:border-purple-500/30 transition-all p-5">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                <MemoryStick className="w-5 h-5 text-purple-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">System RAM</p>
                <p className="font-black text-gray-900 dark:text-white text-xs truncate">{formatBytes(resources.ram.used)} / {formatBytes(resources.ram.total)}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-end text-[10px] font-black">
                <span className="text-gray-400 uppercase tracking-widest">RAM Usage</span>
                <span className="text-purple-500">{resources.ram.total > 0 ? Math.round((resources.ram.used / resources.ram.total) * 100) : 0}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-dark rounded-full overflow-hidden shadow-inner">
                <div 
                  className="h-full bg-purple-500 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(168,85,247,0.5)]" 
                  style={{ width: `${resources.ram.total > 0 ? (resources.ram.used / resources.ram.total) * 100 : 0}%` }} 
                />
              </div>
            </div>
          </div>

          <div className="card group hover:border-green-500/30 transition-all p-5">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-green-500/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                <HardDrive className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">Local Storage</p>
                <p className="font-black text-gray-900 dark:text-white text-xs truncate">{formatBytes(resources.storage.free)} Available</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-end text-[10px] font-black">
                <span className="text-gray-400 uppercase tracking-widest">Disk Fill</span>
                <span className="text-green-500">{resources.storage.total > 0 ? Math.round(((resources.storage.total - resources.storage.free) / resources.storage.total) * 100) : 0}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-dark rounded-full overflow-hidden shadow-inner">
                <div 
                  className="h-full bg-green-500 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(34,197,94,0.5)]" 
                  style={{ width: `${resources.storage.total > 0 ? ((resources.storage.total - resources.storage.free) / resources.storage.total) * 100 : 0}%` }} 
                />
              </div>
            </div>
          </div>

          <div className="card border-primary/20 bg-primary/5 ring-4 ring-primary/5 group p-5">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/30 group-hover:scale-110 transition-transform shrink-0">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.1em]">Dedicated VRAM</p>
                <p className="font-black text-gray-900 dark:text-white truncate text-xs">
                  {formatBytes(resources.vram.used)} / {formatBytes(resources.vram.total)}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 p-2 rounded-xl bg-white dark:bg-dark shadow-sm border border-primary/10">
              <div className={cn("w-2 h-2 rounded-full shadow-[0_0_8px]", resources.vram.used > 0 ? "bg-green-500 animate-pulse shadow-green-500/80" : "bg-gray-300 shadow-gray-300/50")} />
              <span className={cn("text-[9px] font-black uppercase tracking-widest", resources.vram.used > 0 ? "text-green-600 dark:text-green-400" : "text-gray-400")}>
                {isEngineActive ? 'Engine Online' : resources.vram.used > 0 ? 'VRAM In Use' : 'Engine Standby'}
              </span>
            </div>
          </div>
        </div>

        {/* Models List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tighter flex items-center gap-3">
              {activeTab === 'huggingface' ? 'HF Global Registry' : 'Local Intelligence'}
              <span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-black text-gray-500">
                {activeTab === 'huggingface' ? hfModels.length : filteredModels.length} Models
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {(activeTab === 'huggingface' ? hfModels : filteredModels).map((model, idx) => (
              <div 
                key={`${model.id}-${idx}`} 
                className={cn(
                  "card group hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/5 dark:hover:shadow-primary/5 transition-all duration-300 border border-gray-100 dark:border-gray-800 hover:border-primary/30",
                  loadedModel === model.id && "border-primary bg-primary/[0.02] shadow-2xl shadow-primary/10 ring-2 ring-primary/20"
                )}
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-gray-900 dark:text-white text-lg overflow-hidden text-ellipsis whitespace-nowrap group-hover:text-primary transition-colors">
                      {model.name || model.id}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{model.provider}</span>
                      {activeTab === 'huggingface' && <ExternalLink className="w-3 h-3 text-primary" />}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {model.status === 'available' || isAvailableLocally(model.id) ? (
                      <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20">
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleDownload(model)}
                        disabled={isDownloading(model.id)}
                        className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all"
                      >
                        {isDownloading(model.id) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-8 line-clamp-2 h-10">
                  {model.description}
                </p>
                {model.selectedFile && (
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-3 truncate" title={model.selectedFile}>
                    File {model.selectedFileCount > 1 ? `${model.selectedFileCount} parts` : model.selectedFile}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-3 mb-8">
                  <div className="p-3 rounded-2xl bg-light-muted/50 dark:bg-dark border border-gray-50 dark:border-gray-800">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Weight</p>
                    <p className="text-xs font-black text-gray-900 dark:text-white">{model.size}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-light-muted/50 dark:bg-dark border border-gray-50 dark:border-gray-800">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Precision</p>
                    <p className="text-xs font-black text-gray-900 dark:text-white">{model.quantization}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-light-muted/50 dark:bg-dark border border-gray-50 dark:border-gray-800">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Context</p>
                    <p className="text-xs font-black text-gray-900 dark:text-white">{model.contextLength / 1024}K</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  {model.status === 'available' || isAvailableLocally(model.id) ? (
                    <button 
                      onClick={() => handleLoadModel(model.id)}
                      disabled={loadedModel === model.id}
                      className={cn(
                        "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all",
                        loadedModel === model.id 
                          ? "bg-green-500 text-white cursor-default shadow-lg shadow-green-500/20" 
                          : "bg-primary text-white hover:bg-primary-hover shadow-xl shadow-primary/20"
                      )}
                    >
                      {loadedModel === model.id ? 'Model In VRAM' : 'Load Into VRAM'}
                    </button>
                  ) : isDownloading(model.id) ? (
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] font-black text-primary animate-pulse">DOWNLOADING...</span>
                        <span className="text-[10px] font-black text-primary">{downloadProgress[model.id] || 0}%</span>
                      </div>
                      <div className="flex justify-between items-center px-1 text-[10px] font-bold text-gray-500 dark:text-gray-400">
                        <span className="truncate max-w-[55%]" title={downloadMeta(model.id).currentFile}>
                          {downloadMeta(model.id).currentFile || model.selectedFile || 'Preparing file'}
                        </span>
                        <span>
                          {formatBytes(downloadMeta(model.id).downloadedBytes || 0)}
                          {downloadMeta(model.id).totalBytes > 0 ? ` / ${formatBytes(downloadMeta(model.id).totalBytes)}` : ''}
                          {downloadMeta(model.id).speedBps > 0 ? ` at ${formatBytes(downloadMeta(model.id).speedBps)}/s` : ''}
                        </span>
                      </div>
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700">
                        <div 
                          className="h-full bg-primary transition-all duration-300 shadow-[0_0_10px_rgba(var(--primary),0.5)]" 
                          style={{ width: `${downloadProgress[model.id] || 0}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center border border-dashed border-gray-200 dark:border-gray-700">
                      <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest italic">Awaiting Download</span>
                    </div>
                  )}
                  <button 
                    onClick={() => handleDeleteModel(model.id)}
                    className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                {loadedModel === model.id && (
                  <button
                    onClick={() => {
                      setActiveModel(model.id)
                      setCurrentView('chat')
                    }}
                    className="mt-3 w-full py-2 rounded-xl text-xs font-black uppercase tracking-[0.2em] bg-green-500 text-white hover:bg-green-600 transition-all"
                  >
                    Use In Chat
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
