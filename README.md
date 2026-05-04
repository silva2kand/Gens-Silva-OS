# genz...Silva OS

A local-first AI workspace powered by a built-in AI engine (Jan + TurboQuant), no external APIs for reasoning.

## Features

- **Local AI Engine**: Built-in inference with Jan/TurboQuant - no Ollama, no cloud AI APIs
- **Multi-Agent System**: Hermes (coding), Paperclips (organization), Solicitor (legal), Accountant (finance), Space Agent (monitoring), OpenClaw (security)
- **50+ Connectors**: GitHub, Gmail, Notion, Stripe, Supabase, Vercel, and more
- **MCP Tool Registry**: Model Context Protocol for extensible tool calling
- **Deep System Integration**: File system, terminal, hardware monitoring
- **Model Hub**: Download and manage GGUF models from Hugging Face

## Architecture

```
genz-silva-os/
├── src/                      # React Frontend
│   ├── components/            # UI Components
│   │   ├── sidebar/          # Navigation sidebar
│   │   ├── chat/             # Chat interface
│   │   ├── agents/           # Agent management
│   │   ├── settings/         # Settings panels
│   │   ├── model-hub/        # Model management
│   │   ├── integrations/     # Connector management
│   │   ├── workspace/        # Project workspace
│   │   └── computer/          # My Computer integration
│   ├── stores/               # Zustand state management
│   ├── lib/                  # Utilities (MCP, local AI)
│   └── types/                # TypeScript types
├── src-tauri/                # Rust Backend
│   └── src/
│       ├── commands/         # Tauri commands
│       ├── connectors/       # Integration connectors
│       ├── agents/           # Agent orchestration
│       └── models/           # Model management
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + TailwindCSS + shadcn/ui
- **Backend**: Tauri 2 (Rust)
- **AI Engine**: Jan + TurboQuant (local GGUF inference)
- **State Management**: Zustand
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+
- Rust 1.70+
- npm or pnpm

### Installation

```bash
# Install dependencies
cd genz-silva-os
npm install

# Run development server
npm run tauri:dev

# Build for production
npm run tauri:build
```

## Local AI Engine

All LLM inference happens locally on your device:

- **No external API calls** for reasoning
- **OpenAI-compatible API** exposed at `http://127.0.0.1:1337/v1`
- **GGUF models** downloaded from Hugging Face
- **GPU acceleration** with CUDA support

### Configuration

Set environment variables:
```bash
GENZ_SILVA_AI_ENDPOINT=http://127.0.0.1:1337/v1
GENZ_SILVA_CURRENT_MODEL=llama-3.1-8b
```

## Connectors

### Social Media
- Instagram (Posts, Stories, Reels, Ads)
- Meta Ads Manager
- Canva, Webflow

### Email & Calendar
- Gmail (OAuth)
- Google Calendar
- Outlook

### Development
- GitHub
- Supabase, Neon, Prisma
- Vercel, Cloudflare, Sentry

### CRM & Business
- HubSpot, Stripe, Close CRM
- Notion, Airtable

### Automation
- Zapier, Make, Dify
- Browser automation

### AI & Media
- HeyGen, Hume, MiniMax
- Hugging Face models

## Security

- OAuth tokens stored securely (Windows Credential Manager)
- All AI inference is local
- No data sent to external AI services
- Configurable privacy settings

## License

MIT