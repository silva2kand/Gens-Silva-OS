import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Eye,
  Filter,
  Loader2,
  Pause,
  RefreshCw,
  Square,
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
  events: RunTimelineEvent[]
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
        metadata: { controlledFrom: 'right_sidebar' },
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
            onStop={() => recordControlEvent(selectedRun, 'stopped', 'Run stopped', 'User stopped this run from the Live Agent Sidebar.')}
            onApprove={() => handleApproval(selectedRun, true)}
            onReject={() => handleApproval(selectedRun, false)}
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
  onStop,
}: {
  run: RunSummary
  busyAction: string | null
  onOpen: () => void
  onPause: () => void
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
          <IconButton label="Pause run" onClick={onPause} disabled={busyAction === `${run.runId}:paused`}>
            {busyAction === `${run.runId}:paused` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
          </IconButton>
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
  onReject,
}: {
  run: RunSummary
  busyAction: string | null
  onOpen: () => void
  onApprove: () => void
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
      <div className="mt-3 grid grid-cols-2 gap-2">
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
  onStop,
  onApprove,
  onReject,
}: {
  run: RunSummary
  busyAction: string | null
  onBack: () => void
  onPause: () => void
  onStop: () => void
  onApprove: () => void
  onReject: () => void
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
          <button type="button" onClick={onPause} className="btn-secondary px-3 py-2 text-xs" disabled={busyAction === `${run.runId}:paused`}>
            Pause
          </button>
          <button type="button" onClick={onStop} className="btn-secondary px-3 py-2 text-xs" disabled={busyAction === `${run.runId}:stopped`}>
            Stop
          </button>
          {(run.requiresApproval || run.status === 'waiting_approval') && (
            <>
              <button type="button" onClick={onReject} className="btn-secondary px-3 py-2 text-xs" disabled={busyAction === `${run.runId}:rejected`}>
                Reject
              </button>
              <button type="button" onClick={onApprove} className="btn-primary px-3 py-2 text-xs" disabled={busyAction === `${run.runId}:approved`}>
                Approve
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
      events: sorted,
    } satisfies RunSummary
  }).sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
}

function deriveRunStatus(events: RunTimelineEvent[]): RunStatus {
  if (events.some((event) => event.requiresApproval)) return 'waiting_approval'

  const latest = events[0]
  const haystack = `${latest.status} ${latest.eventType} ${latest.title}`.toLowerCase()
  if (haystack.includes('fail') || haystack.includes('error')) return 'failed'
  if (haystack.includes('warning')) return 'warning'
  if (haystack.includes('paused')) return 'paused'
  if (haystack.includes('stopped') || haystack.includes('cancel')) return 'stopped'
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

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
