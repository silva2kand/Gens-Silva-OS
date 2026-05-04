import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Clock3, Plus, Play, Trash2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

type ScheduledTask = {
  id: string
  name: string
  description: string
  schedule: string
  action: string
  enabled: boolean
  lastRunAt?: string | null
}

export default function ScheduledTasksView() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(false)

  const loadTasks = async () => {
    setLoading(true)
    try {
      const list = (await invoke('list_scheduled_tasks')) as ScheduledTask[]
      setTasks(list)
    } catch (e) {
      console.error('Failed to load tasks', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
  }, [])

  const createTask = async () => {
    const name = prompt('Task name:')
    if (!name) return
    const schedule = prompt('Schedule expression (e.g. daily 09:00, every monday 08:00):', 'daily 09:00')
    if (!schedule) return
    const action = prompt('Action to run:', 'Research top AI news and summarize in 5 bullets')
    if (!action) return
    await invoke('create_scheduled_task', {
      name,
      description: 'Created from UI',
      schedule,
      action,
    })
    await loadTasks()
  }

  const toggleTask = async (task: ScheduledTask) => {
    await invoke('update_scheduled_task', { id: task.id, updates: { enabled: !task.enabled } })
    await loadTasks()
  }

  const runNow = async (task: ScheduledTask) => {
    const result = (await invoke('run_scheduled_task_now', { id: task.id })) as any
    alert(result.result || 'Task executed')
    await loadTasks()
  }

  const deleteTask = async (id: string) => {
    if (!confirm('Delete this scheduled task?')) return
    await invoke('delete_scheduled_task', { id })
    await loadTasks()
  }

  return (
    <div className="h-full flex flex-col bg-light dark:bg-dark overflow-hidden">
      <header className="h-14 px-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter shadow-sm">
        <div className="flex items-center gap-3">
          <Clock3 className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-gray-900 dark:text-white text-lg">Scheduled Tasks</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadTasks} className="btn-secondary flex items-center gap-2">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </button>
          <button onClick={createTask} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 bg-light-muted/20 dark:bg-dark/10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {tasks.map((task) => (
            <div key={task.id} className="card border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-black text-gray-900 dark:text-white">{task.name}</h3>
                <span className={cn('text-xs font-black uppercase', task.enabled ? 'text-green-500' : 'text-gray-400')}>
                  {task.enabled ? 'Active' : 'Paused'}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-3">{task.description}</p>
              <div className="text-xs text-gray-500 space-y-1 mb-4">
                <p>Schedule: <strong>{task.schedule}</strong></p>
                <p>Last Run: <strong>{task.lastRunAt || 'Never'}</strong></p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleTask(task)} className="btn-secondary flex-1">
                  {task.enabled ? 'Pause' : 'Resume'}
                </button>
                <button onClick={() => runNow(task)} className="btn-primary flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Run Now
                </button>
                <button onClick={() => deleteTask(task.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

