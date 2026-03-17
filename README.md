# NotebookLM MCP Server

A remote **Model Context Protocol (MCP) server** that gives AI agents (Claude, Cursor, Copilot, etc.) full programmatic access to **Google NotebookLM** via browser automation.

Hosted on **Vercel** · Browser powered by **Browserless.io**

---

## 🗺️ Architecture

```
AI Agent (Claude / Cursor)
        │  MCP (Streamable HTTP)
        ▼
  ┌─────────────────────┐
  │  Vercel Function    │  ← Next.js App Router
  │  (TypeScript / MCP) │     mcp-handler adapter
  └─────────┬───────────┘
            │  WebSocket (CDP)
            ▼
  ┌─────────────────────┐
  │  Browserless.io     │  ← Remote headless Chromium
  │  (free tier)        │     stealth mode enabled
  └─────────┬───────────┘
            │  Playwright
            ▼
  ┌─────────────────────┐
  │  Google NotebookLM  │  ← Authenticated via stored cookies
  └─────────────────────┘
```

---

## ⚡ Quick Start

### Prerequisites

- Node.js 18+
- A free [Browserless.io](https://browserless.io) account → get your API token
- A Google account with access to NotebookLM
- A [Vercel](https://vercel.com) account

---

### Step 1 — Clone & install

```bash
git clone <your-repo-url>
cd notebooklm-mcp
npm install
```

---

### Step 2 — Extract Google cookies (one-time)

This step opens a browser window for you to sign in. Runs **locally only**.

```bash
# Install playwright for local cookie extraction
npm install playwright --save-dev
npx playwright install chromium

# Run the extractor
npm run get-cookies
```

1. A Chrome browser will open → sign in to your Google account
2. Navigate to NotebookLM and verify you can see your notebooks
3. Switch back to the terminal and press **Enter**
4. The script prints a `NOTEBOOKLM_STORAGE_STATE=...` value — **copy it**

---

### Step 3 — Configure environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```env
# From https://browserless.io → your dashboard
BROWSERLESS_TOKEN=your_token_here

# From the get-cookies script output
NOTEBOOKLM_STORAGE_STATE=eyJjb29...

# Optional: closest region (sfo | lon | sea | fra)
BROWSERLESS_REGION=sfo
```

---

### Step 4 — Test locally

```bash
npm run dev
# MCP endpoint: http://localhost:3000/api/mcp
```

---

### Step 5 — Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (follow the prompts)
vercel

# Add your environment variables (or use the Vercel dashboard)
vercel env add BROWSERLESS_TOKEN
vercel env add NOTEBOOKLM_STORAGE_STATE
vercel env add BROWSERLESS_REGION

# Deploy to production
vercel --prod
```

Your MCP server will be live at:
```
https://your-project.vercel.app/api/mcp
```

---

### Step 6 — Connect your AI agent

**Claude Desktop** (`~/Library/Application\ Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "notebooklm": {
      "url": "https://your-project.vercel.app/api/mcp"
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "notebooklm": {
      "url": "https://your-project.vercel.app/api/mcp"
    }
  }
}
```

---

## 🛠️ Available MCP Tools

### Notebooks
| Tool | Description |
|------|-------------|
| `notebooklm_list_notebooks` | List all notebooks in your account |
| `notebooklm_create_notebook` | Create a new notebook |
| `notebooklm_get_notebook` | Get details of a notebook by ID |
| `notebooklm_delete_notebook` | Delete a notebook permanently |

### Sources
| Tool | Description |
|------|-------------|
| `notebooklm_list_sources` | List all sources in a notebook |
| `notebooklm_add_source_url` | Add a website URL as a source |
| `notebooklm_add_source_youtube` | Add a YouTube video as a source |
| `notebooklm_add_source_text` | Add plain text as a source |
| `notebooklm_remove_source` | Remove a source from a notebook |

### Chat / Query
| Tool | Description |
|------|-------------|
| `notebooklm_ask` | Ask a question (single turn) |
| `notebooklm_conversation` | Multi-turn conversation (up to 10 questions) |

### Content Generation
| Tool | Description |
|------|-------------|
| `notebooklm_generate_audio` | Generate an Audio Overview (podcast) |
| `notebooklm_generate_quiz` | Generate a quiz |
| `notebooklm_generate_flashcards` | Generate flashcards |
| `notebooklm_generate_mindmap` | Generate a mind map |
| `notebooklm_generate_slideshow` | Generate a slide deck |
| `notebooklm_generate_study_guide` | Generate a study guide |
| `notebooklm_generate_briefing` | Generate a briefing document |

### Utility
| Tool | Description |
|------|-------------|
| `notebooklm_health_check` | Verify Browserless.io connection and session validity |

---

## 🔑 Session Management

Google sessions typically last **30–90 days**. When your session expires:

1. Run `npm run get-cookies` again on your local machine
2. Copy the new `NOTEBOOKLM_STORAGE_STATE` value
3. Update it in Vercel: `vercel env rm NOTEBOOKLM_STORAGE_STATE && vercel env add NOTEBOOKLM_STORAGE_STATE`
4. Re-deploy: `vercel --prod`

The `notebooklm_health_check` tool will tell you if the session is still valid.

---

## 💰 Browserless.io Free Tier

The **free tier** gives you **~1,000 units/month**.

| Operation | Approx. cost |
|-----------|-------------|
| List notebooks | ~1 unit |
| Add a URL source | ~2–3 units |
| Ask a question | ~2 units |
| Generate audio | ~2 units |

For typical personal use (~50–100 tool calls/month), the free tier is more than sufficient.

---

## ⚠️ Limitations

- **Vercel Hobby timeout**: Functions are limited to 60 seconds. Long-running operations (audio generation) are started asynchronously and must be checked in the NotebookLM UI.
- **Session expiry**: Google cookies expire. Re-run `get-cookies` when authentication fails.
- **UI changes**: NotebookLM is a product under active development. If selectors break, open an issue.
- **Unofficial**: This uses browser automation, not an official API. Google could change NotebookLM's interface at any time.

---

## 🔧 Troubleshooting

**"Session has expired" error**
→ Re-run `npm run get-cookies` and update `NOTEBOOKLM_STORAGE_STATE` in Vercel.

**"BROWSERLESS_TOKEN is not set" error**
→ Add the token in Vercel dashboard → Settings → Environment Variables.

**Tool returns "Could not find button" error**
→ NotebookLM's UI may have been updated. Check the [notebooklm-py repo](https://github.com/teng-lin/notebooklm-py) for updated selectors.

**Timeout errors**
→ Browserless.io free tier may be under load. Wait a few minutes and retry.
