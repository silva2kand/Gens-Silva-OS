import { useState, useEffect, useRef } from 'react'
import { useAppStore, useWorkspaceStore } from '@/stores'
import { cn, formatBytes } from '@/lib/utils'
import { invoke } from '@tauri-apps/api/core'
import {
  FolderKanban,
  Plus,
  Search,
  ChevronRight,
  File,
  FileText,
  Image,
  Folder,
  MoreVertical,
  Clock,
  Trash2,
  FolderOpen,
  Settings,
  ArrowLeft,
  RefreshCw,
  GitBranch,
  X,
} from 'lucide-react'

export default function WorkspaceView() {
  const { setCurrentView } = useAppStore()
  const { projects, activeProject, setActiveProject, addProject, updateProject, deleteProject } = useWorkspaceStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [files, setFiles] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [cwd, setCwd] = useState('.')
  const [homePath, setHomePath] = useState('.')
  const [selectedFile, setSelectedFile] = useState<{ name: string; path: string; content: string } | null>(null)
  const [workspaceNote, setWorkspaceNote] = useState('')
  const [gitOutput, setGitOutput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    invoke('get_shell_info').then((info: any) => {
      setCwd(info.cwd || '.')
      setHomePath(info.cwd || '.')
    })
  }, [])

  const loadProjectFiles = async () => {
    if (!activeProject) return
    setIsLoading(true)
    try {
      const result = await invoke('list_directory', { path: cwd }) as any[]
      setFiles(result.map(item => {
        const ext = item.is_dir ? 'folder' : (item.name.includes('.') ? item.name.split('.').pop()!.toUpperCase() : 'File')
        return {
          name: item.name,
          type: item.is_dir ? 'folder' : (item.name.includes('.') ? item.name.split('.').pop() : 'file'),
          size: item.is_dir ? null : formatBytes(item.size),
          ext,
          path: item.path,
          modifiedAt: item.modified_at,
        }
      }))
      const project = projects.find((item) => item.id === activeProject)
      if (project) updateProject(project.id, { updatedAt: new Date().toISOString() })
    } catch (e) {
      console.error('Failed to load project files', e)
      setWorkspaceNote(`Could not load files: ${e}`)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadProjectFiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject, cwd])

  const activeProjectRecord = projects.find((project) => project.id === activeProject)

  const parentPath = (path: string) => {
    const normalized = path.replace(/\\/g, '/')
    const parent = normalized.split('/').slice(0, -1).join('/')
    return parent || path
  }

  const openItem = async (item: any) => {
    if (item.type === 'folder') {
      setCwd(item.path)
      setSelectedFile(null)
      return
    }

    try {
      const content = await invoke('read_file', { path: item.path }) as string
      setSelectedFile({ name: item.name, path: item.path, content })
    } catch (error) {
      setSelectedFile({
        name: item.name,
        path: item.path,
        content: `Preview unavailable for this file type.\n\n${error}`,
      })
    }
  }

  const createFolder = async () => {
    const name = prompt('Folder name?')
    if (!name?.trim()) return
    const path = `${cwd.replace(/[\\/]$/, '')}\\${name.trim()}`
    await invoke('create_directory', { path })
    setWorkspaceNote(`Created folder ${name.trim()}`)
    await loadProjectFiles()
  }

  const runGitStatus = async () => {
    const escapedPath = cwd.replace(/'/g, "''")
    const result = await invoke('execute_command', {
      command: `Set-Location -LiteralPath '${escapedPath}'; git status -sb`,
    }) as any
    setGitOutput([result.stdout, result.stderr].filter(Boolean).join('\n') || `Exit code ${result.exit_code}`)
  }

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const names = Array.from(event.target.files || []).map((file) => file.name)
    setWorkspaceNote(
      names.length
        ? `Selected ${names.length} file(s): ${names.join(', ')}. Browser security exposes names here; use My Computer for full local file operations.`
        : ''
    )
    event.target.value = ''
  }

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'folder': return Folder
      case 'pdf': return FileText
      case 'psd': return Image
      case 'png':
      case 'jpg': return Image
      case 'yaml':
      case 'md':
      case 'txt': return FileText
      default: return File
    }
  }

  return (
    <div className="h-full flex flex-col bg-light dark:bg-dark">
      {/* Header */}
      <header className="h-14 px-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter shadow-sm">
        <div className="flex items-center gap-3">
          <FolderKanban className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-gray-900 dark:text-white text-lg">Workspace</h1>
        </div>
        <div className="flex items-center gap-4">
          <input ref={fileInputRef} type="file" multiple hidden onChange={handleFilesSelected} />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search project files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-10 w-80 text-sm"
            />
          </div>
          <button 
            onClick={() => {
              const name = prompt('Project Name?')
              if (name) addProject({ id: Date.now().toString(), name, status: 'active', updatedAt: new Date().toISOString() })
            }}
            className="btn-primary flex items-center gap-2 px-4 shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            <span className="font-bold">New Project</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Projects Sidebar */}
        <aside className="w-72 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter p-6 flex flex-col">
          <div className="mb-8">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
              Active Projects
            </h3>
            <div className="space-y-1.5">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    "w-full flex items-center justify-between group px-4 py-2.5 rounded-xl transition-all text-left",
                    activeProject === project.id
                      ? "bg-primary text-white shadow-xl shadow-primary/20 scale-[1.02]"
                      : "text-gray-600 dark:text-gray-400 hover:bg-primary/5 hover:text-primary"
                  )}
                >
                  <button onClick={() => setActiveProject(project.id)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                    <FolderOpen className={cn("w-4 h-4", activeProject === project.id ? "text-white" : "text-primary")} />
                    <span className="text-sm font-bold truncate">{project.name}</span>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Archive ${project.name}?`)) deleteProject(project.id)
                    }}
                    className={cn("p-1 rounded hover:bg-white/15 opacity-0 group-hover:opacity-100", activeProject === project.id ? "text-white/70" : "text-gray-300")}
                    title="Archive project"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

        </aside>

        {/* File Browser */}
        <main className="flex-1 overflow-auto p-8 bg-light-muted/20 dark:bg-dark/10">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => setCwd(parentPath(cwd))}
                className="p-1.5 rounded-lg hover:bg-light-muted dark:hover:bg-dark text-gray-400 hover:text-primary"
                title="Go up"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-gray-400 font-medium">Workspace</span>
              <ChevronRight className="w-4 h-4 text-gray-300" />
              <span className="text-gray-900 dark:text-white font-black uppercase tracking-wider">
                {activeProjectRecord?.name || 'Select Project'}
              </span>
              <span className="text-gray-400 truncate max-w-[360px]">{cwd}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadProjectFiles} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-2">
                <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
                Refresh
              </button>
              <button onClick={() => setWorkspaceNote(files.slice(0, 8).map((file) => `${file.modifiedAt || 'unknown'} - ${file.name}`).join('\n') || 'No files loaded.')} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                History
              </button>
              <button onClick={createFolder} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-2">
                <Settings className="w-3.5 h-3.5" />
                New Folder
              </button>
              <button onClick={runGitStatus} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-2">
                <GitBranch className="w-3.5 h-3.5" />
                Git
              </button>
            </div>
          </div>

          {(workspaceNote || gitOutput) && (
            <pre className="mb-6 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter p-4 text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
              {[workspaceNote, gitOutput].filter(Boolean).join('\n\n')}
            </pre>
          )}

          {selectedFile && (
            <section className="mb-6 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{selectedFile.name}</h3>
                  <p className="text-xs text-gray-500">{selectedFile.path}</p>
                </div>
                <button onClick={() => setSelectedFile(null)} className="p-2 rounded-lg hover:bg-light-muted dark:hover:bg-dark">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <pre className="max-h-80 overflow-auto p-4 text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                {selectedFile.content}
              </pre>
            </section>
          )}

          {/* File Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {files.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase())).map((item, index) => {
              const Icon = getFileIcon(item.type)
              return (
                <div
                  key={index}
                  onClick={() => openItem(item)}
                  className="card group hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/5 dark:hover:shadow-primary/5 transition-all duration-300 border border-gray-100 dark:border-gray-800 hover:border-primary/30"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner",
                      item.type === 'folder' ? "bg-primary/10" : "bg-gray-100 dark:bg-dark"
                    )}>
                      <Icon className={cn(
                        "w-6 h-6",
                        item.type === 'folder' ? "text-primary" : "text-gray-400"
                      )} />
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if(confirm('Delete file?')) {
                            invoke('delete_path', { path: item.path })
                              .then(() => setFiles((prev) => prev.filter((f) => f.path !== item.path)))
                              .catch((err) => console.error('Failed to delete path', err))
                          }
                        }}
                        className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark text-gray-400 rounded-lg">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate mb-1">
                    {item.name}
                  </h4>
                  <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                    <span>{item.size || (item.ext || 'Folder')}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Empty State */}
          {files.length === 0 && !isLoading && (
            <div className="mt-12 p-16 rounded-[2rem] border-4 border-dashed border-gray-100 dark:border-gray-800/50 text-center bg-white/50 dark:bg-dark/20 backdrop-blur-xl">
              <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <FolderKanban className="w-10 h-10 text-primary/30" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-3">
                Project is Empty
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto font-medium">
                Start by adding your source code, datasets, or documentation to this workspace.
              </p>
              <div className="flex items-center justify-center gap-4">
                <button onClick={() => fileInputRef.current?.click()} className="btn-primary px-8 py-3 shadow-2xl shadow-primary/30">
                  Import Files
                </button>
                <button onClick={() => setCurrentView('connectors')} className="btn-secondary px-8 py-3">
                  Connect Git
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
