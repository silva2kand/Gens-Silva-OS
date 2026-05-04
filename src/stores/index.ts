import { create } from 'zustand';
import type {
  User,
  ChatMessage,
  ToolCall,
  Agent,
  Connector,
  Model,
  Workspace,
  Settings,
  ViewType,
  SystemInfo,
  ScheduledTask
} from '@/types';

// App Store - Main application state
interface AppState {
  currentView: ViewType;
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark' | 'system';
  isLoading: boolean;
  setCurrentView: (view: ViewType) => void;
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'home',
  sidebarCollapsed: localStorage.getItem('gsos.sidebarCollapsed') === 'true',
  theme: (localStorage.getItem('gsos.theme') as AppState['theme']) || 'dark',
  isLoading: false,
  setCurrentView: (view) => set({ currentView: view }),
  toggleSidebar: () => set((state) => {
    const sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem('gsos.sidebarCollapsed', String(sidebarCollapsed));
    return { sidebarCollapsed };
  }),
  setTheme: (theme) => {
    localStorage.setItem('gsos.theme', theme);
    set({ theme });
  },
  setLoading: (loading) => set({ isLoading: loading }),
}));

// Chat Store - Chat messages and conversation
interface ChatState {
  messages: ChatMessage[];
  activeModel: string;
  isStreaming: boolean;
  composerText: string;
  currentTaskTools: ToolCall[];
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  deleteMessage: (id: string) => void;
  clearMessages: () => void;
  setActiveModel: (model: string) => void;
  setStreaming: (streaming: boolean) => void;
  setComposerText: (text: string) => void;
  setCurrentTaskTools: (tools: ToolCall[]) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  activeModel: '',
  isStreaming: false,
  composerText: '',
  currentTaskTools: [],
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map((message) => (
      message.id === id ? { ...message, ...updates } : message
    )),
  })),
  deleteMessage: (id) => set((state) => ({
    messages: state.messages.filter((message) => message.id !== id),
  })),
  clearMessages: () => set({ messages: [] }),
  setActiveModel: (model) => set({ activeModel: model }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setComposerText: (text) => set({ composerText: text }),
  setCurrentTaskTools: (tools) => set({ currentTaskTools: tools }),
}));

// Agents Store - Agent management
interface AgentsState {
  agents: Agent[];
  activeAgent: string | null;
  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  deleteAgent: (id: string) => void;
  setActiveAgent: (id: string | null) => void;
}

