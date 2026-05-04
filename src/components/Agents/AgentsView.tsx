import { useEffect, useState } from 'react'
import { useAppStore, useAgentsStore, useChatStore } from '@/stores'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { cn } from '@/lib/utils'
import {
  Bot,
  Plus,
  Settings,
  Play,
  Save,
  Loader2,
  Code,
  Files,
  Scale,
  Calculator,
  Cloud,
  Shield,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import type { Agent } from '@/types'

type AgentActivity = {
  id: string
  at: string
  agentId: string
  phase: string
  status: string
  message: string
  requiresApproval: boolean
}

type AgentTaskRun = {
  id: string
  agentId: string
  goal: string
  status: string
  startedAt: string
  finishedAt: string
  activities: AgentActivity[]
  result: string
  approvalsRequired: string[]
}

const agentIcons: Record<string, React.ElementType> = {
  'code-2': Code,
  files: Files,
  scale: Scale,
  calculator: Calculator,
  cloud: Cloud,
  shield: Shield,
}

export default function AgentsView() {
  const { setCurrentView } = useAppStore()
  const { agents, setAgents, updateAgent } = useAgentsStore()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const backendAgents = await invoke('list_agents') as any[]
        const mappedAgents: Agent[] = backendAgents.map((agent) => ({
          id: agent.id,
          name: agent.name || agent.id,
          description: agent.description || agent.config?.description || 'Local agent',
          icon: agent.icon || iconForAgent(agent.id),
          color: agent.color || colorForAgent(agent.id),
          instructions: agent.config?.instructions || agent.instructions || '',
          tools: agent.config?.tools || agent.tools || [],
          model: agent.model,
          isActive: agent.isActive ?? true,
          memory: agent.memory || '',
          isSystem: agent.isSystem ?? false,
          createdAt: agent.created_at ? new Date(agent.created_at) : new Date(),
          updatedAt: agent.updated_at ? new Date(agent.updated_at) : new Date(),
        }))
        setAgents(mappedAgents)
      } catch (error) {
        console.error('Failed to load backend agents', error)
      }
    }

    loadAgents()
  }, [setAgents])

  return (
    <div className="h-full flex bg-light dark:bg-dark">
      {/* Agents List */}
      <div className="w-80 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Agents</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-2 rounded-lg hover:bg-light-muted dark:hover:bg-dark text-primary"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="input-field pl-10 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {agents.filter((agent) => {
            const query = searchQuery.toLowerCase()
            return agent.name.toLowerCase().includes(query) ||
              agent.description.toLowerCase().includes(query) ||
              agent.tools.some((tool) => tool.toLowerCase().includes(query))
          }).map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={selectedAgent === agent.id}
              onSelect={() => setSelectedAgent(agent.id)}
              onToggleActive={async () => {
                const isActive = !agent.isActive
                updateAgent(agent.id, { isActive })
                try {
                  await invoke('update_agent', { id: agent.id, updates: { isActive } })
                } catch (error) {
                  updateAgent(agent.id, { isActive: agent.isActive })
                  console.error('Failed to update agent status', error)
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Agent Detail */}
      <div className="flex-1 flex flex-col">
        {selectedAgent ? (
          <AgentDetail
            agent={agents.find((a) => a.id === selectedAgent)!}
            onNavigateChat={() => setCurrentView('chat')}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Select an Agent
              </h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm">
                Choose an agent from the list to view details and configuration options.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Create Agent Modal */}
      {showCreateModal && (
        <CreateAgentModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  )
}

function iconForAgent(id: string) {
  const icons: Record<string, string> = {
    hermes: 'code-2',
    paperclip: 'files',
    spaceagent: 'cloud',
    openclaw: 'shield',
    solicister: 'scale',
    accountants: 'calculator',
  }
  return icons[id] || 'bot'
}

function colorForAgent(id: string) {
  const colors: Record<string, string> = {
    hermes: '#8B5CF6',
    paperclip: '#10B981',
    spaceagent: '#3B82F6',
    openclaw: '#EF4444',
    solicister: '#F59E0B',
    accountants: '#06B6D4',
  }
  return colors[id] || '#3B82F6'
}

function AgentCard({
  agent,
  isSelected,
  onSelect,
  onToggleActive,
}: {
  agent: Agent
  isSelected: boolean
  onSelect: () => void
  onToggleActive: () => void
}) {
  const Icon = agentIcons[agent.icon] || Bot

  return (
    <div
      className={cn(
        'w-full p-3 rounded-lg text-left transition-all mb-2',
        isSelected
          ? 'bg-primary/10 border border-primary/30'
          : 'hover:bg-light-muted dark:hover:bg-dark'
      )}
    >
      <div className="w-full flex items-center gap-3 text-left">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: agent.color + '20' }}
        >
          <Icon className="w-5 h-5" style={{ color: agent.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white">{agent.name}</span>
            {agent.isActive && (
              <span className="px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 text-xs">
                Active
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {agent.description}
          </p>
        </div>
        <button
          type="button"
          onClick={onSelect}
          className="px-2 py-1 rounded-lg text-xs font-medium text-gray-500 hover:bg-light-muted dark:hover:bg-dark hover:text-primary"
        >
          Open
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={agent.isActive}
          data-checked={agent.isActive ? 'true' : 'false'}
          onClick={(event) => {
            event.stopPropagation()
            onToggleActive()
          }}
          className="toggle-switch flex-shrink-0"
          title={agent.isActive ? 'Pause agent' : 'Activate agent'}
        />
      </div>
    </div>
  )
}

function AgentDetail({ agent, onNavigateChat }: { agent: Agent; onNavigateChat: () => void }) {
  const { updateAgent } = useAgentsStore()
  const { setComposerText } = useChatStore()
  const [isEditing, setIsEditing] = useState(false)
  const [instructions, setInstructions] = useState(agent.instructions)
  const [memory, setMemory] = useState(agent.memory)
  const [toolsText, setToolsText] = useState(agent.tools.join(', '))
  const [runPrompt, setRunPrompt] = useState('')
  const [runOutput, setRunOutput] = useState('')
  const [taskRuns, setTaskRuns] = useState<AgentTaskRun[]>([])
  const [currentRun, setCurrentRun] = useState<AgentTaskRun | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    setInstructions(agent.instructions)
    setMemory(agent.memory)
    setToolsText(agent.tools.join(', '))
    setRunOutput('')
    setCurrentRun(null)
    invoke('list_agent_activity', { agentId: agent.id })
      .then((runs) => setTaskRuns(runs as AgentTaskRun[]))
      .catch((error) => console.error('Failed to load agent activity', error))
  }, [agent.id, agent.instructions, agent.memory, agent.tools])

  const saveAgent = async () => {
    const tools = toolsText.split(',').map((tool) => tool.trim()).filter(Boolean)
    const updates = {
      config: { instructions, tools, description: agent.description },
      instructions,
      tools,
      memory,
      updated_at: new Date().toISOString(),
    }
    await invoke('update_agent', { id: agent.id, updates })
    updateAgent(agent.id, { instructions, tools, memory })
    setIsEditing(false)
  }

  const runAgent = async () => {
    const input = runPrompt.trim()
    if (!input) return
    setIsRunning(true)
    setRunOutput('')
    setCurrentRun({
      id: 'pending',
      agentId: agent.id,
      goal: input,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: '',
      result: '',
      approvalsRequired: [],
      activities: [
        {
          id: 'pending-goal',
          at: new Date().toISOString(),
          agentId: agent.id,
          phase: 'goal',
          status: 'received',
          message: `Goal received: ${input}`,
          requiresApproval: false,
        },
      ],
    })
    try {
      const result = await invoke('run_agent_task', { agentId: agent.id, goal: input }) as AgentTaskRun
      setCurrentRun(result)
      setTaskRuns((runs) => [result, ...runs.filter((run) => run.id !== result.id)].slice(0, 10))
      setRunOutput(result.result)
    } catch (error) {
      setRunOutput(`Error: ${error}`)
      setCurrentRun((run) => run ? {
        ...run,
        status: 'error',
        finishedAt: new Date().toISOString(),
        result: `Error: ${error}`,
        activities: [
          ...run.activities,
          {
            id: 'runtime-error',
            at: new Date().toISOString(),
            agentId: agent.id,
            phase: 'runtime',
            status: 'error',
            message: String(error),
            requiresApproval: false,
          },
        ],
      } : null)
    } finally {
      setIsRunning(false)
    }
  }

  const runHermesEmailIntelligence = async () => {
    setIsRunning(true)
    setRunOutput('')
    const goal = 'Hermes Email Intelligence v1'
    setCurrentRun({
      id: 'pending-hermes-email',
      agentId: agent.id,
      goal,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: '',
      result: '',
      approvalsRequired: [],
      activities: [
        {
          id: 'pending-hermes-email-goal',
          at: new Date().toISOString(),
          agentId: agent.id,
          phase: 'goal',
          status: 'received',
          message: 'Reading Classic Outlook end to end: Inbox, Sent, Drafts, Outbox, flags, categories, and mail folders.',
          requiresApproval: false,
        },
      ],
    })
    try {
      const result = await invoke('run_hermes_email_intelligence', { perFolder: 10 }) as AgentTaskRun
      setCurrentRun(result)
      setTaskRuns((runs) => [result, ...runs.filter((run) => run.id !== result.id)].slice(0, 10))
      setRunOutput(result.result)
    } catch (error) {
      setRunOutput(`Error: ${error}`)
      setCurrentRun((run) => run ? {
        ...run,
        status: 'error',
        finishedAt: new Date().toISOString(),
        result: `Error: ${error}`,
        activities: [
          ...run.activities,
          {
            id: 'runtime-error',
            at: new Date().toISOString(),
            agentId: agent.id,
            phase: 'runtime',
            status: 'error',
            message: String(error),
            requiresApproval: false,
          },
        ],
      } : null)
    } finally {
      setIsRunning(false)
    }
  }

  const runOpenClawComputerOperator = async () => {
    const input = runPrompt.trim() || 'Inspect my computer/app context and prepare safe next operator steps.'
    setIsRunning(true)
    setRunOutput('')
    setCurrentRun({
      id: 'pending-openclaw-operator',
      agentId: agent.id,
      goal: input,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: '',
      result: '',
      approvalsRequired: [],
      activities: [
        {
          id: 'pending-openclaw-operator-goal',
          at: new Date().toISOString(),
          agentId: agent.id,
          phase: 'goal',
          status: 'received',
          message: 'Inspecting local computer/app context and preparing safe operator plan.',
          requiresApproval: false,
        },
      ],
    })
    try {
      const result = await invoke('run_openclaw_computer_operator', { goal: input }) as AgentTaskRun
      setCurrentRun(result)
      setTaskRuns((runs) => [result, ...runs.filter((run) => run.id !== result.id)].slice(0, 10))
      setRunOutput(result.result)
    } catch (error) {
      setRunOutput(`Error: ${error}`)
      setCurrentRun((run) => run ? {
        ...run,
        status: 'error',
        finishedAt: new Date().toISOString(),
        result: `Error: ${error}`,
        activities: [
          ...run.activities,
          {
            id: 'runtime-error',
            at: new Date().toISOString(),
            agentId: agent.id,
            phase: 'runtime',
            status: 'error',
            message: String(error),
            requiresApproval: false,
          },
        ],
      } : null)
    } finally {
      setIsRunning(false)
    }
  }

  const runOpenClawVisionOperator = async () => {
    const input = runPrompt.trim() || 'Capture the screen, inspect the visible app context, and prepare safe UI automation steps.'
    setIsRunning(true)
    setRunOutput('')
    setCurrentRun({
      id: 'pending-openclaw-vision',
      agentId: agent.id,
      goal: input,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: '',
      result: '',
      approvalsRequired: [],
      activities: [
        {
          id: 'pending-openclaw-vision-goal',
          at: new Date().toISOString(),
          agentId: agent.id,
          phase: 'goal',
          status: 'received',
          message: 'Capturing current screen and preparing approval-gated UI automation plan.',
          requiresApproval: false,
        },
      ],
    })
    try {
      const result = await invoke('run_openclaw_vision_operator', { goal: input }) as AgentTaskRun
      setCurrentRun(result)
      setTaskRuns((runs) => [result, ...runs.filter((run) => run.id !== result.id)].slice(0, 10))
      setRunOutput(result.result)
    } catch (error) {
      setRunOutput(`Error: ${error}`)
      setCurrentRun((run) => run ? {
        ...run,
        status: 'error',
        finishedAt: new Date().toISOString(),
        result: `Error: ${error}`,
        activities: [
          ...run.activities,
          {
            id: 'runtime-error',
            at: new Date().toISOString(),
            agentId: agent.id,
            phase: 'runtime',
            status: 'error',
            message: String(error),
            requiresApproval: false,
          },
        ],
      } : null)
    } finally {
      setIsRunning(false)
    }
  }

  const sendRunToChat = () => {
    const content = runOutput
      ? `Agent ${agent.name} result:\n\n${runOutput}`
      : `Ask ${agent.name}: ${runPrompt}`
    setComposerText(content)
    onNavigateChat()
  }

  return (
    <>
      <header className="h-16 px-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: agent.color + '20' }}
          >
            <Bot className="w-6 h-6" style={{ color: agent.color }} />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">{agent.name}</h2>
            <p className="text-sm text-gray-500">{agent.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsEditing((value) => !value)} className="btn-secondary flex items-center gap-2">
            <Settings className="w-4 h-4" />
            {isEditing ? 'Close' : 'Configure'}
          </button>
          <button onClick={runAgent} className="btn-primary flex items-center gap-2" disabled={!runPrompt.trim() || isRunning}>
            <Play className="w-4 h-4" />
            Run
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl space-y-6">
          <section>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Run Agent</h3>
            <div className="card space-y-3">
              <textarea
                value={runPrompt}
                onChange={(event) => setRunPrompt(event.target.value)}
                className="input-field min-h-[96px]"
                placeholder={`Give ${agent.name} a task...`}
              />
              <div className="flex items-center gap-2">
                {agent.id === 'hermes' && (
                  <button onClick={runHermesEmailIntelligence} className="btn-primary flex items-center gap-2" disabled={isRunning}>
                    {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Full Email Intelligence
                  </button>
                )}
                {agent.id === 'openclaw' && (
                  <>
                    <button onClick={runOpenClawComputerOperator} className="btn-primary flex items-center gap-2" disabled={isRunning}>
                      {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Computer Operator
                    </button>
                    <button onClick={runOpenClawVisionOperator} className="btn-secondary flex items-center gap-2" disabled={isRunning}>
                      {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Vision UI v2
                    </button>
                  </>
                )}
                <button onClick={runAgent} className="btn-primary flex items-center gap-2" disabled={!runPrompt.trim() || isRunning}>
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Run Agent
                </button>
                <button onClick={sendRunToChat} className="btn-secondary" disabled={!runPrompt.trim() && !runOutput}>
                  Send To Chat
                </button>
              </div>
              {runOutput && (
                <pre className="max-h-72 overflow-auto rounded-lg bg-light-muted dark:bg-dark p-4 text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-100">
                  {runOutput}
                </pre>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Live Work Viewer</h3>
            <div className="card space-y-4">
              {currentRun ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{currentRun.status.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-gray-500 line-clamp-1">{currentRun.goal}</p>
                    </div>
                    {currentRun.status === 'needs_approval' ? (
                      <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-300 text-xs font-black uppercase">
                        Approval
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-lg bg-green-500/10 text-green-600 dark:text-green-300 text-xs font-black uppercase">
                        {isRunning ? 'Running' : 'Done'}
                      </span>
                    )}
                  </div>
                  <ActivityTimeline activities={currentRun.activities} />
                  {currentRun.approvalsRequired.length > 0 && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                      <p className="text-xs font-black uppercase text-amber-600 dark:text-amber-300 mb-2">Needs Your Approval</p>
                      <div className="space-y-1">
                        {currentRun.approvalsRequired.map((item) => (
                          <p key={item} className="text-sm text-gray-700 dark:text-gray-200">{item}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">Run an agent task to see each step here.</p>
              )}
            </div>
          </section>

          {taskRuns.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Recent Runs</h3>
              <div className="space-y-2">
                {taskRuns.slice(0, 5).map((run) => (
                  <button
                    key={run.id}
                    onClick={() => {
                      setCurrentRun(run)
                      setRunOutput(run.result)
                    }}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter p-3 text-left hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1">{run.goal}</p>
                      <span className="text-[10px] font-black uppercase text-gray-400">{run.status.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{new Date(run.finishedAt || run.startedAt).toLocaleString()}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Configuration */}
          <section>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Instructions</h3>
            {isEditing ? (
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                className="input-field min-h-[140px]"
              />
            ) : (
              <div className="p-4 rounded-lg bg-light-muted dark:bg-dark">
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{agent.instructions}</p>
              </div>
            )}
          </section>

          {/* Tools */}
          <section>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Enabled Tools</h3>
            {isEditing ? (
              <input
                value={toolsText}
                onChange={(event) => setToolsText(event.target.value)}
                className="input-field"
                placeholder="Comma-separated tool names"
              />
            ) : (
              <div className="flex flex-wrap gap-2">
              {agent.tools.map((tool) => (
                <span
                  key={tool}
                  className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm"
                >
                  {tool}
                </span>
              ))}
              </div>
            )}
          </section>

          {/* Memory */}
          <section>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Memory</h3>
            <textarea
              value={memory}
              onChange={(event) => setMemory(event.target.value)}
              className="input-field min-h-[120px]"
              placeholder="Agent memory and context..."
              readOnly={!isEditing}
            />
          </section>

          {isEditing && (
            <button onClick={saveAgent} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              Save Agent
            </button>
          )}

          {/* Runtime */}
          <section>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Runtime</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="card text-center">
                <p className="text-lg font-bold text-primary">{agent.isActive ? 'Ready' : 'Paused'}</p>
                <p className="text-xs text-gray-500">Status</p>
              </div>
              <div className="card text-center">
                <p className="text-lg font-bold text-primary">{agent.tools.length}</p>
                <p className="text-xs text-gray-500">Tools</p>
              </div>
              <div className="card text-center">
                <p className="text-lg font-bold text-primary">Local</p>
                <p className="text-xs text-gray-500">Control Plane</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

function ActivityTimeline({ activities }: { activities: AgentActivity[] }) {
  return (
    <div className="space-y-2">
      {activities.map((item) => {
        const Icon = item.requiresApproval ? AlertCircle : item.status === 'complete' || item.status === 'ready' ? CheckCircle2 : Loader2
        const screenshotPath = extractScreenshotPath(item.message)
        return (
          <div key={item.id} className="flex gap-3 rounded-xl bg-light-muted dark:bg-dark p-3">
            <div className={cn(
              'mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
              item.requiresApproval ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300' : 'bg-primary/10 text-primary'
            )}>
              <Icon className={cn('w-4 h-4', item.status === 'running' && 'animate-spin')} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase text-gray-400">{item.phase}</span>
                <span className="text-xs font-semibold text-gray-500">{item.status.replace(/_/g, ' ')}</span>
                <span className="text-[11px] text-gray-400">{new Date(item.at).toLocaleTimeString()}</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-200 mt-1">{item.message}</p>
              {screenshotPath && (
                <img
                  src={convertFileSrc(screenshotPath)}
                  alt="OpenClaw screenshot preview"
                  className="mt-3 max-h-64 w-full rounded-xl border border-gray-200 dark:border-gray-800 object-contain bg-black/5"
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function extractScreenshotPath(message: string) {
  const match = message.match(/Screenshot saved:\s(.+?\.png)/i)
  return match?.[1] || ''
}

function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const { addAgent } = useAgentsStore()

  const handleCreate = async () => {
    if (!name.trim()) return
    try {
      const id = await invoke('create_agent', {
        name,
        config: { description, instructions, tools: [] },
      }) as string
      addAgent({
        id,
        name,
        description,
        icon: 'bot',
        color: '#3B82F6',
        instructions,
        tools: [],
        isActive: false,
        memory: '',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      onClose()
    } catch (e) {
      console.error('Failed to create agent', e)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-dark-lighter rounded-2xl shadow-modal w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create New Agent</h2>
          <button onClick={onClose} className="p-2 hover:bg-light-muted dark:hover:bg-dark rounded-lg">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="Agent name..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
              placeholder="Brief description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="input-field min-h-[120px]"
              placeholder="Define the agent's behavior and capabilities..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleCreate} className="btn-primary">
             Create Agent
           </button>
        </div>
      </div>
    </div>
  )
}
