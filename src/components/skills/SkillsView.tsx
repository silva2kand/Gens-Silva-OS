import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useConnectorsStore } from '@/stores'
import { Wrench, Plus, Save, RefreshCw, Search, Play, CheckCircle2, AlertTriangle, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'

type Skill = {
  id: string
  name: string
  description: string
  path: string
  validation?: SkillValidation
}

type SkillValidation = {
  ok: boolean
  issues: string[]
  warnings: string[]
  hasSkillMd: boolean
  hasDescription: boolean
  hasInstructions: boolean
  hasScriptsDir: boolean
  hasReferencesDir: boolean
}

type SkillRunLog = {
  id: string
  skillId: string
  input: string
  output: string
  ok: boolean
  error: string
  createdAt: string
}

type BackendTool = {
  name: string
  connector: string
  authType: string
  implemented: boolean
  risk: string
  notes: string
}

export default function SkillsView() {
  const { connectors } = useConnectorsStore()
  const [skills, setSkills] = useState<Skill[]>([])
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null)
  const [skillContent, setSkillContent] = useState('')
  const [validation, setValidation] = useState<SkillValidation | null>(null)
  const [runLogs, setRunLogs] = useState<SkillRunLog[]>([])
  const [backendTools, setBackendTools] = useState<BackendTool[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)

  const loadSkills = async () => {
    setLoading(true)
    try {
      const list = (await invoke('list_skills')) as Skill[]
      setSkills(list)
      if (!activeSkillId && list.length > 0) {
        setActiveSkillId(list[0].id)
      }
    } catch (e) {
      console.error('Failed to load skills', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSkills()
    invoke('list_tool_registry')
      .then((tools) => setBackendTools(tools as BackendTool[]))
      .catch(() => setBackendTools([]))
  }, [])

  useEffect(() => {
    if (!activeSkillId) return
    invoke('get_skill_content', { id: activeSkillId })
      .then((content) => setSkillContent(String(content)))
      .catch((e) => console.error('Failed to load skill content', e))
    invoke('validate_skill', { id: activeSkillId })
      .then((result) => setValidation(result as SkillValidation))
      .catch(() => setValidation(null))
    invoke('list_skill_logs', { id: activeSkillId })
      .then((logs) => setRunLogs(logs as SkillRunLog[]))
      .catch(() => setRunLogs([]))
  }, [activeSkillId])

  const filteredSkills = useMemo(
    () =>
      skills.filter((s) => {
        const q = query.toLowerCase()
        return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      }),
    [skills, query]
  )

  const allTools = connectors.flatMap((c) =>
    c.tools.map((tool) => ({
      key: `${c.id}:${tool}`,
      tool,
      connector: c.name,
      status: c.status,
      enabled: c.isEnabled,
      authType: c.authType,
    }))
  )
  const implementedToolNames = new Set(backendTools.filter((tool) => tool.implemented).map((tool) => tool.name))

  const createSkill = async () => {
    const name = prompt('Skill name:')
    if (!name) return
    const description = prompt('Skill description:') || 'Reusable workflow skill'
    const instructions =
      prompt('Core instructions for this skill:') || 'Define your step-by-step workflow here.'
    try {
      const created = (await invoke('create_skill', { name, description, instructions })) as Skill
      await loadSkills()
      setActiveSkillId(created.id)
    } catch (e) {
      console.error('Failed to create skill', e)
      alert(`Failed to create skill: ${e}`)
    }
  }

  const saveSkill = async () => {
    if (!activeSkillId) return
    try {
      await invoke('save_skill_content', { id: activeSkillId, content: skillContent })
      const nextValidation = await invoke('validate_skill', { id: activeSkillId }) as SkillValidation
      setValidation(nextValidation)
      alert(nextValidation.ok ? 'Skill saved and validated' : 'Skill saved, but validation needs attention')
    } catch (e) {
      console.error('Failed to save skill', e)
      alert(`Failed to save skill: ${e}`)
    }
  }

  const runSkill = async () => {
    if (!activeSkillId) return
    const input = prompt('Run this skill with what input?')
    if (!input) return
    setRunning(true)
    try {
      const result = await invoke('run_skill', { id: activeSkillId, input }) as any
      await invoke('list_skill_logs', { id: activeSkillId })
        .then((logs) => setRunLogs(logs as SkillRunLog[]))
      alert(result.ok ? result.output || 'Skill completed' : result.error || 'Skill failed')
    } catch (e) {
      alert(`Failed to run skill: ${e}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-light dark:bg-dark overflow-hidden">
      <header className="h-14 px-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter shadow-sm">
        <div className="flex items-center gap-3">
          <Wrench className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-gray-900 dark:text-white text-lg">Skills</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadSkills} className="btn-secondary flex items-center gap-2">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </button>
          <button onClick={createSkill} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Skill
          </button>
          <button onClick={saveSkill} disabled={!activeSkillId} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />
            Save
          </button>
          <button onClick={runSkill} disabled={!activeSkillId || running} className="btn-primary flex items-center gap-2">
            <Play className={cn('w-4 h-4', running && 'animate-pulse')} />
            Run
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-12">
        <aside className="col-span-3 min-h-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter p-4 overflow-y-auto">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input-field pl-10 text-sm"
              placeholder="Search skills..."
            />
          </div>
          <div className="space-y-2">
            {filteredSkills.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSkillId(s.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg border',
                  activeSkillId === s.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-200'
                )}
              >
                <div className="text-sm font-bold truncate">{s.name}</div>
                <div className="text-xs text-gray-500 truncate">{s.description}</div>
                <div className={cn('mt-1 text-[10px] font-black uppercase', s.validation?.ok ? 'text-green-500' : 'text-amber-500')}>
                  {s.validation?.ok ? 'valid' : 'needs setup'}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="col-span-6 min-h-0 p-4 overflow-y-auto">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest">SKILL.md</h2>
            {validation && (
              <div className={cn(
                'inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase',
                validation.ok
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              )}>
                {validation.ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {validation.ok ? 'Validated' : `${validation.issues.length} issue(s)`}
              </div>
            )}
          </div>
          {validation && (!validation.ok || validation.warnings.length > 0) && (
            <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              {[...validation.issues, ...validation.warnings].map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          )}
          <textarea
            value={skillContent}
            onChange={(e) => setSkillContent(e.target.value)}
            className="w-full h-full min-h-[75vh] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-lighter p-4 font-mono text-sm"
            placeholder="Select or create a skill to edit content..."
          />
        </main>

        <aside className="col-span-3 min-h-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter p-4 overflow-y-auto">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">Tool Registry</h2>
          <div className="mb-4 rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs text-primary">
            Tools marked enabled are available in the workspace catalog. Some still need OAuth/API backend wiring before they can execute real external actions.
          </div>
          {backendTools.length > 0 && (
            <div className="mb-4 rounded-xl border border-green-500/20 bg-green-500/10 p-3">
              <div className="text-[10px] font-black uppercase text-green-600 dark:text-green-400 mb-2">
                Backend executable tools
              </div>
              <div className="flex flex-wrap gap-1.5">
                {backendTools.filter((tool) => tool.implemented).map((tool) => (
                  <span key={tool.name} className="px-2 py-1 rounded-lg bg-white dark:bg-dark text-[10px] font-bold text-gray-600 dark:text-gray-300">
                    {tool.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            {allTools.map((t) => (
              <div key={t.key} className="p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                <div className="text-sm font-bold text-gray-900 dark:text-white">{t.tool}</div>
                <div className="text-xs text-gray-500">{t.connector}</div>
                <div className={cn('text-[10px] uppercase font-bold', t.enabled ? 'text-green-500' : 'text-gray-400')}>
                  {t.enabled ? 'enabled in workspace' : `${t.status} / disabled`}
                </div>
                <div className={cn('text-[10px] uppercase font-bold', implementedToolNames.has(t.tool) ? 'text-green-500' : 'text-amber-500')}>
                  {implementedToolNames.has(t.tool) ? 'backend runnable' : 'catalog only'}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400">{t.authType}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Run Logs</h2>
            </div>
            <div className="space-y-2">
              {runLogs.length === 0 ? (
                <p className="text-xs text-gray-500">No runs yet.</p>
              ) : runLogs.slice(0, 8).map((log) => (
                <div key={log.id} className="p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                  <div className={cn('text-[10px] font-black uppercase', log.ok ? 'text-green-500' : 'text-red-500')}>
                    {log.ok ? 'completed' : 'failed'}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{log.input}</div>
                  <div className="text-[10px] text-gray-400">{new Date(log.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

