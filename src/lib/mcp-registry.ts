// MCP Tool Registry - Model Context Protocol implementation
import type { MCPTool, ChatRequest, ChatResponse } from '@/types'

// Tool definitions for connectors
export const toolDefinitions = {
  // File System Tools
  read_file: {
    name: 'read_file',
    description: 'Read the contents of a file from the local file system',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        encoding: { type: 'string', description: 'File encoding (default: utf-8)' },
      },
      required: ['path'],
    },
  },
  write_file: {
    name: 'write_file',
    description: 'Write content to a local file',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        content: { type: 'string', description: 'Content to write' },
        append: { type: 'boolean', description: 'Append to existing file' },
      },
      required: ['path', 'content'],
    },
  },
  list_directory: {
    name: 'list_directory',
    description: 'List contents of a directory',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Absolute path to directory' },
        recursive: { type: 'boolean', description: 'List recursively' },
      },
      required: ['path'],
    },
  },
  search_files: {
    name: 'search_files',
    description: 'Search for files matching a pattern',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Directory to search' },
        pattern: { type: 'string', description: 'Search pattern (glob)' },
      },
      required: ['path', 'pattern'],
    },
  },

  // GitHub Tools
  github_create_issue: {
    name: 'github_create_issue',
    description: 'Create a new issue in a GitHub repository',
    inputSchema: {
      type: 'object' as const,
      properties: {
        repo: { type: 'string', description: 'Repository name (owner/repo)' },
        title: { type: 'string', description: 'Issue title' },
        body: { type: 'string', description: 'Issue body content' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Labels to apply' },
      },
      required: ['repo', 'title'],
    },
  },
  github_create_pr: {
    name: 'github_create_pr',
    description: 'Create a pull request',
    inputSchema: {
      type: 'object' as const,
      properties: {
        repo: { type: 'string', description: 'Repository name (owner/repo)' },
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR description' },
        head: { type: 'string', description: 'Branch to merge from' },
        base: { type: 'string', description: 'Branch to merge into' },
      },
      required: ['repo', 'title', 'head', 'base'],
    },
  },
  github_get_repo: {
    name: 'github_get_repo',
    description: 'Get repository information',
    inputSchema: {
      type: 'object' as const,
      properties: {
        repo: { type: 'string', description: 'Repository name (owner/repo)' },
      },
      required: ['repo'],
    },
  },

  // Email Tools (Gmail)
  gmail_send: {
    name: 'gmail_send',
    description: 'Send an email via Gmail',
    inputSchema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (HTML supported)' },
        cc: { type: 'string', description: 'CC recipients' },
        bcc: { type: 'string', description: 'BCC recipients' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  gmail_search: {
    name: 'gmail_search',
    description: 'Search Gmail messages',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Gmail search query' },
        max_results: { type: 'number', description: 'Maximum results to return' },
      },
      required: ['query'],
    },
  },

  // Database Tools (Supabase/Neon)
  supabase_query: {
    name: 'supabase_query',
    description: 'Execute a SQL query on Supabase',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'SQL query to execute' },
        params: { type: 'array', description: 'Query parameters' },
      },
      required: ['sql'],
    },
  },
  neon_query: {
    name: 'neon_query',
    description: 'Execute a SQL query on Neon PostgreSQL',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'SQL query to execute' },
        params: { type: 'array', description: 'Query parameters' },
      },
      required: ['sql'],
    },
  },

  // Browser Tools
  browser_navigate: {
    name: 'browser_navigate',
    description: 'Navigate browser to a URL',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        wait_until: { type: 'string', description: 'Wait condition (load, networkidle)' },
      },
      required: ['url'],
    },
  },
  browser_screenshot: {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page',
    inputSchema: {
      type: 'object' as const,
      properties: {
        full_page: { type: 'boolean', description: 'Screenshot entire page' },
        selector: { type: 'string', description: 'Screenshot specific element' },
      },
      required: [],
    },
  },
  browser_click: {
    name: 'browser_click',
    description: 'Click an element on the page',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of element' },
        button: { type: 'string', description: 'Mouse button (left, right)' },
      },
      required: ['selector'],
    },
  },
  browser_type: {
    name: 'browser_type',
    description: 'Type text into an input field',
    inputSchema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string', description: 'CSS selector of input' },
        text: { type: 'string', description: 'Text to type' },
        delay: { type: 'number', description: 'Delay between keystrokes (ms)' },
      },
      required: ['selector', 'text'],
    },
  },

  // Calendar Tools
  calendar_create_event: {
    name: 'calendar_create_event',
    description: 'Create a calendar event',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start time (ISO 8601)' },
        end: { type: 'string', description: 'End time (ISO 8601)' },
        description: { type: 'string', description: 'Event description' },
        location: { type: 'string', description: 'Event location' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails' },
      },
      required: ['title', 'start', 'end'],
    },
  },
  calendar_list_events: {
    name: 'calendar_list_events',
    description: 'List calendar events',
    inputSchema: {
      type: 'object' as const,
      properties: {
        start: { type: 'string', description: 'Start date (ISO 8601)' },
        end: { type: 'string', description: 'End date (ISO 8601)' },
        max_results: { type: 'number', description: 'Maximum results' },
      },
      required: ['start', 'end'],
    },
  },

  // Automation Tools
  zapier_trigger: {
    name: 'zapier_trigger',
    description: 'Trigger a Zapier Zap',
    inputSchema: {
      type: 'object' as const,
      properties: {
        zap_id: { type: 'string', description: 'Zap ID to trigger' },
        data: { type: 'object', description: 'Data to send to Zap' },
      },
      required: ['zap_id'],
    },
  },
  make_run_scenario: {
    name: 'make_run_scenario',
    description: 'Run a Make (Integromat) scenario',
    inputSchema: {
      type: 'object' as const,
      properties: {
        scenario_id: { type: 'string', description: 'Scenario ID' },
        input: { type: 'object', description: 'Input data' },
      },
      required: ['scenario_id'],
    },
  },

  // Notion Tools
  notion_create_page: {
    name: 'notion_create_page',
    description: 'Create a page in Notion',
    inputSchema: {
      type: 'object' as const,
      properties: {
        parent_id: { type: 'string', description: 'Parent page or database ID' },
        title: { type: 'string', description: 'Page title' },
        content: { type: 'string', description: 'Page content (markdown)' },
        properties: { type: 'object', description: 'Additional properties' },
      },
      required: ['parent_id', 'title'],
    },
  },
  notion_query_database: {
    name: 'notion_query_database',
    description: 'Query a Notion database',
    inputSchema: {
      type: 'object' as const,
      properties: {
        database_id: { type: 'string', description: 'Database ID' },
        filter: { type: 'object', description: 'Filter conditions' },
        sorts: { type: 'array', description: 'Sort conditions' },
      },
      required: ['database_id'],
    },
  },

  // Stripe Tools
  stripe_create_invoice: {
    name: 'stripe_create_invoice',
    description: 'Create a Stripe invoice',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'Customer ID' },
        items: { type: 'array', description: 'Line items' },
        currency: { type: 'string', description: 'Currency code' },
      },
      required: ['customer_id', 'items'],
    },
  },
  stripe_get_transactions: {
    name: 'stripe_get_transactions',
    description: 'Get Stripe transactions',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'Customer ID' },
        limit: { type: 'number', description: 'Maximum results' },
      },
      required: [],
    },
  },

  // Image Generation
  generate_image: {
    name: 'generate_image',
    description: 'Generate an image using AI',
    inputSchema: {
      type: 'object' as const,
      properties: {
        prompt: { type: 'string', description: 'Image generation prompt' },
        model: { type: 'string', description: 'Model to use (dalle, midjourney, etc.)' },
        size: { type: 'string', description: 'Image size (1024x1024, etc.)' },
        style: { type: 'string', description: 'Style preset' },
      },
      required: ['prompt'],
    },
  },

  // Web Scraping
  web_scrape: {
    name: 'web_scrape',
    description: 'Scrape content from a webpage',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to scrape' },
        selector: { type: 'string', description: 'CSS selector for content' },
      },
      required: ['url'],
    },
  },
  web_search: {
    name: 'web_search',
    description: 'Search the web',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        num_results: { type: 'number', description: 'Number of results' },
      },
      required: ['query'],
    },
  },

  // Terminal/Shell
  terminal_execute: {
    name: 'terminal_execute',
    description: 'Execute a shell command',
    inputSchema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'Command to execute' },
        cwd: { type: 'string', description: 'Working directory' },
        timeout: { type: 'number', description: 'Timeout in seconds' },
      },
      required: ['command'],
    },
  },
}