export const useAgentsStore = create<AgentsState>((set) => ({
  agents: [
    {
      id: 'hermes',
      name: 'Hermes',
      description: 'Communications command centre for inbox, outbox, drafts, follow-ups, pinned, flagged, saved, and favourites.',
      icon: 'code-2',
      color: '#8B5CF6',
      instructions: 'You are Hermes, Silva communications operator. Review connected emails/channels when configured, organise inbox/outbox/sent/drafts/pinned/starred/flagged/saved/favourites, produce updates by person/address/company/property/case/project, draft replies, maintain follow-ups, queue WhatsApp notifications with individual response IDs, and never send without explicit confirmation.',
      tools: ['search_emails', 'send_email', 'channels', 'create_channel_notification', 'list_channel_notifications', 'scheduled_tasks', 'file_system', 'web_search'],
      isActive: true,
      isSystem: true,
      memory: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'paperclip',
      name: 'Paperclip',
      description: 'Evidence and document organiser for files, attachments, bundles, timelines, OCR-style extraction, and knowledge filing.',
      icon: 'files',
      color: '#10B981',
      instructions: 'You are Paperclip, Silva document, evidence, and knowledge manager. Classify, summarise, index, timeline, bundle, and cross-reference emails, attachments, receipts, statements, contracts, tenancy/property records, visa/sponsor evidence, and court packs. Track source, date, confidence, missing evidence, and next action.',
      tools: ['file_system', 'knowledge', 'fetch_url', 'search_files'],
      isActive: true,
      isSystem: true,
      memory: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'spaceagent',
      name: 'SpaceAgent',
      description: 'Research and opportunity scout for properties, shops, premises, markets, income ideas, and strategy.',
      icon: 'cloud',
      color: '#3B82F6',
      instructions: 'You are SpaceAgent, Silva research strategist. Find and compare undervalued properties, shops, premises, business opportunities, lawful funding/loans, income streams, grants, suppliers, competitors, and local market signals. Use web research, cite URLs, include images/details when available, rank options, show assumptions, risks, ROI hypotheses, and next actions.',
      tools: ['web_search', 'fetch_url', 'browser', 'file_system'],
      isActive: true,
      isSystem: true,
      memory: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'openclaw',
      name: 'OpenClaw',
      description: 'Automation and coding operator for terminal, browser/web actions, local tools, app control, and implementation.',
      icon: 'shield',
      color: '#EF4444',
      instructions: 'You are OpenClaw, Silva technical operator. Build, debug, code, test, automate, navigate the app, use terminal commands, inspect files, fetch web pages, and operate local AI/runtime tools. Confirm before destructive actions, sensitive transmission, installs, credentials, or risky commands.',
      tools: ['browser', 'terminal', 'file_system', 'web_search', 'fetch_url'],
      isActive: true,
      isSystem: true,
      memory: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'solicister',
      name: 'Solicister',
      description: 'UK legal workbench for self-representation support, evidence packs, drafts, visa/sponsor prep, and solicitor-check bundles.',
      icon: 'scale',
      color: '#F59E0B',
      instructions: 'You are Solicister, Silva UK-focused legal workbench for self-representation support. Prepare issue analysis, law/process research, evidence lists, chronologies, letters before action, complaints, civil case response/claim prep notes, court/tribunal prep notes, contract comments, tenancy/property dispute packs, visa/sponsor evidence checklists, and questions for a human solicitor. Remember name history: current Silva Kandasamy, previous Shiva Kandasamy and Siyanthank Kandasamy. You are not a regulated solicitor; flag reserved, urgent, high-value, immigration, criminal, injunction, deadline, or serious court matters for regulated UK solicitor/OISC review before submission. Never submit legal/court/visa communications without explicit approval.',
      tools: ['file_system', 'search_emails', 'web_search', 'fetch_url', 'knowledge'],
      isActive: true,
      isSystem: true,
      memory: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'accountants',
      name: 'Accountants',
      description: 'UK finance and bookkeeping workbench for receipts, cashflow, VAT/tax prep, reconciliations, and property/shop analysis.',
      icon: 'calculator',
      color: '#06B6D4',
      instructions: 'You are Accountants, Silva UK finance and bookkeeping workbench for Newton Newsagent, Silva Retail Ltd, properties/premises, and personal/business admin. Organise receipts, invoices, email evidence, Stripe data, bank-style records, cashflow, margins, VAT/tax prep, deadlines, reconciliations, affordability checks, property/shop ROI, and accountant handoff packs. You are not a chartered accountant; flag assumptions, missing records, and professional review points.',
      tools: ['stripe', 'search_emails', 'file_system', 'web_search', 'fetch_url'],
      isActive: true,
      isSystem: true,
      memory: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  activeAgent: null,
  setAgents: (agents) => set({ agents }),
  addAgent: (agent) => set((state) => ({ agents: [...state.agents, agent] })),
  updateAgent: (id, updates) => set((state) => ({
    agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates, updatedAt: new Date() } : a)),
  })),
  deleteAgent: (id) => set((state) => ({
    agents: state.agents.filter((a) => (a.id !== id || a.isSystem)),
  })),
  setActiveAgent: (id) => set({ activeAgent: id }),
}));

// Connectors Store - Integration management
interface ConnectorsState {
  connectors: Connector[];
  addConnector: (connector: Connector) => void;
  updateConnectorStatus: (id: string, status: Connector['status']) => void;
  toggleConnector: (id: string) => void;
}

const loadConnectorOverrides = (): Record<string, Partial<Connector>> => {
  try {
    return JSON.parse(localStorage.getItem('gsos.connectors') || '{}');
  } catch {
    return {};
  }
};

