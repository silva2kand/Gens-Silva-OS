import { invoke } from '@tauri-apps/api/core'
import type { ToolCall, ViewType } from '@/types'
import { generateId } from '@/lib/utils'

type ToolResult = {
  handled: boolean
  directAnswer?: string
  context?: string
  tools: ToolCall[]
}

export type AssistantToolMode = 'browser' | 'files' | 'knowledge' | 'workspace' | 'terminal' | 'channels' | 'connectors'

const viewAliases: Array<{ view: ViewType; terms: string[] }> = [
  { view: 'home', terms: ['home', 'dashboard'] },
  { view: 'chat', terms: ['chat', 'conversation'] },
  { view: 'agents', terms: ['agents', 'agent'] },
  { view: 'workspace', terms: ['workspace', 'project files', 'projects'] },
  { view: 'computer', terms: ['computer', 'my computer', 'files', 'explorer', 'terminal', 'performance'] },
  { view: 'model-hub', terms: ['model hub', 'models', 'local models'] },
  { view: 'connectors', terms: ['connectors', 'tools'] },
  { view: 'integrations', terms: ['integrations'] },
  { view: 'channels', terms: ['channels'] },
  { view: 'scheduled-tasks', terms: ['scheduled tasks', 'tasks', 'automation'] },
  { view: 'skills', terms: ['skills'] },
  { view: 'knowledge', terms: ['knowledge', 'knowledge base'] },
  { view: 'settings', terms: ['settings'] },
  { view: 'appearance', terms: ['appearance', 'theme'] },
]

const agentRoutes = [
  {
    id: 'solicister',
    label: 'Solicister',
    terms: ['solicister', 'solicitor', 'legal', 'law', 'court', 'tribunal', 'visa', 'sponsor', 'sponsorship', 'immigration', 'contract', 'tenancy', 'dispute', 'claim', 'letter before action'],
  },
  {
    id: 'accountants',
    label: 'Accountants',
    terms: ['accountant', 'accounting', 'bookkeeping', 'receipt', 'invoice', 'vat', 'tax', 'hmrc', 'cashflow', 'cash flow', 'profit', 'loss', 'stripe', 'reconcile', 'margin'],
  },
  {
    id: 'hermes',
    label: 'Hermes',
    terms: ['hermes', 'email', 'inbox', 'outbox', 'sent', 'draft', 'flagged', 'pinned', 'favourite', 'favorite', 'reply', 'follow up'],
  },
  {
    id: 'spaceagent',
    label: 'SpaceAgent',
    terms: ['spaceagent', 'property', 'properties', 'undervalued', 'premises', 'shop', 'shops', 'business opportunity', 'income', 'earn money', 'make money', 'market research'],
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    terms: ['openclaw', 'code', 'coding', 'programming', 'debug', 'terminal', 'automate', 'automation', 'build', 'test'],
  },
  {
    id: 'paperclip',
    label: 'Paperclip',
    terms: ['paperclip', 'document', 'attachment', 'evidence', 'bundle', 'timeline', 'chronology', 'organise files', 'organize files'],
  },
]

const safeTerminalPrefixes = [
  'pwd',
  'dir',
  'ls',
  'echo',
  'whoami',
  'hostname',
  'git status',
  'git branch',
  'git log',
  'npm --version',
  'node --version',
  'cargo --version',
  'cargo check',
  'cargo test',
  'npm run build',
]

function completeTool(tool: ToolCall, result: unknown, status: ToolCall['status'] = 'completed'): ToolCall {
  return { ...tool, status, result }
}