// Tool handlers - these would be implemented with actual connector logic
export const toolHandlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  read_file: async (args) => {
    // Implementation would use Tauri fs plugin
    console.log('Reading file:', args.path)
    return { success: true, content: 'File content would be here' }
  },
  write_file: async (args) => {
    console.log('Writing file:', args.path)
    return { success: true }
  },
  list_directory: async (args) => {
    console.log('Listing directory:', args.path)
    return { success: true, files: [] }
  },
  // Add more handlers...
}

// MCP Protocol implementation
export class MCPProtocol {
  private tools: Map<string, MCPTool> = new Map()
  private connectors: Map<string, unknown> = new Map()

  constructor() {
    // Register all tools
    Object.entries(toolDefinitions).forEach(([name, definition]) => {
      this.registerTool({
        name,
        description: definition.description,
        inputSchema: definition.inputSchema,
        handler: toolHandlers[name] || (() => Promise.resolve({ error: 'Not implemented' })),
      })
    })
  }

  registerTool(tool: MCPTool) {
    this.tools.set(tool.name, tool)
  }

  registerConnector(name: string, connector: unknown) {
    this.connectors.set(name, connector)
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`Tool ${name} not found`)
    }
    return tool.handler(args)
  }

  getTools(): MCPTool[] {
    return Array.from(this.tools.values())
  }

  getToolDefinitions(): Array<{ name: string; description: string; parameters: object }> {
    return this.getTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    }))
  }
}

// Singleton instance
export const mcpProtocol = new MCPProtocol()

// Convert tools to OpenAI format for local LLM
export function toOpenAITools() {
  return mcpProtocol.getToolDefinitions().map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}