const saveConnectorOverrides = (connectors: Connector[]) => {
  localStorage.setItem('gsos.connectors', JSON.stringify(Object.fromEntries(
    connectors.map((connector) => [
      connector.id,
      {
        status: connector.status,
        isEnabled: connector.isEnabled,
        config: connector.config,
      },
    ])
  )));
};

const mergeConnectorOverrides = (connectors: Connector[]) => {
  const overrides = loadConnectorOverrides();
  return connectors.map((connector) => ({ ...connector, ...overrides[connector.id] }));
};

export const useConnectorsStore = create<ConnectorsState>((set) => ({
  connectors: mergeConnectorOverrides([
    // Social Media & Content
    { id: 'instagram', name: 'Instagram', description: 'Posts, Stories, Reels, Ads', icon: 'instagram', category: 'social', status: 'disconnected', config: {}, tools: ['post_instagram', 'get_instagram_analytics'], authType: 'oauth', isEnabled: false },
    { id: 'meta-ads', name: 'Meta Ads Manager', description: 'Facebook & Instagram Ads', icon: 'megaphone', category: 'social', status: 'disconnected', config: {}, tools: ['create_ad', 'get_ad_metrics'], authType: 'oauth', isEnabled: false },
    { id: 'canva', name: 'Canva', description: 'Design & creative assets', icon: 'palette', category: 'social', status: 'disconnected', config: {}, tools: ['create_design', 'get_templates'], authType: 'oauth', isEnabled: false },
    { id: 'webflow', name: 'Webflow', description: 'Website building', icon: 'globe', category: 'social', status: 'disconnected', config: {}, tools: ['publish_content', 'manage_sites'], authType: 'oauth', isEnabled: false },
    { id: 'webflow-cms', name: 'Webflow CMS', description: 'CMS collections, items, and publishing workflows', icon: 'globe', category: 'social', status: 'disconnected', config: {}, tools: ['list_collections', 'create_cms_item', 'publish_site'], authType: 'oauth', isEnabled: false },
    { id: 'heygen', name: 'HeyGen', description: 'AI avatars & video', icon: 'video', category: 'ai', status: 'disconnected', config: {}, tools: ['generate_avatar', 'create_video'], authType: 'api_key', isEnabled: false },

    // Email & Calendar
    { id: 'gmail', name: 'Gmail', description: 'Email & contacts', icon: 'mail', category: 'email', status: 'disconnected', config: {}, tools: ['send_email', 'search_emails', 'manage_labels'], authType: 'oauth', isEnabled: false },
    { id: 'google-calendar', name: 'Google Calendar', description: 'Events & scheduling', icon: 'calendar', category: 'calendar', status: 'disconnected', config: {}, tools: ['create_event', 'get_events', 'update_event'], authType: 'oauth', isEnabled: false },
    { id: 'google-drive', name: 'Google Drive', description: 'Files & documents', icon: 'hard-drive', category: 'storage', status: 'disconnected', config: {}, tools: ['upload_file', 'list_files', 'share_file'], authType: 'oauth', isEnabled: false },
    { id: 'google-docs', name: 'Google Docs', description: 'Docs drafting, reading, and editing workflows', icon: 'file-text', category: 'storage', status: 'disconnected', config: {}, tools: ['read_doc', 'create_doc', 'update_doc'], authType: 'oauth', isEnabled: false },
    { id: 'google-sheets', name: 'Google Sheets', description: 'Spreadsheets, tables, formulas, and analysis', icon: 'table', category: 'storage', status: 'disconnected', config: {}, tools: ['read_sheet', 'update_sheet', 'create_chart'], authType: 'oauth', isEnabled: false },
    { id: 'dropbox', name: 'Dropbox', description: 'Cloud file storage and sharing', icon: 'hard-drive', category: 'storage', status: 'disconnected', config: {}, tools: ['list_files', 'upload_file', 'share_file'], authType: 'oauth', isEnabled: false },
    { id: 'onedrive', name: 'OneDrive', description: 'Microsoft cloud files and sharing', icon: 'hard-drive', category: 'storage', status: 'disconnected', config: {}, tools: ['list_files', 'upload_file', 'share_file'], authType: 'oauth', isEnabled: false },
    { id: 'outlook', name: 'Outlook', description: 'Microsoft email', icon: 'mail', category: 'email', status: 'disconnected', config: {}, tools: ['send_email', 'get_emails'], authType: 'oauth', isEnabled: false },

    // Development
    { id: 'github', name: 'GitHub', description: 'Code repositories', icon: 'github', category: 'development', status: 'disconnected', config: {}, tools: ['create_issue', 'push_code', 'create_pr'], authType: 'oauth', isEnabled: false },
    { id: 'vercel', name: 'Vercel', description: 'Deployments', icon: 'triangle', category: 'development', status: 'disconnected', config: {}, tools: ['deploy', 'get_deployments', 'rollback'], authType: 'api_key', isEnabled: false },
    { id: 'supabase', name: 'Supabase', description: 'Database & auth', icon: 'database', category: 'database', status: 'disconnected', config: {}, tools: ['query_db', 'manage_auth'], authType: 'api_key', isEnabled: false },
    { id: 'neon', name: 'Neon', description: 'Serverless Postgres', icon: 'database', category: 'database', status: 'disconnected', config: {}, tools: ['query_db', 'manage_branches'], authType: 'api_key', isEnabled: false },
    { id: 'prisma', name: 'Prisma', description: 'Database ORM', icon: 'box', category: 'database', status: 'disconnected', config: {}, tools: ['migrate', 'generate_client'], authType: 'none', isEnabled: false },
    { id: 'sentry', name: 'Sentry', description: 'Error monitoring', icon: 'bug', category: 'development', status: 'disconnected', config: {}, tools: ['get_errors', 'track_event'], authType: 'api_key', isEnabled: false },
    { id: 'cloudflare', name: 'Cloudflare', description: 'CDN & security', icon: 'cloud', category: 'development', status: 'disconnected', config: {}, tools: ['purge_cache', 'get_stats', 'manage_dns'], authType: 'api_key', isEnabled: false },
    { id: 'huggingface', name: 'Hugging Face', description: 'AI models & datasets', icon: 'brain', category: 'ai', status: 'disconnected', config: {}, tools: ['download_model', 'search_models'], authType: 'api_key', isEnabled: false },

    // CRM & Business
    { id: 'hubspot', name: 'HubSpot', description: 'CRM & marketing', icon: 'users', category: 'crm', status: 'disconnected', config: {}, tools: ['manage_contacts', 'create_deal'], authType: 'api_key', isEnabled: false },
    { id: 'stripe', name: 'Stripe', description: 'Payments', icon: 'credit-card', category: 'crm', status: 'disconnected', config: {}, tools: ['get_transactions', 'create_invoice'], authType: 'api_key', isEnabled: false },
    { id: 'close-crm', name: 'Close CRM', description: 'Sales CRM', icon: 'phone', category: 'crm', status: 'disconnected', config: {}, tools: ['manage_leads', 'log_calls'], authType: 'api_key', isEnabled: false },
    { id: 'zoominfo', name: 'ZoomInfo', description: 'Company/contact intelligence and prospect research', icon: 'users', category: 'crm', status: 'disconnected', config: {}, tools: ['search_companies', 'search_contacts'], authType: 'api_key', isEnabled: false },
    { id: 'explorium', name: 'Explorium', description: 'External data enrichment and market signals', icon: 'database', category: 'crm', status: 'disconnected', config: {}, tools: ['enrich_company', 'find_signals'], authType: 'api_key', isEnabled: false },
    { id: 'pophive', name: 'PopHIVE', description: 'Local business and retail opportunity signals', icon: 'target', category: 'crm', status: 'disconnected', config: {}, tools: ['find_opportunities', 'analyze_area'], authType: 'api_key', isEnabled: false },

    // Project Management
    { id: 'asana', name: 'Asana', description: 'Task management', icon: 'check-square', category: 'automation', status: 'disconnected', config: {}, tools: ['create_task', 'get_tasks'], authType: 'oauth', isEnabled: false },
    { id: 'monday', name: 'Monday.com', description: 'Work management', icon: 'layout', category: 'automation', status: 'disconnected', config: {}, tools: ['create_item', 'get_board'], authType: 'api_key', isEnabled: false },
    { id: 'linear', name: 'Linear', description: 'Issue tracking', icon: 'git-branch', category: 'automation', status: 'disconnected', config: {}, tools: ['create_issue', 'get_issues'], authType: 'api_key', isEnabled: false },
    { id: 'jira', name: 'Jira', description: 'Atlassian project tracking', icon: 'box', category: 'automation', status: 'disconnected', config: {}, tools: ['create_ticket', 'get_sprints'], authType: 'oauth', isEnabled: false },
    { id: 'clickup', name: 'ClickUp', description: 'Productivity platform', icon: 'target', category: 'automation', status: 'disconnected', config: {}, tools: ['create_task', 'get_spaces'], authType: 'api_key', isEnabled: false },
    { id: 'notion', name: 'Notion', description: 'Notes & docs', icon: 'file-text', category: 'storage', status: 'disconnected', config: {}, tools: ['create_page', 'query_database'], authType: 'oauth', isEnabled: false },

    // Automation
    { id: 'zapier', name: 'Zapier', description: 'Workflow automation', icon: 'zap', category: 'automation', status: 'disconnected', config: {}, tools: ['trigger_zap', 'create_zap'], authType: 'api_key', isEnabled: false },
    { id: 'make', name: 'Make', description: 'Scenario automation', icon: 'git-merge', category: 'automation', status: 'disconnected', config: {}, tools: ['run_scenario', 'get_scenarios'], authType: 'api_key', isEnabled: false },
    { id: 'dify', name: 'Dify', description: 'LLMOps platform', icon: 'workflow', category: 'automation', status: 'disconnected', config: {}, tools: ['create_app', 'deploy_workflow'], authType: 'api_key', isEnabled: false },
    { id: 'firecrawl', name: 'Firecrawl', description: 'Web scraping', icon: 'globe', category: 'browser', status: 'disconnected', config: {}, tools: ['scrape_url', 'crawl_site'], authType: 'api_key', isEnabled: false },
    { id: 'jotform', name: 'Jotform', description: 'Forms, submissions, and document collection', icon: 'file-text', category: 'automation', status: 'disconnected', config: {}, tools: ['list_forms', 'get_submissions', 'create_form'], authType: 'api_key', isEnabled: false },
    { id: 'posthog', name: 'PostHog', description: 'Product analytics, events, and funnels', icon: 'activity', category: 'automation', status: 'disconnected', config: {}, tools: ['query_events', 'get_funnels', 'capture_event'], authType: 'api_key', isEnabled: false },
    { id: 'webhook-listener', name: 'Webhook Listener', description: 'Inbound HTTP events and automation triggers', icon: 'webhook', category: 'automation', status: 'disconnected', config: {}, tools: ['receive_webhook', 'route_event', 'verify_signature'], authType: 'api_key', isEnabled: false },

    // Communication
    { id: 'slack', name: 'Slack', description: 'Team messaging', icon: 'message-square', category: 'automation', status: 'disconnected', config: {}, tools: ['send_message', 'create_channel'], authType: 'oauth', isEnabled: false },
    { id: 'discord', name: 'Discord', description: 'Bot messages, channels, and inbound events', icon: 'message-circle', category: 'automation', status: 'disconnected', config: {}, tools: ['send_message', 'listen_events', 'manage_channels'], authType: 'api_key', isEnabled: false },
    { id: 'telegram', name: 'Telegram', description: 'Bot messages and command replies', icon: 'send', category: 'automation', status: 'disconnected', config: {}, tools: ['send_message', 'listen_updates', 'answer_callback'], authType: 'api_key', isEnabled: false },
    { id: 'twilio-sms', name: 'Twilio SMS', description: 'SMS notifications and replies', icon: 'phone', category: 'automation', status: 'disconnected', config: {}, tools: ['send_sms', 'receive_sms', 'verify_phone'], authType: 'api_key', isEnabled: false },
    { id: 'whatsapp-desktop', name: 'WhatsApp Desktop', description: 'Desktop WhatsApp notification and reply bridge', icon: 'message-circle', category: 'automation', status: 'disconnected', config: {}, tools: ['queue_notification', 'save_reply', 'desktop_bridge'], authType: 'none', isEnabled: false },
    { id: 'line', name: 'LINE', description: 'Messaging platform', icon: 'message-circle', category: 'automation', status: 'disconnected', config: {}, tools: ['send_message', 'broadcast'], authType: 'api_key', isEnabled: false },
    { id: 'intercom', name: 'Intercom', description: 'Customer messaging', icon: 'message-square', category: 'crm', status: 'disconnected', config: {}, tools: ['send_message', 'get_conversations'], authType: 'api_key', isEnabled: false },

    // AI & Media
    { id: 'hume', name: 'Hume', description: 'Expressive TTS', icon: 'volume-2', category: 'ai', status: 'disconnected', config: {}, tools: ['generate_speech', 'analyze_voice'], authType: 'api_key', isEnabled: false },
    { id: 'minimax', name: 'MiniMax', description: 'Speech, music, images, video', icon: 'sparkles', category: 'ai', status: 'disconnected', config: {}, tools: ['generate_image', 'generate_video', 'text_to_speech'], authType: 'api_key', isEnabled: false },
    { id: 'anthropic', name: 'Anthropic Claude', description: 'Claude models through Anthropic API', icon: 'brain', category: 'ai', status: 'disconnected', config: {}, tools: ['chat_completion', 'analyze_document'], authType: 'api_key', isEnabled: false },
    { id: 'granola', name: 'Granola', description: 'Meeting notes and summaries', icon: 'mic', category: 'ai', status: 'disconnected', config: {}, tools: ['import_notes', 'summarize_meeting'], authType: 'oauth', isEnabled: false },
    { id: 'fireflies', name: 'Fireflies', description: 'Meeting transcripts and action items', icon: 'mic', category: 'ai', status: 'disconnected', config: {}, tools: ['get_transcripts', 'extract_actions'], authType: 'oauth', isEnabled: false },
    { id: 'tldv', name: 'tl;dv', description: 'Meeting recordings, transcripts, and clips', icon: 'video', category: 'ai', status: 'disconnected', config: {}, tools: ['get_recordings', 'summarize_call'], authType: 'oauth', isEnabled: false },

    // Browser
    { id: 'my-browser', name: 'My Browser', description: 'AI-controlled browsing', icon: 'globe', category: 'browser', status: 'disconnected', config: {}, tools: ['navigate', 'click', 'type', 'screenshot'], authType: 'none', isEnabled: false },
  ]),
  addConnector: (connector) => set((state) => {
    const connectors = state.connectors.some((item) => item.id === connector.id)
      ? state.connectors
      : [...state.connectors, connector];
    saveConnectorOverrides(connectors);
    return { connectors };
  }),
  updateConnectorStatus: (id, status) => set((state) => {
    const connectors = state.connectors.map((c) => (c.id === id ? { ...c, status } : c));
    saveConnectorOverrides(connectors);
    return { connectors };
  }),
  toggleConnector: (id) => set((state) => {
    const connectors = state.connectors.map((c) => (
      c.id === id
        ? {
            ...c,
            isEnabled: !c.isEnabled,
            status: c.authType === 'none' && !c.isEnabled ? 'connected' as const : 'disconnected' as const,
          }
        : c
    ));
    saveConnectorOverrides(connectors);
    return { connectors };
  }),
}));

