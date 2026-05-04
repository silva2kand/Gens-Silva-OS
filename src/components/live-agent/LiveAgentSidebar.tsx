import { useCallback, useEffect, useMemo, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Filter,
  List,
  Loader2,
  Pause,
  RefreshCw,
  RotateCcw,
  Square,
  Volume2,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type RunTimelineEvent = {
  id: string
  at: string
  runId: string
  eventType: string
  source: string
  agent: string
  title: string
  text: string
  status: string
  safeToSpeak: boolean
  requiresApproval: boolean
  metadata: Record<string, unknown>
}

type RunSummary = {
  runId: string
  agent: string
  source: string
  title: string
  latestText: string
  latestAt: string
  status: RunStatus
  eventCount: number
  progress: number
  requiresApproval: boolean
  priority: 'low' | 'normal' | 'urgent'
  events: RunTimelineEvent[]
}

type ReplayLogEntry = {
  id: string
  at: string
  actionType: string
  targetApp: string
  approved: boolean
  status: string
  message: string
  screenshotPath?: string | null
  metadata: Record<string, unknown>
}

type RunStatus = 'running' | 'waiting_approval' | 'completed' | 'failed' | 'paused' | 'stopped' | 'warning'

const statusLabels: Record<RunStatus, string> = {
  running: 'Running',
  waiting_approval: 'Waiting Approval',
  completed: 'Completed',
  failed: 'Failed',
  paused: 'Paused',
  stopped: 'Stopped',
  warning: 'Warning',
}

const statusStyles: Record<RunStatus, string> = {
  running: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  waiting_approval: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  completed: 'bg-green-500/10 text-green-600 dark:text-green-300',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-300',
  paused: 'bg-gray-500/10 text-gray-600 dark:text-gray-300',
  stopped: 'bg-gray-500/10 text-gray-600 dark:text-gray-300',
  warning: 'bg-orange-500/10 text-orange-600 dark:text-orange-300',
}

const activeStatuses: RunStatus[] = ['running', 'waiting_approval', 'paused', 'warning']

export default function LiveAgentSidebar() {
  const [events, setEvents] = useState<RunTimelineEvent[]>([])
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('gsos.liveAgentSidebar.collapsed') === 'true')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [agentFilter, setAgentFilter] = useState('all')
  const [showOnlyActive, setShowOnlyActive] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [replayLogOpen, setReplayLogOpen] = useState(false)
  const [replayLog, setReplayLog] = useState<ReplayLogEntry[]>([])
  const [lastSpokenApprovalId, setLastSpokenApprovalId] = useState('')

  const loadTimeline = useCallback(async () => {
    try {
      const result = await invoke<RunTimelineEvent[]>('list_run_timeline', { limit: 180 })
      setEvents(result)
    } catch (error) {
      console.error('Failed to load run timeline', error)
    }
  }, [])

  useEffect(() => {
    loadTimeline()
    const interval = window.setInterval(loadTimeline, 15000)
    let unlisten: (() => void) | undefined

    listen<RunTimelineEvent>('unified_run_timeline_event', (event) => {
      setEvents((current) => [event.payload, ...current.filter((item) => item.id !== event.payload.id)].slice(0, 180))
    }).then((cleanup) => {
      unlisten = cleanup
    }).catch((error) => {
      console.error('Failed to listen for run timeline events', error)
    })

    return () => {
      window.clearInterval(interval)
      unlisten?.()
    }
  }, [loadTimeline])

  useEffect(() => {
    localStorage.setItem('gsos.liveAgentSidebar.collapsed', String(collapsed))
  }, [collapsed])

  const runs = useMemo(() => summarizeRuns(events), [events])
  const agents = useMemo(() => {
    const names = Array.from(new Set(runs.map((run) => run.agent).filter(Boolean)))
    return names.sort((a, b) => a.localeCompare(b))
  }, [runs])

  const filteredRuns = useMemo(() => runs.filter((run) => {
    const matchesAgent = agentFilter === 'all' || run.agent === agentFilter
    const matchesActive = !showOnlyActive || activeStatuses.includes(run.status)
    return matchesAgent && matchesActive
  }), [agentFilter, runs, showOnlyActive])

  const activeRuns = filteredRuns.filter((run) => run.status === 'running')
  const backgroundRuns = filteredRuns.filter((run) => isBackgroundRun(run) && activeStatuses.includes(run.status))
  const approvals = filteredRuns.filter((run) => run.requiresApproval || run.status === 'waiting_approval')
  const completed = filteredRuns.filter((run) => run.status === 'completed').slice(0, 8)
  const warnings = filteredRuns.filter((run) => run.status === 'failed' || run.status === 'warning').slice(0, 8)
  const selectedRun = runs.find((run) => run.runId === selectedRunId) || null

  useEffect(() => {
    const approval = approvals[0]
    if (!approval || approval.runId === lastSpokenApprovalId) return
    setLastSpokenApprovalId(approval.runId)
    speakApprovalAlert(`${approval.agent} needs approval.`)
  }, [approvals, lastSpokenApprovalId])

  const openReplayLog = async () => {
    try {
      const result = await invoke<ReplayLogEntry[]>('list_operator_replay_log')
      setReplayLog(result)
      setReplayLogOpen(true)
    } catch (error) {
      console.error('Failed to load operator replay log', error)
    }
  }

  const recordControlEvent = async (run: RunSummary, status: RunStatus, title: string, text: string) => {
    const actionKey = `${run.runId}:${status}`
    setBusyAction(actionKey)
    try {
      await invoke('add_run_timeline_event', {
        runId: run.runId,
        eventType: `control_${status}`,
        source: 'live_agent_sidebar',
        agent: run.agent,
        title,
        text,
        status,
        requiresApproval: false,
        metadata: { controlledFrom: 'right_sidebar', priority: run.priority },
      })
      await loadTimeline()
    } catch (error) {
      console.error(`Failed to ${status} run`, error)
    } finally {
      setBusyAction(null)
    }
  }

  const handleApproval = async (run: RunSummary, approved: boolean) => {
    const action = approved ? 'approved' : 'rejected'
    setBusyAction(`${run.runId}:${action}`)
    const notificationId = findNotificationId(run)
    try {
      if (notificationId) {
        await invoke('dispatch_notification_action', {
          notificationId,
          selectedAction: approved ? 'approve' : 'reject',
        })
      }
      await invoke('add_run_timeline_event', {
        runId: run.runId,
        eventType: `approval_${action}`,
        source: 'live_agent_sidebar',
        agent: run.agent,
        title: approved ? 'Approval granted' : 'Approval rejected',
        text: approved
          ? 'User approved this action from the Live Agent Sidebar.'
          : 'User rejected this action from the Live Agent Sidebar.',
        status: approved ? 'completed' : 'stopped',
        requiresApproval: false,
        metadata: { notificationId: notificationId || null, controlledFrom: 'right_sidebar' },
      })
      await loadTimeline()
    } catch (error) {
      console.error('Failed to route approval action', error)
    } finally {
      setBusyAction(null)
    }
  }

  const handleAlwaysAllow = async (run: RunSummary) => {
    setBusyAction(`${run.runId}:always`)
    try {
      await invoke('add_run_timeline_event', {
        runId: run.runId,
        eventType: 'approval_always_allow_requested',
        source: 'live_agent_sidebar',
        agent: run.agent,
        title: 'Always allow safe action requested',
        text: 'User requested always allow for this safe action type. Risky actions remain approval-gated by the permission system.',
        status: 'completed',
        requiresApproval: false,
        metadata: {
          controlledFrom: 'right_sidebar',
          priority: run.priority,
          actionScope: inferActionScope(run),
          safetyNote: 'Only non-risky repeated actions should be auto-allowed.',
        },
      })
      await loadTimeline()
    } catch (error) {
      console.error('Failed to record always allow request', error)
    } finally {
      setBusyAction(null)
    }
  }

  const updatePriority = async (run: RunSummary, priority: RunSummary['priority']) => {
    setBusyAction(`${run.runId}:priority`)
    try {
      await invoke('add_run_timeline_event', {
        runId: run.runId,
        eventType: 'priority_changed',
        source: 'live_agent_sidebar',
        agent: run.agent,
        title: `Priority set to ${priority}`,
        text: `User set this task priority to ${priority}.`,
        status: run.status,
        requiresApproval: run.requiresApproval,
        metadata: { controlledFrom: 'right_sidebar', priority },
      })
      await loadTimeline()
    } catch (error) {
      console.error('Failed to update priority', error)
    } finally {
      setBusyAction(null)
    }
  }

  if (collapsed) {
    return (
      <aside className="h-screen w-12 shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter flex flex-col items-center py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-lg hover:bg-light-muted dark:hover:bg-dark text-gray-500 hover:text-primary"
          title="Expand live agent sidebar"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="mt-4 flex flex-col items-center gap-3">
          <SidebarRailCount label="Active runs" count={runs.filter((run) => activeStatuses.includes(run.status)).length} tone="blue" />
          <SidebarRailCount label="Approvals" count={approvals.length} tone="amber" />
          <SidebarRailCount label="Warnings" count={warnings.length} tone="red" />
        </div>
      </aside>
    )
  }

  return (
    <aside className="h-screen w-[360px] shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter flex flex-col">
      <header className="h-16 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-black uppercase tracking-normal text-gray-900 dark:text-white">Live Agents</h2>
          <p className="text-xs text-gray-500 truncate">Runs, tools, approvals, voice, warnings</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={loadTimeline}
            className="p-2 rounded-lg hover:bg-light-muted dark:hover:bg-dark text-gray-500 hover:text-primary"
            title="Refresh live runs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={openReplayLog}
            className="p-2 rounded-lg hover:bg-light-muted dark:hover:bg-dark text-gray-500 hover:text-primary"
            title="Open full replay log"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="p-2 rounded-lg hover:bg-light-muted dark:hover:bg-dark text-gray-500 hover:text-primary"
            title="Collapse live agent sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="p-3 border-b border-gray-200 dark:border-gray-800 space-y-2">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
            className="input-field py-2 text-xs"
            aria-label="Filter live runs by agent"
          >
            <option value="all">All agents</option>
            {agents.map((agent) => (
              <option key={agent} value={agent}>{agent}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg bg-light-muted dark:bg-dark px-3 py-2">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Show only active</span>
          <button
            type="button"
            role="switch"
            aria-checked={showOnlyActive}
            data-checked={showOnlyActive ? 'true' : 'false'}
            onClick={() => setShowOnlyActive((value) => !value)}
            className="toggle-switch"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {selectedRun ? (
          <RunDetails
            run={selectedRun}
            busyAction={busyAction}
            onBack={() => setSelectedRunId(null)}
            onPause={() => recordControlEvent(selectedRun, 'paused', 'Run paused', 'User paused this run from the Live Agent Sidebar.')}
            onResume={() => recordControlEvent(selectedRun, 'running', 'Run resumed', 'User resumed this paused run from the Live Agent Sidebar.')}
            onStop={() => recordControlEvent(selectedRun, 'stopped', 'Run stopped', 'User stopped this run from the Live Agent Sidebar.')}
            onApprove={() => handleApproval(selectedRun, true)}
            onAlwaysAllow={() => handleAlwaysAllow(selectedRun)}
            onReject={() => handleApproval(selectedRun, false)}
            onPriorityChange={(priority) => updatePriority(selectedRun, priority)}
          />
        ) : (
          <>
            <RunSection title="Active Runs" count={activeRuns.length} empty="No active agent runs.">
              {activeRuns.map((run) => (
                <RunCard
                  key={run.runId}
                  run={run}
                  busyAction={busyAction}
                  onOpen={() => setSelectedRunId(run.runId)}
                  onPause={() => recordControlEvent(run, 'paused', 'Run paused', 'User paused this run from the Live Agent Sidebar.')}
                  onResume={() => recordControlEvent(run, 'running', 'Run resumed', 'User resumed this paused run from the Live Agent Sidebar.')}
                  onStop={() => recordControlEvent(run, 'stopped', 'Run stopped', 'User stopped this run from the Live Agent Sidebar.')}
                />
              ))}
            </RunSection>

            <RunSection title="Background Tasks" count={backgroundRuns.length} empty="No background tasks running.">
              {backgroundRuns.map((run) => (
                <RunCard
                  key={run.runId}
                  run={run}
                  busyAction={busyAction}
                  onOpen={() => setSelectedRunId(run.runId)}
                  onPause={() => recordControlEvent(run, 'paused', 'Run paused', 'User paused this background task.')}
                  onResume={() => recordControlEvent(run, 'running', 'Run resumed', 'User resumed this background task.')}
                  onStop={() => recordControlEvent(run, 'stopped', 'Run stopped', 'User stopped this background task.')}
                />
              ))}
            </RunSection>

            <RunSection title="Approvals Needed" count={approvals.length} empty="No approvals waiting.">
              {approvals.map((run) => (
                <ApprovalCard
                  key={run.runId}
                  run={run}
                  busyAction={busyAction}
                  onOpen={() => setSelectedRunId(run.runId)}
                  onApprove={() => handleApproval(run, true)}
                  onAlwaysAllow={() => handleAlwaysAllow(run)}
                  onReject={() => handleApproval(run, false)}
                />
              ))}
            </RunSection>

            <RunSection title="Recent Completed" count={completed.length} empty="No completed runs yet.">
              {completed.map((run) => (
                <CompactRunRow key={run.runId} run={run} onOpen={() => setSelectedRunId(run.runId)} />
              ))}
            </RunSection>

            <RunSection title="Errors / Warnings" count={warnings.length} empty="No errors or warnings.">
              {warnings.map((run) => (
                <CompactRunRow key={run.runId} run={run} onOpen={() => setSelectedRunId(run.runId)} />
              ))}
            </RunSection>
          </>
        )}
      </div>
      {replayLogOpen && (
        <ReplayLogModal entries={replayLog} onClose={() => setReplayLogOpen(false)} />
      )}
    </aside>
  )
}

function RunSection({
  title,
  count,
  empty,
  children,
}: {
  title: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-black uppercase tracking-normal text-gray-500 dark:text-gray-400">{title}</h3>
        <span className="px-2 py-0.5 rounded-full bg-light-muted dark:bg-dark text-[11px] font-bold text-gray-500">
          {count}
        </span>
      </div>
      <div className="space-y-2">
        {count > 0 ? children : (
          <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-800 p-3 text-xs text-gray-500">
            {empty}
          </div>
        )}
      </div>
    </section>
  )
}

function RunCard({
  run,
  busyAction,
  onOpen,
  onPause,
  onResume,
  onStop,
}: {
  run: RunSummary
  busyAction: string | null
  onOpen: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-light-muted/60 dark:bg-dark p-3">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
              {run.agent || 'Agent'} — {run.title || 'Working'}
            </p>
            <p className="text-xs text-gray-500 line-clamp-2 mt-1">{run.latestText}</p>
          </div>
          <StatusBadge status={run.status} />
        </div>
        <ProgressBar value={run.progress} status={run.status} />
      </button>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">{formatTime(run.latestAt)} · {run.eventCount} events</span>
        <div className="flex items-center gap-1">
          <IconButton label="Open details" onClick={onOpen}><Eye className="w-3.5 h-3.5" /></IconButton>
          {run.status === 'paused' ? (
            <IconButton label="Resume run" onClick={onResume} disabled={busyAction === `${run.runId}:running`}>
              {busyAction === `${run.runId}:running` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            </IconButton>
          ) : (
            <IconButton label="Pause run" onClick={onPause} disabled={busyAction === `${run.runId}:paused`}>
              {busyAction === `${run.runId}:paused` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
            </IconButton>
          )}
          <IconButton label="Stop run" onClick={onStop} disabled={busyAction === `${run.runId}:stopped`} danger>
            {busyAction === `${run.runId}:stopped` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
          </IconButton>
        </div>
      </div>
    </div>
  )
}

function ApprovalCard({
  run,
  busyAction,
  onOpen,
  onApprove,
  onAlwaysAllow,
  onReject,
}: {
  run: RunSummary
  busyAction: string | null
  onOpen: () => void
  onApprove: () => void
  onAlwaysAllow: () => void
  onReject: () => void
}) {
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{run.agent} needs approval</p>
            <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 mt-1">{run.latestText}</p>
          </div>
        </div>
      </button>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onReject}
          disabled={busyAction === `${run.runId}:rejected`}
          className="px-3 py-2 rounded-lg bg-white dark:bg-dark border border-gray-200 dark:border-gray-800 text-xs font-bold text-gray-600 dark:text-gray-300 hover:border-red-400 hover:text-red-500"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={onAlwaysAllow}
          disabled={busyAction === `${run.runId}:always`}
          className="px-3 py-2 rounded-lg bg-white dark:bg-dark border border-gray-200 dark:border-gray-800 text-xs font-bold text-gray-600 dark:text-gray-300 hover:border-primary/40 hover:text-primary"
        >
          Always
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={busyAction === `${run.runId}:approved`}
          className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-hover"
        >
          Approve
        </button>
      </div>
    </div>
  )
}

function CompactRunRow({ run, onOpen }: { run: RunSummary; onOpen: () => void }) {
  const Icon = run.status === 'completed' ? CheckCircle2 : run.status === 'failed' ? XCircle : AlertTriangle
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-light-muted/60 dark:bg-dark p-3 text-left hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start gap-2">
        <Icon className={cn(
          'w-4 h-4 mt-0.5 shrink-0',
          run.status === 'completed' ? 'text-green-500' : 'text-red-500'
        )} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{run.agent || 'Agent'}</p>
          <p className="text-xs text-gray-500 truncate">{run.title || run.latestText}</p>
          <p className="text-[11px] text-gray-400 mt-1">{formatTime(run.latestAt)}</p>
        </div>
      </div>
    </button>
  )
}

function RunDetails({
  run,
  busyAction,
  onBack,
  onPause,
  onResume,
  onStop,
  onApprove,
  onAlwaysAllow,
  onReject,
  onPriorityChange,
}: {
  run: RunSummary
  busyAction: string | null
  onBack: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onApprove: () => void
  onAlwaysAllow: () => void
  onReject: () => void
  onPriorityChange: (priority: RunSummary['priority']) => void
}) {
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-primary"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to live runs
      </button>

      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-light-muted/60 dark:bg-dark p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-gray-900 dark:text-white">{run.agent || 'Agent'}</h3>
            <p className="text-xs text-gray-500 mt-1">{run.title || 'Run details'}</p>
          </div>
          <StatusBadge status={run.status} />
        </div>
        <ProgressBar value={run.progress} status={run.status} />
        <div className="mt-3 flex flex-wrap gap-2">
          {run.status === 'paused' ? (
            <button type="button" onClick={onResume} className="btn-secondary px-3 py-2 text-xs" disabled={busyAction === `${run.runId}:running`}>
              Resume
            </button>
          ) : (
            <button type="button" onClick={onPause} className="btn-secondary px-3 py-2 text-xs" disabled={busyAction === `${run.runId}:paused`}>
              Pause
            </button>
          )}
          <button type="button" onClick={onStop} className="btn-secondary px-3 py-2 text-xs" disabled={busyAction === `${run.runId}:stopped`}>
            Stop
          </button>
          <select
            value={run.priority}
            onChange={(event) => onPriorityChange(event.target.value as RunSummary['priority'])}
            className="input-field w-auto px-3 py-2 text-xs"
            aria-label="Task priority"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
          {(run.requiresApproval || run.status === 'waiting_approval') && (
            <>
              <button type="button" onClick={onReject} className="btn-secondary px-3 py-2 text-xs" disabled={busyAction === `${run.runId}:rejected`}>
                Reject
              </button>
              <button type="button" onClick={onAlwaysAllow} className="btn-secondary px-3 py-2 text-xs" disabled={busyAction === `${run.runId}:always`}>
                Always Allow Safe
              </button>
              <button type="button" onClick={onApprove} className="btn-primary px-3 py-2 text-xs" disabled={busyAction === `${run.runId}:approved`}>
                Approve Once
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {run.events.map((event) => (
          <div key={event.id} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase text-gray-400">{event.eventType.replace(/_/g, ' ')}</span>
              <span className="text-[11px] text-gray-400">{formatTime(event.at)}</span>
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{event.title}</p>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{event.text}</p>
            <EventSourceLinks event={event} />
            <EventScreenshotPreview event={event} />
          </div>
        ))}
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span className={cn('px-2 py-1 rounded-lg text-[10px] font-black uppercase whitespace-nowrap', statusStyles[status])}>
      {statusLabels[status]}
    </span>
  )
}

function EventSourceLinks({ event }: { event: RunTimelineEvent }) {
  const links = extractSourceLinks(event)
  if (links.length === 0) return null

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {links.map((link) => (
        <a
          key={`${link.label}:${link.href}`}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-light-muted dark:bg-dark text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:text-primary"
        >
          <ExternalLink className="w-3 h-3" />
          {link.label}
        </a>
      ))}
    </div>
  )
}

function EventScreenshotPreview({ event }: { event: RunTimelineEvent }) {
  const path = extractScreenshotPath(event)
  if (!path) return null

  return (
    <img
      src={convertFileSrc(path)}
      alt="OpenClaw screenshot preview"
      className="mt-3 max-h-48 w-full rounded-lg border border-gray-200 dark:border-gray-800 object-contain bg-black/5"
    />
  )
}

function ReplayLogModal({ entries, onClose }: { entries: ReplayLogEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-4xl max-h-[86vh] rounded-lg bg-white dark:bg-dark-lighter border border-gray-200 dark:border-gray-800 shadow-modal overflow-hidden flex flex-col">
        <div className="h-14 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black text-gray-900 dark:text-white">OpenClaw Replay Log</h2>
            <p className="text-xs text-gray-500">{entries.length} recorded action(s)</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-light-muted dark:hover:bg-dark text-gray-500 hover:text-primary"
            title="Close replay log"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-800 p-4 text-sm text-gray-500">
              No replay log entries yet.
            </div>
          ) : entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-light-muted/60 dark:bg-dark p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{entry.actionType} · {entry.targetApp}</p>
                  <p className="text-[11px] text-gray-400">{new Date(entry.at).toLocaleString()}</p>
                </div>
                <span className={cn(
                  'px-2 py-1 rounded-lg text-[10px] font-black uppercase',
                  entry.status.includes('error') || entry.status.includes('blocked')
                    ? 'bg-red-500/10 text-red-600 dark:text-red-300'
                    : 'bg-green-500/10 text-green-600 dark:text-green-300'
                )}>
                  {entry.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">{entry.message}</p>
              {entry.screenshotPath && (
                <img
                  src={convertFileSrc(entry.screenshotPath)}
                  alt="Replay screenshot"
                  className="mt-3 max-h-56 w-full rounded-lg border border-gray-200 dark:border-gray-800 object-contain bg-black/5"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ProgressBar({ value, status }: { value: number; status: RunStatus }) {
  return (
    <div className="mt-3">
      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            status === 'failed' ? 'bg-red-500' : status === 'waiting_approval' ? 'bg-amber-500' : 'bg-primary'
          )}
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-gray-400">{value}%</p>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'p-1.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter text-gray-500 hover:text-primary disabled:opacity-50',
        danger && 'hover:text-red-500'
      )}
    >
      {children}
    </button>
  )
}

function SidebarRailCount({ label, count, tone }: { label: string; count: number; tone: 'blue' | 'amber' | 'red' }) {
  const toneClass = {
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    red: 'bg-red-500/10 text-red-600 dark:text-red-300',
  }[tone]

  return (
    <div title={`${label}: ${count}`} className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black', toneClass)}>
      {count}
    </div>
  )
}

function summarizeRuns(events: RunTimelineEvent[]) {
  const grouped = new Map<string, RunTimelineEvent[]>()

  events.forEach((event) => {
    const runId = event.runId || event.id
    grouped.set(runId, [...(grouped.get(runId) || []), event])
  })

  return Array.from(grouped.entries()).map(([runId, runEvents]) => {
    const sorted = [...runEvents].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    const latest = sorted[0]
    const status = deriveRunStatus(sorted)
    return {
      runId,
      agent: latest.agent || 'System',
      source: latest.source || 'timeline',
      title: latest.title || latest.eventType,
      latestText: latest.text || latest.title,
      latestAt: latest.at,
      status,
      eventCount: sorted.length,
      progress: deriveProgress(status, sorted.length),
      requiresApproval: sorted.some((event) => event.requiresApproval),
      priority: derivePriority(sorted),
      events: sorted,
    } satisfies RunSummary
  }).sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
}

function deriveRunStatus(events: RunTimelineEvent[]): RunStatus {
  const latest = events[0]
  const haystack = `${latest.status} ${latest.eventType} ${latest.title}`.toLowerCase()
  if (haystack.includes('approval_rejected')) return 'stopped'
  if (haystack.includes('approval_approved') || haystack.includes('approval granted')) return 'completed'
  if (haystack.includes('fail') || haystack.includes('error')) return 'failed'
  if (haystack.includes('warning')) return 'warning'
  if (haystack.includes('paused')) return 'paused'
  if (haystack.includes('stopped') || haystack.includes('cancel')) return 'stopped'
  if (events.some((event) => event.requiresApproval)) return 'waiting_approval'
  if (haystack.includes('approval')) return 'waiting_approval'
  if (haystack.includes('complete') || haystack.includes('done') || haystack.includes('finished')) return 'completed'
  if (haystack.includes('running') || haystack.includes('started') || haystack.includes('tool')) return 'running'
  return 'completed'
}

function deriveProgress(status: RunStatus, eventCount: number) {
  if (status === 'completed' || status === 'failed' || status === 'stopped') return 100
  if (status === 'waiting_approval') return 65
  if (status === 'paused') return 50
  return Math.min(90, Math.max(15, eventCount * 15))
}

function isBackgroundRun(run: RunSummary) {
  const haystack = `${run.agent} ${run.source} ${run.title} ${run.latestText}`.toLowerCase()
  return haystack.includes('background') ||
    haystack.includes('scheduled') ||
    haystack.includes('self-study') ||
    haystack.includes('watcher') ||
    haystack.includes('notification')
}

function findNotificationId(run: RunSummary) {
  for (const event of run.events) {
    const value = event.metadata?.notificationId || event.metadata?.notification_id || event.metadata?.shortId
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function derivePriority(events: RunTimelineEvent[]): RunSummary['priority'] {
  for (const event of events) {
    const priority = event.metadata?.priority
    if (priority === 'low' || priority === 'normal' || priority === 'urgent') return priority
  }
  const haystack = events.map((event) => `${event.title} ${event.text}`).join(' ').toLowerCase()
  if (haystack.includes('urgent') || haystack.includes('deadline') || haystack.includes('court') || haystack.includes('final notice')) {
    return 'urgent'
  }
  if (haystack.includes('later') || haystack.includes('low priority')) return 'low'
  return 'normal'
}

function extractScreenshotPath(event: RunTimelineEvent) {
  const metadataPath = event.metadata?.screenshotPath || event.metadata?.screenshot_path || event.metadata?.imagePath || event.metadata?.image_path
  if (typeof metadataPath === 'string' && metadataPath.endsWith('.png')) return metadataPath
  const match = event.text.match(/Screenshot saved:\s(.+?\.png)/i)
  return match?.[1] || ''
}

function extractSourceLinks(event: RunTimelineEvent) {
  const links: Array<{ label: string; href: string }> = []
  const url = event.metadata?.url || event.metadata?.sourceUrl || event.metadata?.source_url
  const email = event.metadata?.email || event.metadata?.sender
  const file = event.metadata?.filePath || event.metadata?.file_path

  if (typeof url === 'string' && /^https?:\/\//i.test(url)) links.push({ label: 'Open source', href: url })
  if (typeof email === 'string' && email.includes('@')) links.push({ label: 'Email source', href: `mailto:${email}` })
  if (typeof file === 'string' && file.trim()) links.push({ label: 'Open file', href: convertFileSrc(file) })

  const textUrl = event.text.match(/https?:\/\/[^\s)]+/i)?.[0]
  if (textUrl && !links.some((link) => link.href === textUrl)) links.push({ label: 'Open link', href: textUrl })
  return links.slice(0, 4)
}

function inferActionScope(run: RunSummary) {
  const haystack = `${run.source} ${run.title} ${run.latestText}`.toLowerCase()
  if (haystack.includes('email') || haystack.includes('outlook')) return 'email_read_or_draft'
  if (haystack.includes('screenshot') || haystack.includes('vision')) return 'screen_observe'
  if (haystack.includes('browser')) return 'browser_navigation'
  if (haystack.includes('file')) return 'file_read'
  return 'safe_read_only_action'
}

function speakApprovalAlert(text: string) {
  try {
    const enabled = localStorage.getItem('gsos.voice.approvalAlerts')
    if (enabled === 'false') return
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.95
    utterance.pitch = 1
    window.speechSynthesis.speak(utterance)
  } catch (error) {
    console.error('Voice approval alert failed', error)
  }
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