function textArg(prompt: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = prompt.match(pattern)
    const value = match?.[1]?.trim()
    if (value) return value.replace(/^["']|["']$/g, '')
  }
  return ''
}

function urlFromPrompt(prompt: string) {
  const explicit = prompt.match(/https?:\/\/[^\s)]+/i)?.[0]
  if (explicit) return explicit
  const domain = prompt.match(/\b([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?/i)?.[0]
  return domain ? `https://${domain}` : ''
}

function wantsAppNavigation(prompt: string) {
  const lower = prompt.toLowerCase()
  if (!/\b(open|go to|navigate|show|switch to|take me to)\b/.test(lower)) return null
  return viewAliases.find(({ terms }) => terms.some((term) => lower.includes(term)))?.view || null
}

function routedAgent(prompt: string) {
  const lower = prompt.toLowerCase()
  const explicit = prompt.match(/\b(?:ask|run|use|call)\s+(hermes|paperclip|spaceagent|openclaw|solicister|accountants)\b/i)?.[1]?.toLowerCase()
  if (explicit) return agentRoutes.find((agent) => agent.id === explicit) || null

  return agentRoutes.find((agent) => agent.terms.some((term) => lower.includes(term))) || null
}

function isSafeTerminalCommand(command: string) {
  const normalized = command.trim().toLowerCase()
  if (!normalized) return false
  if (/[;&|><`]/.test(command)) return false
  return safeTerminalPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix} `))
}

function pathArg(prompt: string) {
  return textArg(prompt, [
    /(?:path|file|folder|directory)\s*:\s*["']([^"']+)["']/i,
    /(?:at|in|to)\s+["']([^"']+)["']/i,
    /([A-Za-z]:\\[^\n]+)$/i,
  ])
}

function summarize(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return text.length > 3500 ? `${text.slice(0, 3500)}\n...truncated...` : text
}

function wantsCompletionNotification(prompt: string) {
  return /\b(notify|message|whatsapp|tell)\s+(me|silva)\b/i.test(prompt)
    && /\b(when|once|after|finish|finished|done|complete|completed)\b/i.test(prompt)
}

function isNotificationOnly(prompt: string) {
  const lower = prompt.toLowerCase()
  if (wantsCompletionNotification(prompt)) return false
  if (!/\b(whatsapp|notify me|send notification|notification)\b/.test(lower)) return false
  return !/\b(organise|organize|analyse|analyze|search|find|research|read|check|scan|draft|prepare|email|property|properties|court|case|legal|account|bookkeep|build|code|fix)\b/.test(lower)
}

function wantsPropertyValuation(prompt: string) {
  return /\b(undervalued|under value|below market|bmv|property|properties|premises|shop|shops|commercial|lease|freehold|rightmove|zoopla)\b/i.test(prompt)
}

function wantsMailUpdates(prompt: string) {
  return /\b(mail|mails|email|emails|inbox|outbox|sent|drafts?|flagged|pinned|saved|favourites?|favorites?|outlook)\b/i.test(prompt)
    && /\b(update|updates|new|latest|check|read|scan|analyse|analyze|organise|organize|organizes|organise|sort|group|categorise|categorize|anything|all|what'?s|whats)\b/i.test(prompt)
}

export async function queueCompletionNotification(
  prompt: string,
  response: string,
  agentId = 'assistant'
) {
  if (!wantsCompletionNotification(prompt)) return null
  return invoke('create_channel_notification', {
    channel: 'whatsapp',
    agentId,
    title: 'Task finished',
    message: [
      'I finished the task you asked me to notify you about.',
      '',
      `Request: ${prompt}`,
      '',
      `Summary: ${response.slice(0, 900)}`,
    ].join('\n'),
    requiresApproval: false,
  })
}

export async function executeAssistantTools(
  prompt: string,
  setCurrentView: (view: ViewType) => void,
  enabledModes: Record<AssistantToolMode, boolean> = {
    browser: true,
    files: true,
    knowledge: true,
    workspace: true,
    terminal: true,
    channels: true,
    connectors: true,
  }
): Promise<ToolResult> {
  const lower = prompt.toLowerCase()
  const tools: ToolCall[] = []
  const context: string[] = []

  const runTool = async (
    name: string,
    args: Record<string, unknown>,
    action: () => Promise<unknown>
  ) => {
    const pending: ToolCall = {
      id: generateId(),
      name,
      arguments: args,
      status: 'running',
    }
    tools.push(pending)
    try {
      const result = await action()
      tools[tools.length - 1] = completeTool(pending, result)
      context.push(`${name} result:\n${summarize(result)}`)
      return result
    } catch (error) {
      const result = String(error)
      tools[tools.length - 1] = completeTool(pending, result, 'failed')
      context.push(`${name} failed:\n${result}`)
      return null
    }
  }

  const updateSubject = textArg(prompt, [
    /(?:updates?|update me|tell me the updates?)\s+(?:of|on|about|for)\s+(.+)$/i,
    /what(?:'s| is)\s+(?:the\s+)?latest\s+(?:on|about|for)\s+(.+)$/i,
  ])
  if (wantsMailUpdates(prompt)) {
    if (!enabledModes.connectors) {
      return { handled: true, directAnswer: 'Connector tools are off for this chat. Turn on Connectors so Hermes can read Classic Outlook local mail.', tools }
    }
    const result = await runTool('hermes.classic_outlook.email_intelligence', { perFolder: 75 }, async () => (
      invoke('run_hermes_email_intelligence', { perFolder: 75 })
    )) as { result?: string; status?: string; activities?: Array<{ message?: string }>; approvalsRequired?: string[] } | null
    const readActivity = result?.activities?.find((activity) => /Read \d+ email item/.test(activity.message || ''))?.message
    const approvals = result?.approvalsRequired?.length
      ? `\n\nApproval rules:\n${result.approvalsRequired.map((item) => `- ${item}`).join('\n')}`
      : ''
    return {
      handled: true,
      directAnswer: [
        'Sure Silva — I checked Classic Outlook and started organising the emails properly.',
        readActivity || '',
        '',
        'I grouped the work around people, properties, companies, finance, legal/council items, cases, replies needed, and follow-ups.',
        '',
        'I did not send, delete, archive, move, or label anything. Anything like that still needs your approval first.',
        '',
        summarize(result?.result || result || 'No Hermes result returned.'),
        approvals,
      ].filter(Boolean).join('\n'),
      context: context.join('\n\n'),
      tools,
    }
  }
  if (updateSubject) {
    const shell = await invoke('get_shell_info') as { cwd?: string }
    const basePath = shell.cwd || '.'
    if (enabledModes.files) {
      await runTool('file.search', { query: updateSubject, basePath }, async () => (
        invoke('search_files', { query: updateSubject, basePath })
      ))
    }
    if (enabledModes.connectors) {
      await runTool('email.search', { query: updateSubject }, async () => (
        invoke('search_emails', { query: updateSubject })
      ))
    }
    if (enabledModes.browser) {
      await runTool('web.search', { query: updateSubject }, async () => (
        invoke('web_search', { query: updateSubject })
      ))
    }
    return {
      handled: false,
      context: context.join('\n\n'),
      tools,
    }
  }

  const targetView = wantsAppNavigation(prompt)
  if (targetView) {
    await runTool('app.navigate', { view: targetView }, async () => {
      setCurrentView(targetView)
      return { ok: true, view: targetView }
    })
    return {
      handled: true,
      directAnswer: `Opened ${targetView.replace('-', ' ')}.`,
      context: context.join('\n\n'),
      tools,
    }
  }

  if (/\b(what can you do|tools|capabilities|use computer|use terminal|use web|automate)\b/.test(lower)) {
    return {
      handled: true,
      directAnswer: [
        'Desktop tools are enabled.',
        '',
        'I can navigate app tabs, open URLs, fetch and summarize web pages, run web search, list/search/read local files, create folders, write files after confirmation, and run terminal commands.',
        '',
        'Try:',
        '- open model hub',
        '- search web for local llama server docs',
        '- fetch https://example.com',
        '- list files',
        '- search files for "assistant-tools"',
        '- run command: git status',
        '- create folder "C:\\\\Temp\\\\gsos-test"',
      ].join('\n'),
      tools,
    }
  }

  if (isNotificationOnly(prompt)) {
    if (!enabledModes.channels) {
      return { handled: true, directAnswer: 'Channel tools are off for this chat. Turn on the Channels icon to queue WhatsApp notifications.', tools }
    }
    const title = textArg(prompt, [
      /(?:title|subject)\s*:\s*["']([^"']+)["']/i,
      /(?:notify me|send notification)(?:\s+on\s+whatsapp)?\s+(?:about|that)?\s+(.+?)(?:\.|$)/i,
    ]) || 'GSOS notification'
    const result = await runTool('channel.notification.queue', { channel: 'whatsapp', title }, async () => (
      invoke('create_channel_notification', {
        channel: 'whatsapp',
        agentId: routedAgent(prompt)?.id || 'assistant',
        title,
        message: prompt,
        requiresApproval: /\b(send|submit|reply|court|legal|visa|tax|hmrc|payment|post|publish)\b/i.test(prompt),
      })
    ))
    const notification = result as { id?: string; requiresApproval?: boolean } | null
    const shortId = notification?.id ? notification.id.slice(0, 8) : ''
    const approvalNote = notification?.requiresApproval
      ? 'I marked it for approval before anything gets sent or acted on outside the app.'
      : 'You can reply to it individually from the Channels notification queue.'
    return {
      handled: true,
      directAnswer: [
        'Yep, I queued that for WhatsApp.',
        shortId ? `Reference: ${shortId}.` : '',
        approvalNote,
      ].filter(Boolean).join('\n\n'),
      context: context.join('\n\n'),
      tools,
    }
  }

  const agent = routedAgent(prompt)
  if (agent && !/\b(open|show|go to|navigate)\b.*\b(agents|agent)\b/.test(lower)) {
    const gathered: string[] = []
    if (agent.id === 'spaceagent' && enabledModes.browser && wantsPropertyValuation(prompt)) {
      const searches = [
        `${prompt} property listing price images details`,
        `${prompt} sold prices comparable properties land registry`,
        `${prompt} rental yield area commercial premises shop`,
      ]
      for (const query of searches) {
        const results = await runTool('property.web.search', { query }, async () => (
          invoke('web_search', { query })
        )) as Array<{ title?: string; url?: string }> | null
        if (Array.isArray(results)) {
          gathered.push(`Search: ${query}\n${summarize(results)}`)
          for (const item of results.slice(0, 2)) {
            if (!item.url) continue
            const page = await runTool('property.page.fetch', { url: item.url }, async () => (
              invoke('fetch_url', { url: item.url })
            ))
            if (page) gathered.push(`Fetched property/evidence page:\n${summarize(page)}`)
          }
        }
      }
    }

    const enrichedAgentInput = gathered.length > 0
      ? [
        prompt,
        'Accuracy rule: never invent invoice amounts, rent amounts, due dates, legal facts, payment status, attachment contents, or source details. Use "not found in available source" unless it was extracted from an email body, attachment, file, or cited webpage.',
        'Use the gathered property evidence below. Do not call something undervalued just because an advert says reduced. Estimate value by comparing listing price against sold prices/comps, rental yield, condition/refurb risk, lease/freehold, area demand, business potential, and evidence confidence. Include clickable URLs and image URLs where available. Rank opportunities as strong/possible/weak and say what data is missing before any viewing or offer.',
        gathered.join('\n\n'),
      ].join('\n\n')
      : [
        prompt,
        'Accuracy rule: never invent invoice amounts, rent amounts, due dates, legal facts, payment status, attachment contents, or source details. Use "not found in available source" unless it was extracted from an email body, attachment, file, or cited webpage. If the user asks for email details, use Hermes/Outlook evidence and say what must be opened or extracted next.',
      ].join('\n\n')

    const result = await runTool(`agent.${agent.id}`, { input: prompt }, async () => (
      invoke('run_agent_task', { agentId: agent.id, goal: enrichedAgentInput })
    ))
    const taskResult = result as { result?: string; status?: string } | null
    return {
      handled: true,
      directAnswer: `${agent.label}:\n\n${summarize(taskResult?.result || result)}`,
      context: context.join('\n\n'),
      tools,
    }
  }

  const url = urlFromPrompt(prompt)
  if (url && /\b(fetch|read|summarize|scrape|page text)\b/.test(lower)) {
    if (!enabledModes.browser) {
      return { handled: true, directAnswer: 'Browser/web tools are off for this chat. Turn on the Browser icon to fetch web pages.', tools }
    }
    const result = await runTool('web.fetch', { url }, async () => (
      invoke('fetch_url', { url })
    ))
    return {
      handled: true,
      directAnswer: `Fetched page:\n\n${summarize(result)}`,
      context: context.join('\n\n'),
      tools,
    }
  }

  if (/\b(search web|web search|google|look up|find online)\b/.test(lower)) {
    if (!enabledModes.browser) {
      return { handled: true, directAnswer: 'Browser/web tools are off for this chat. Turn on the Browser icon to search the web.', tools }
    }
    const query = textArg(prompt, [
      /(?:search web|web search|google|look up|find online)(?:\s+for)?\s+(.+)$/i,
    ]) || prompt
    const result = await runTool('web.search', { query }, async () => (
      invoke('web_search', { query })
    ))
    return {
      handled: true,
      directAnswer: `Web search results:\n\n${summarize(result)}`,
      context: context.join('\n\n'),
      tools,
    }
  }

  if (url && /\b(open|go to|navigate|browse|web|website|url)\b/.test(lower)) {
    if (!enabledModes.browser) {
      return { handled: true, directAnswer: 'Browser/web tools are off for this chat. Turn on the Browser icon to open URLs.', tools }
    }
    await runTool('browser.navigate', { url }, async () => {
      await invoke('navigate', { url })
      return { ok: true, url }
    })
    return {
      handled: true,
      directAnswer: `Opened ${url}.`,
      context: context.join('\n\n'),
      tools,
    }
  }

  const command = textArg(prompt, [
    /(?:run|execute)\s+(?:terminal\s+)?command\s*:?\s*(.+)$/i,
    /terminal\s*:?\s*(.+)$/i,
    /shell\s*:?\s*(.+)$/i,
  ])
  if (command) {
    if (!enabledModes.terminal) {
      return { handled: true, directAnswer: 'Terminal tools are off for this chat. Turn on the Terminal mode to run commands.', tools }
    }
    const cwd = textArg(prompt, [
      /\s+in\s+["']([^"']+)["']\s*$/i,
      /\s+cwd\s*:\s*["']([^"']+)["']/i,
    ])
    const cleanCommand = cwd ? command.replace(/\s+in\s+["'][^"']+["']\s*$/i, '').trim() : command
    if (!isSafeTerminalCommand(cleanCommand)) {
      const ok = window.confirm(
        `This will run a terminal command on your computer:\n\n${cleanCommand}\n\nRun it now?`
      )
      if (!ok) {
        return {
          handled: true,
          directAnswer: 'Terminal command cancelled.',
          tools,
        }
      }
    }

    const result = await runTool('terminal.execute', { command: cleanCommand, cwd: cwd || undefined }, async () => (
      cwd
        ? invoke('execute_command_in_directory', { command: cleanCommand, cwd })
        : invoke('execute_command', { command: cleanCommand })
    ))
    return {
      handled: true,
      directAnswer: `Terminal result:\n\n${summarize(result)}`,
      context: context.join('\n\n'),
      tools,
    }
  }

  const writePath = textArg(prompt, [
    /write\s+(?:file\s*)?["']([^"']+)["']/i,
    /create\s+(?:file\s*)?["']([^"']+)["']/i,
  ])
  if (writePath && /\b(content|with|containing)\b/i.test(prompt)) {
    if (!enabledModes.files) {
      return { handled: true, directAnswer: 'File tools are off for this chat. Turn on the Files icon to write files.', tools }
    }
    const content = textArg(prompt, [
      /(?:content|with|containing)\s*:\s*```([\s\S]+?)```/i,
      /(?:content|with|containing)\s*:\s*["']([^"']+)["']/i,
      /(?:content|with|containing)\s+(.+)$/i,
    ])
    const ok = window.confirm(
      `This will write a local file:\n\n${writePath}\n\nProceed?`
    )
    if (!ok) {
      return { handled: true, directAnswer: 'File write cancelled.', tools }
    }
    const result = await runTool('file.write', { path: writePath, contentLength: content.length }, async () => (
      invoke('write_file', { path: writePath, content })
    ))
    return {
      handled: true,
      directAnswer: `File write result:\n\n${summarize(result ?? { ok: true })}`,
      context: context.join('\n\n'),
      tools,
    }
  }

  const createFolder = textArg(prompt, [
    /create\s+folder\s+["']([^"']+)["']/i,
    /make\s+directory\s+["']([^"']+)["']/i,
    /mkdir\s+["']([^"']+)["']/i,
  ])
  if (createFolder) {
    if (!enabledModes.files && !enabledModes.workspace) {
      return { handled: true, directAnswer: 'File/workspace tools are off for this chat. Turn on Files or Workspace to create folders.', tools }
    }
    const result = await runTool('file.create_directory', { path: createFolder }, async () => (
      invoke('create_directory', { path: createFolder })
    ))
    return {
      handled: true,
      directAnswer: `Created directory:\n\n${createFolder}\n\n${summarize(result ?? { ok: true })}`,
      context: context.join('\n\n'),
      tools,
    }
  }

  const deleteTarget = textArg(prompt, [
    /delete\s+(?:file|folder|path)\s+["']([^"']+)["']/i,
    /remove\s+(?:file|folder|path)\s+["']([^"']+)["']/i,
  ])
  if (deleteTarget) {
    if (!enabledModes.files) {
      return { handled: true, directAnswer: 'File tools are off for this chat. Turn on the Files icon to delete paths.', tools }
    }
    const ok = window.confirm(
      `This will permanently delete a local path:\n\n${deleteTarget}\n\nDelete it now?`
    )
    if (!ok) {
      return { handled: true, directAnswer: 'Delete cancelled.', tools }
    }
    const result = await runTool('file.delete', { path: deleteTarget }, async () => (
      invoke('delete_path', { path: deleteTarget })
    ))
    return {
      handled: true,
      directAnswer: `Delete result:\n\n${summarize(result ?? { ok: true })}`,
      context: context.join('\n\n'),
      tools,
    }
  }

  const readPath = textArg(prompt, [
    /read\s+(?:file\s*)?["']([^"']+)["']/i,
    /open\s+(?:file\s*)?["']([^"']+)["']/i,
    /read\s+file\s+(.+)$/i,
  ])
  if (readPath) {
    if (!enabledModes.files) {
      return { handled: true, directAnswer: 'File tools are off for this chat. Turn on the Files icon to read local files.', tools }
    }
    const result = await runTool('file.read', { path: readPath }, async () => (
      invoke('read_file', { path: readPath })
    ))
    return {
      handled: true,
      directAnswer: `File content:\n\n${summarize(result)}`,
      context: context.join('\n\n'),
      tools,
    }
  }

  const searchQuery = textArg(prompt, [
    /search\s+(?:files\s+)?(?:for\s+)?["']([^"']+)["']/i,
    /find\s+(?:file\s+)?["']([^"']+)["']/i,
    /search\s+files\s+for\s+(.+)$/i,
  ])
  if (searchQuery) {
    if (!enabledModes.files) {
      return { handled: true, directAnswer: 'File tools are off for this chat. Turn on the Files icon to search local files.', tools }
    }
    const shell = await invoke('get_shell_info') as { cwd?: string }
    const basePath = shell.cwd || '.'
    const result = await runTool('file.search', { query: searchQuery, basePath }, async () => (
      invoke('search_files', { query: searchQuery, basePath })
    ))
    return {
      handled: true,
      directAnswer: `Search results:\n\n${summarize(result)}`,
      context: context.join('\n\n'),
      tools,
    }
  }

  if (/\b(list|show)\b.*\b(files|folder|directory)\b/.test(lower)) {
    if (!enabledModes.files && !enabledModes.workspace) {
      return { handled: true, directAnswer: 'File/workspace tools are off for this chat. Turn on Files or Workspace to list directories.', tools }
    }
    const path = pathArg(prompt) || textArg(prompt, [
      /(?:in|at|directory|folder)\s+["']([^"']+)["']/i,
      /(?:in|at|directory|folder)\s+([A-Za-z]:\\.+)$/i,
    ])
    const shell = await invoke('get_shell_info') as { cwd?: string }
    const targetPath = path || shell.cwd || '.'
    const result = await runTool('file.list_directory', { path: targetPath }, async () => (
      invoke('list_directory', { path: targetPath })
    ))
    return {
      handled: true,
      directAnswer: `Directory listing:\n\n${summarize(result)}`,
      context: context.join('\n\n'),
      tools,
    }
  }

  if (/\b(click|type|screenshot)\b.*\b(browser|web|page|selector)\b/.test(lower)) {
    if (!enabledModes.browser) {
      return { handled: true, directAnswer: 'Browser tools are off for this chat. Turn on the Browser icon to use browser actions.', tools }
    }
    const action = lower.includes('screenshot') ? 'browser.screenshot' : lower.includes('type') ? 'browser.type' : 'browser.click'
    await runTool(action, { prompt }, async () => {
      if (action === 'browser.screenshot') return invoke('take_screenshot')
      if (action === 'browser.click') return invoke('click_element', { selector: textArg(prompt, [/selector\s+["']([^"']+)["']/i]) || 'unknown' })
      return invoke('type_text', {
        selector: textArg(prompt, [/selector\s+["']([^"']+)["']/i]) || 'unknown',
        text: textArg(prompt, [/type\s+["']([^"']+)["']/i]) || '',
      })
    })
    return {
      handled: true,
      directAnswer: `${action} attempted.\n\n${context.join('\n\n')}`,
      context: context.join('\n\n'),
      tools,
    }
  }

  return {
    handled: false,
    context: '',
    tools,
  }
}