// Models Store - AI model management
interface ModelsState {
  models: Model[];
  loadedModel: string | null;
  addModel: (model: Model) => void;
  updateModel: (id: string, updates: Partial<Model>) => void;
  deleteModel: (id: string) => void;
  setLoadedModel: (id: string | null) => void;
}

export const useModelsStore = create<ModelsState>((set) => ({
  models: [],
  loadedModel: null,
  addModel: (model) => set((state) => {
    // Prevent duplicates by checking ID
    if (state.models.find(m => m.id === model.id)) {
      return state;
    }
    return { models: [...state.models, model] };
  }),
  updateModel: (id, updates) => set((state) => ({
    models: state.models.map((m) => (m.id === id ? { ...m, ...updates } : m)),
  })),
  deleteModel: (id) => set((state) => ({ models: state.models.filter((m) => m.id !== id) })),
  setLoadedModel: (id) => set({ loadedModel: id }),
}));

// Workspace Store
interface Project {
  id: string;
  name: string;
  status: 'active' | 'archived';
  updatedAt: string;
}

interface WorkspaceState {
  projects: Project[];
  activeProject: string | null;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
}

const loadWorkspaceProjects = (): Project[] => {
  try {
    return JSON.parse(localStorage.getItem('gsos.workspace.projects') || '[]');
  } catch {
    return [];
  }
};

