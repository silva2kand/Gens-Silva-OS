import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { MessageSquare, Plus, RefreshCw, Trash2, CheckCircle2, Smartphone, Mail, MessageCircle, MonitorSmartphone, AlertCircle, PlayCircle, Slack, Send, Webhook, Users, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

type ChannelConfig = {
  id: string
  name: string
  kind: string
  enabled: boolean
  inbound: boolean
  outbound: boolean
  commandPrefix: string
  rateLimitPerMinute: number
  offlineMessage: string
}

type ChannelDiagnostics = {
  id: string
  ok: boolean
  installed: boolean
  running: boolean
  status: string
  detail: string
  processNames: string[]
  detectedPaths: string[]
}

type ChannelNotification = {
  id: string
  channel: string
  agentId: string
  title: string
  message: string
  status: string
  response: string
  requiresApproval: boolean
  createdAt: string
  updatedAt: string
}

type AllowedReply = {
  code: string
  label: string
  action: string
  requiresApproval: boolean
}

type RoutedReply = {
  id: string
  at: string
  channel: string
  raw: string
  notificationId: string
  selectedCode: string
  selectedAction: string
  status: string
  message: string
}

type UniversalNotification = {
  notificationId: string
  shortId: string
  channel: string
  sourceAgent: string
  sourceItemId: string
  threadId: string
  actionType: string
  title: string
  message: string
  allowedReplies: AllowedReply[]
  status: string
  replyHistory: RoutedReply[]
  requiresApproval: boolean
  createdAt: string
  updatedAt: string
  expiresAt: string
}

const channelIcons: Record<string, React.ElementType> = {
  discord: MessageCircle,
  slack: Slack,
  teams: Users,
  telegram: Send,
  line: MessageCircle,
  whatsapp: Smartphone,
  'phone-link': MonitorSmartphone,
  email: Mail,
  gmail: Inbox,
  outlook: Mail,
  sms: Smartphone,
  webhook: Webhook,
}

const apiSetupKinds = new Set(['discord', 'slack', 'teams', 'telegram', 'line', 'sms', 'webhook', 'gmail'])

const defaultChannels: ChannelConfig[] = [
  { id: 'whatsapp-default', name: 'WhatsApp Desktop', kind: 'whatsapp', enabled: true, inbound: false, outbound: true, commandPrefix: '!gsos', rateLimitPerMinute: 20, offlineMessage: 'WhatsApp channel is currently offline.' },
  { id: 'phonelink-default', name: 'Windows Phone Link', kind: 'phone-link', enabled: true, inbound: true, outbound: true, commandPrefix: '!gsos', rateLimitPerMinute: 20, offlineMessage: 'Phone Link channel is currently offline.' },
  { id: 'outlook-classic-default', name: 'Classic Outlook Desktop', kind: 'outlook', enabled: true, inbound: true, outbound: true, commandPrefix: '!gsos', rateLimitPerMinute: 15, offlineMessage: 'Outlook desktop channel is currently offline.' },
  { id: 'email-default', name: 'Email Inbox', kind: 'email', enabled: true, inbound: true, outbound: true, commandPrefix: '!gsos', rateLimitPerMinute: 15, offlineMessage: 'Email channel is currently offline.' },
  { id: 'gmail-default', name: 'Gmail', kind: 'gmail', enabled: false, inbound: true, outbound: true, commandPrefix: '!gsos', rateLimitPerMinute: 15, offlineMessage: 'Gmail channel is currently offline.' },
  { id: 'slack-default', name: 'Slack', kind: 'slack', enabled: false, inbound: true, outbound: true, commandPrefix: '!gsos', rateLimitPerMinute: 30, offlineMessage: 'Slack channel is currently offline.' },
  { id: 'discord-default', name: 'Discord', kind: 'discord', enabled: false, inbound: true, outbound: true, commandPrefix: '!gsos', rateLimitPerMinute: 30, offlineMessage: 'Discord agent is currently offline.' },
  { id: 'telegram-default', name: 'Telegram', kind: 'telegram', enabled: false, inbound: true, outbound: true, commandPrefix: '/gsos', rateLimitPerMinute: 30, offlineMessage: 'Telegram channel is currently offline.' },
  { id: 'sms-default', name: 'SMS / Twilio', kind: 'sms', enabled: false, inbound: false, outbound: true, commandPrefix: '!gsos', rateLimitPerMinute: 10, offlineMessage: 'SMS channel is currently offline.' },
  { id: 'webhook-default', name: 'Webhook Listener', kind: 'webhook', enabled: false, inbound: true, outbound: false, commandPrefix: '!gsos', rateLimitPerMinute: 60, offlineMessage: 'Webhook listener is currently offline.' },
  { id: 'teams-default', name: 'Microsoft Teams', kind: 'teams', enabled: false, inbound: true, outbound: true, commandPrefix: '!gsos', rateLimitPerMinute: 30, offlineMessage: 'Teams channel is currently offline.' },
  { id: 'line-default', name: 'LINE', kind: 'line', enabled: false, inbound: true, outbound: true, commandPrefix: '!gsos', rateLimitPerMinute: 30, offlineMessage: 'LINE channel is currently offline.' },
]

const sortChannels = (items: ChannelConfig[]) =>
  [...items].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name))

