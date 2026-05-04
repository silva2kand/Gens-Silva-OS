// Global Types for genz...Silva OS

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  model?: string;
  tools?: ToolCall[];
  attachments?: Attachment[];
  starred?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  path?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface ModelOption {
  id: string;
  label: string;
  providerId: string;
  providerLabel: string;
  kind: 'local' | 'provider';
  freeOnly?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  instructions: string;
  tools: string[];
  model?: string;
  isActive: boolean;
  memory: string;
  createdAt: Date;
  updatedAt: Date;
  isSystem?: boolean;
}

export interface Connector {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ConnectorCategory;
  status: 'connected' | 'disconnected' | 'error';
  config: Record<string, unknown>;
  tools: string[];
  authType: 'oauth' | 'api_key' | 'none';
  isEnabled: boolean;
}

export type ConnectorCategory =
  | 'social'
  | 'email'
  | 'calendar'
  | 'storage'
  | 'crm'
  | 'development'
  | 'database'
  | 'automation'
  | 'ai'
  | 'browser';

export interface Model {
  id: string;
  name: string;
  provider: string;
  size?: string;
  quantization?: string;
  contextLength?: number;
  status: 'loaded' | 'downloading' | 'available' | 'error';
  progress?: number;
  file?: string;
  fileSize?: number;
  downloaded?: boolean;
  description?: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  connectors: string[];
  agents: string[];
  files: FileInfo[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: Date;
}

export interface SystemInfo {
  os: string;
  platform: string;
  arch: string;
  hostname: string;
  cpuModel: string;
  cpuCores: number;
  memory: { total: number; used: number; free: number };
  gpu?: { name: string; memory: number; used: number }[];
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  modelHub: {
    defaultModel: string;
    autoDownload: boolean;
    downloadPath: string;
  };
  engine: {
    localOnly: boolean;
    maxTokens: number;
    temperature: number;
  };
  privacy: {
    storeHistory: boolean;
    allowAnalytics: boolean;
  };
}

export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  cron: string;
  action: string;
  params: Record<string, unknown>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  schedule?: string;
  lastRunAt?: string;
}

// MCP Tool Types
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, Record<string, unknown>>;
    required: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

// Local AI Engine Types
export interface LocalEngineConfig {
  endpoint: string;
  model: string;
  maxTokens: number;
  temperature: number;
  contextWindow: number;
  gpuAcceleration: boolean;
}

export interface ChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: Array<{ name: string; description: string; parameters: object }>;
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string; tool_calls?: unknown[] };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// Navigation Types
export type ViewType =
  | 'home'
  | 'chat'
  | 'agents'
  | 'workspace'
  | 'settings'
  | 'connectors'
  | 'integrations'
  | 'model-hub'
  | 'skills'
  | 'computer'
  | 'appearance'
  | 'knowledge'
  | 'channels'
  | 'scheduled-tasks';

export interface NavigationItem {
  id: ViewType;
  label: string;
  icon: string;
  badge?: number;
}