const saveWorkspaceProjects = (projects: Project[]) => {
  localStorage.setItem('gsos.workspace.projects', JSON.stringify(projects));
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  projects: loadWorkspaceProjects(),
  activeProject: localStorage.getItem('gsos.workspace.activeProject'),
  addProject: (project) => set((state) => {
    const projects = [...state.projects, project];
    saveWorkspaceProjects(projects);
    localStorage.setItem('gsos.workspace.activeProject', project.id);
    return { projects, activeProject: project.id };
  }),
  updateProject: (id, updates) => set((state) => {
    const projects = state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p));
    saveWorkspaceProjects(projects);
    return { projects };
  }),
  deleteProject: (id) => set((state) => {
    const projects = state.projects.filter((p) => p.id !== id);
    saveWorkspaceProjects(projects);
    const activeProject = state.activeProject === id ? projects[0]?.id || null : state.activeProject;
    if (activeProject) localStorage.setItem('gsos.workspace.activeProject', activeProject);
    else localStorage.removeItem('gsos.workspace.activeProject');
    return { projects, activeProject };
  }),
  setActiveProject: (id) => {
    if (id) localStorage.setItem('gsos.workspace.activeProject', id);
    else localStorage.removeItem('gsos.workspace.activeProject');
    set({ activeProject: id });
  },
}));