const fallbackDiagnostics = (items: ChannelConfig[]): Record<string, ChannelDiagnostics> =>
  Object.fromEntries(items.map((channel) => [channel.id, {
    id: channel.id,
    ok: false,
    installed: apiSetupKinds.has(channel.kind),
    running: false,
    status: apiSetupKinds.has(channel.kind) ? 'available' : 'unknown',
    detail: apiSetupKinds.has(channel.kind)
      ? 'Available in the router catalog. Add the API token, OAuth, webhook, or bridge to make it live.'
      : 'Desktop detection will run after the Tauri channel command responds.',
    processNames: [],
    detectedPaths: [],
  }]))

export default function ChannelsView() {
  const [channels, setChannels] = useState<ChannelConfig[]>([])
  const [diagnostics, setDiagnostics] = useState<Record<string, ChannelDiagnostics>>({})
  const [notifications, setNotifications] = useState<ChannelNotification[]>([])
  const [universalNotifications, setUniversalNotifications] = useState<UniversalNotification[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadChannels = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const results = await Promise.allSettled([
        invoke('list_channels'),
        invoke('check_channel_connections'),
        invoke('list_channel_notifications', { channel: null }),
        invoke('list_universal_notifications', { status: null }),
      ])
      const list = results[0].status === 'fulfilled' && Array.isArray(results[0].value)
        ? results[0].value as ChannelConfig[]
        : []
      const activeChannels = list.length > 0 ? list : defaultChannels
      const checks = results[1].status === 'fulfilled' && Array.isArray(results[1].value)
        ? results[1].value as ChannelDiagnostics[]
        : []
      const channelNotifications = results[2].status === 'fulfilled' && Array.isArray(results[2].value)
        ? results[2].value as ChannelNotification[]
        : []
      const routedNotifications = results[3].status === 'fulfilled' && Array.isArray(results[3].value)
        ? results[3].value as UniversalNotification[]
        : []

      if (list.length === 0) {
        const failed = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined
        setLoadError(failed ? `Using built-in channel catalog because backend load failed: ${String(failed.reason)}` : 'Using built-in channel catalog until backend returns saved channels.')
      }

      setChannels(sortChannels(activeChannels))
      setDiagnostics(checks.length > 0 ? Object.fromEntries(checks.map((check) => [check.id, check])) : fallbackDiagnostics(activeChannels))
      setNotifications(channelNotifications)
      setUniversalNotifications(routedNotifications)
    } catch (e) {
      console.error('Failed to load channels', e)
      setLoadError(`Using built-in channel catalog because channel load failed: ${String(e)}`)
      setChannels(sortChannels(defaultChannels))
      setDiagnostics(fallbackDiagnostics(defaultChannels))
      setNotifications([])
      setUniversalNotifications([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadChannels()
  }, [])

  const handleCreate = async () => {
    const name = prompt('Channel name (e.g. Team Slack):')
    if (!name) return
    const kind = prompt('Channel type (slack/discord/telegram/email/webhook/sms):', 'slack') || 'slack'
    try {
      await invoke('create_channel', { name, kind, inbound: true, outbound: true, commandPrefix: '!gsos' })
      await loadChannels()
    } catch (e) {
      alert(`Failed to create channel: ${e}`)
    }
  }

  const toggleEnabled = async (channel: ChannelConfig) => {
    await invoke('update_channel', { id: channel.id, updates: { enabled: !channel.enabled } })
    await loadChannels()
  }

  const handleRestoreDefaults = async () => {
    try {
      const restored = await invoke('restore_default_channels') as ChannelConfig[]
      const activeChannels = restored.length > 0 ? restored : defaultChannels
      setChannels(sortChannels(activeChannels))
      setDiagnostics(fallbackDiagnostics(activeChannels))
      await loadChannels()
    } catch (e) {
      setLoadError(`Backend restore failed, showing built-in channel catalog: ${String(e)}`)
      setChannels(sortChannels(defaultChannels))
      setDiagnostics(fallbackDiagnostics(defaultChannels))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this channel?')) return
    await invoke('delete_channel', { id })
    await loadChannels()
  }

  const handleTest = async (id: string) => {
    const result = (await invoke('test_channel', { id })) as any
    setDiagnostics((current) => ({
      ...current,
      [id]: {
        id,
        ok: Boolean(result.ok),
        installed: Boolean(result.installed),
        running: Boolean(result.running),
        status: result.status || 'unknown',
        detail: result.message || 'Channel test complete',
        processNames: result.processNames || [],
        detectedPaths: result.detectedPaths || [],
      },
    }))
    alert(result.message || 'Channel test complete')
  }

  const handleCreateTestNotification = async () => {
    await invoke('create_universal_notification', {
      channel: 'whatsapp',
      sourceAgent: 'system',
      sourceItemId: 'test-notification',
      threadId: `test-${Date.now()}`,
      actionType: 'general',
      title: 'GSOS test notification',
      message: 'Channels Command Router test. Reply with the shown short ID and an option, e.g. N-1042 1.',
      allowedReplies: null,
      expiresMinutes: 60,
      requiresApproval: false,
    })
    await loadChannels()
  }

  const handleRouteReply = async () => {
    const raw = prompt('Paste reply command, e.g. H-1042 1:')
    if (!raw?.trim()) return
    try {
      const result = await invoke('route_inbound_reply', { channel: 'app', raw }) as RoutedReply
      alert(result.message)
      await loadChannels()
    } catch (e) {
      alert(`Reply routing failed: ${e}`)
    }
  }

  const handleRespondNotification = async (notification: ChannelNotification) => {
    const response = prompt(`Response for ${notification.title}:`, notification.response || '')
    if (response === null) return
    await invoke('respond_channel_notification', { id: notification.id, response })
    await loadChannels()
  }

  const enabledCount = channels.filter((channel) => channel.enabled).length
  const connectedCount = channels.filter((channel) => channel.enabled && diagnostics[channel.id]?.running).length
  const availableCount = channels.length

  return (
    <div className="h-full flex flex-col bg-light dark:bg-dark overflow-hidden">
      <header className="h-14 px-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter shadow-sm">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-gray-900 dark:text-white text-lg">Channels</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadChannels} className="btn-secondary flex items-center gap-2">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </button>
          <button onClick={handleCreateTestNotification} className="btn-secondary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Test Notify
          </button>
          <button onClick={handleRouteReply} className="btn-secondary flex items-center gap-2">
            <Send className="w-4 h-4" />
            Route Reply
          </button>
          <button onClick={handleRestoreDefaults} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Restore Channels
          </button>
          <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Channel
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 bg-light-muted/20 dark:bg-dark/10 flex flex-col">
        <div className="mb-6 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-dark/40">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">
              Refresh checks local Windows desktop apps. WhatsApp Desktop, classic Outlook/Outlook for Windows, Teams, and Phone Link show connected only when the app is detected and running. Cloud/API channels show available until their token, OAuth, webhook, or bridge is configured.
            </p>
            <div className="flex flex-wrap gap-2 text-xs font-black uppercase">
              <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary">{availableCount} available</span>
              <span className="px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">{connectedCount} connected</span>
              <span className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">{enabledCount} enabled</span>
            </div>
          </div>
          {loadError && (
            <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {loadError}
            </p>
          )}
        </div>
        <div className="order-2 mb-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="font-black text-gray-900 dark:text-white">Universal Notification + Reply Hub</h2>
              <p className="text-xs text-gray-500">Every notification has source agent, source item, thread ID, action type, allowed replies, and expiry.</p>
            </div>
            <span className="text-xs font-black uppercase text-primary">{universalNotifications.length} routed</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {universalNotifications.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No routed notifications yet.</p>
            ) : (
              universalNotifications.slice(0, 10).map((notification) => (
                <div key={notification.notificationId} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 dark:text-white truncate">[{notification.shortId}] {notification.title}</p>
                      <p className="text-xs text-gray-500 line-clamp-2">{notification.message}</p>
                    </div>
                    <span className={cn(
                      'shrink-0 px-2 py-1 rounded-full text-[10px] font-black uppercase',
                      notification.status.includes('approval')
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : notification.status === 'routed'
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    )}>
                      {notification.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
                    <span>Agent: {notification.sourceAgent}</span>
                    <span>Item: {notification.sourceItemId}</span>
                    <span>Thread: {notification.threadId}</span>
                    <span>Action: {notification.actionType}</span>
                    <span>Expires: {new Date(notification.expiresAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {notification.allowedReplies.map((reply) => (
                      <button
                        key={reply.code}
                        onClick={async () => {
                          const result = await invoke('route_inbound_reply', {
                            channel: 'app',
                            raw: `${notification.shortId} ${reply.code}`,
                          }) as RoutedReply
                          alert(result.message)
                          await loadChannels()
                        }}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-bold',
                          reply.requiresApproval
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                            : 'bg-primary/10 text-primary'
                        )}
                      >
                        {reply.code} = {reply.label}
                      </button>
                    ))}
                  </div>
                  {notification.replyHistory.length > 0 && (
                    <div className="mt-3 rounded-xl bg-light-muted/50 dark:bg-dark/40 p-3 space-y-1">
                      {notification.replyHistory.slice(0, 3).map((reply) => (
                        <p key={reply.id} className="text-xs text-gray-600 dark:text-gray-300">
                          {new Date(reply.at).toLocaleString()} - {reply.raw} - {reply.selectedAction}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="order-3 mb-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-lighter overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="font-black text-gray-900 dark:text-white">Legacy Channel Queue</h2>
              <p className="text-xs text-gray-500">Compatibility view for queued channel messages.</p>
            </div>
            <span className="text-xs font-black uppercase text-primary">{notifications.length} items</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No queued notifications yet.</p>
            ) : (
              notifications.slice(0, 8).map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleRespondNotification(notification)}
                  className="w-full text-left p-4 hover:bg-light-muted/50 dark:hover:bg-dark/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-gray-900 dark:text-white truncate">{notification.title}</p>
                    <span className={cn(
                      'shrink-0 px-2 py-1 rounded-full text-[10px] font-black uppercase',
                      notification.status === 'responded'
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    )}>
                      {notification.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 line-clamp-2">{notification.message}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
                    <span>Agent: {notification.agentId}</span>
                    <span>Channel: {notification.channel}</span>
                    {notification.requiresApproval && <span>Approval required before external send/action</span>}
                    {notification.response && <span className="text-primary">Response saved</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="order-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
          {channels.map((channel) => {
            const Icon = channelIcons[channel.kind] || MessageSquare
            const check = diagnostics[channel.id]
            const connected = Boolean(channel.enabled && check?.running)
            const installed = Boolean(check?.installed)
            const apiSetupChannel = apiSetupKinds.has(channel.kind)
            const statusLabel = !channel.enabled
              ? apiSetupChannel
                ? 'Available'
                : 'Disabled'
              : connected
                ? 'Connected'
                : installed
                  ? 'Installed'
                  : check?.status === 'setup_required' || apiSetupChannel
                    ? 'Setup needed'
                    : 'Missing'
            return (
            <div key={channel.id} className="card border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-2xl flex items-center justify-center',
                    connected
                      ? 'bg-green-500/10'
                      : installed
                        ? 'bg-amber-500/10'
                        : 'bg-gray-100 dark:bg-gray-800'
                  )}>
                    <Icon className={cn(
                      'w-5 h-5',
                      connected
                        ? 'text-green-600 dark:text-green-400'
                        : installed
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-gray-400'
                    )} />
                  </div>
                  <h3 className="font-black text-gray-900 dark:text-white">{channel.name}</h3>
                </div>
                {connected ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : installed ? (
                  <PlayCircle className="w-5 h-5 text-amber-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{channel.kind}</p>
                <span className={cn(
                  'px-2 py-1 rounded-full text-[10px] font-black uppercase',
                  connected
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : installed
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                )}>
                  {statusLabel}
                </span>
              </div>
              <div className="text-xs text-gray-500 space-y-1 mb-4">
                <p>Prefix: <strong>{channel.commandPrefix}</strong></p>
                <p>Rate Limit: <strong>{channel.rateLimitPerMinute}/min</strong></p>
                <p>Direction: <strong>{channel.inbound ? 'In' : ''}{channel.inbound && channel.outbound ? ' + ' : ''}{channel.outbound ? 'Out' : ''}</strong></p>
                {check && (
                  <>
                    <p>App: <strong>{check.running ? 'Running' : check.installed ? 'Installed, not running' : 'Not detected'}</strong></p>
                    {check.processNames.length > 0 && (
                      <p>Process: <strong>{check.processNames.join(', ')}</strong></p>
                    )}
                  </>
                )}
              </div>
              {check?.detail && (
                <p className="mb-4 text-xs text-gray-600 dark:text-gray-300 bg-light-muted/50 dark:bg-dark/40 rounded-xl p-3">
                  {check.detail}
                </p>
              )}
              {check?.detectedPaths?.length > 0 && (
                <details className="mb-4 text-xs text-gray-500">
                  <summary className="cursor-pointer font-bold">Detected paths</summary>
                  <div className="mt-2 space-y-1">
                    {check.detectedPaths.slice(0, 3).map((path) => (
                      <p key={path} className="truncate" title={path}>{path}</p>
                    ))}
                  </div>
                </details>
              )}
              <div className="flex gap-2">
                <button onClick={() => toggleEnabled(channel)} className="btn-secondary flex-1">
                  {channel.enabled ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => handleTest(channel.id)} className="btn-primary flex-1">
                  Test
                </button>
                <button onClick={() => handleDelete(channel.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )})}
        </div>
      </main>
    </div>
  )
}