// Settings Store
interface SettingsState {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: {
    theme: 'dark',
    language: 'en',
    modelHub: {
      defaultModel: '',
      autoDownload: false,
      downloadPath: 'models',
    },
    engine: {
      localOnly: true,
      maxTokens: 4096,
      temperature: 0.7,
    },
    privacy: {
      storeHistory: true,
      allowAnalytics: false,
    },
  },
  updateSettings: (updates) => set((state) => ({
    settings: { ...state.settings, ...updates },
  })),
}));

// System Store - System information
interface SystemState {
  systemInfo: SystemInfo | null;
  scheduledTasks: ScheduledTask[];
  setSystemInfo: (info: SystemInfo) => void;
  addScheduledTask: (task: ScheduledTask) => void;
  updateScheduledTask: (id: string, updates: Partial<ScheduledTask>) => void;
  deleteScheduledTask: (id: string) => void;
}

export const useSystemStore = create<SystemState>((set) => ({
  systemInfo: null,
  scheduledTasks: [],
  setSystemInfo: (info) => set({ systemInfo: info }),
  addScheduledTask: (task) => set((state) => ({ scheduledTasks: [...state.scheduledTasks, task] })),
  updateScheduledTask: (id, updates) => set((state) => ({
    scheduledTasks: state.scheduledTasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
  })),
  deleteScheduledTask: (id) => set((state) => ({
    scheduledTasks: state.scheduledTasks.filter((t) => t.id !== id),
  })),
}));

// User Store
interface UserState {
  user: User | null;
  setUser: (user: User | null) => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
