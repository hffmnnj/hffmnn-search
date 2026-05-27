# hffmnn search

> A private, editorial search experience. Built for people who miss when search felt like reading a newspaper instead of scrolling through ads.

**hffmnn search** is a self-hosted search frontend that combines web search with AI-powered overviews, local news aggregation, and an editorial "front page" feel. No tracking. No ads. Your queries stay yours.

Supports **any OpenAI/Anthropic-compatible LLM endpoint** — OpenAI, Anthropic, OpenRouter, Ollama, local vLLM, or anything that speaks the standard chat completions protocol.

---

## Features

| Feature | Description |
|---------|-------------|
| **AI Search** | AI-generated overviews via your choice of LLM provider |
| **Editorial News** | Daily curated news from Kagi News API, vectorized for search |
| **Bang Shortcuts** | `!w` Wikipedia, `!gh` GitHub, `!yt` YouTube, `!maps` — extensible |
| **Local First** | SQLite database, runs entirely on your own hardware |
| **PWA** | Install to home screen on iOS/Android with offline service worker |
| **Dark Mode** | System-aware with manual override |
| **Auth-Walled** | Device pairing keeps your instance private |

---

## Tech Stack

![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?logo=svelte&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000?logo=bun&logoColor=f9f1a5)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) 1.3+
- [Ollama](https://ollama.com) (local embeddings model: `embeddinggemma:latest`)

### Install

```bash
git clone https://github.com/hffmnnj/hffmnn-search.git
cd hffmnn-search
bun install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your keys and provider choices:
#   BRAVE_API_KEY=***     # https://api.search.brave.com
#   EXA_API_KEY=***       # https://exa.ai (if using Exa)
#   LLM_BASE_URL=***      # https://api.openai.com/v1, https://api.anthropic.com/v1, etc.
#   LLM_API_KEY=***
#   LLM_MODEL=gpt-4o
#   OLLAMA_API_KEY=***    # Fallback if LLM_BASE_URL unset
```

### Run

```bash
bun run dev      # development on http://localhost:6767
bun run build    # production build
bun run preview  # preview production build
```

### Systemd Service

```bash
sudo cp hffmnn-search.service /etc/systemd/system/
sudo systemctl enable --now hffmnn-search
```

---

## LLM Providers

The app uses a unified LLM client that works with **any OpenAI/Anthropic-compatible endpoint**:

| Provider | `LLM_BASE_URL` | `LLM_MODEL` example |
|----------|---------------|---------------------|
| **OpenAI** | `https://api.openai.com/v1` | `gpt-5.5` |
| **Anthropic** | `https://api.anthropic.com/v1` | `claude-opus-4.7` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `openai/gpt-5.5`, `anthropic/claude-opus-4.7`, `moonshot/kimi-k2.6` |
| **Ollama Cloud** | unset (uses `OLLAMA_API_KEY`) | `gemma4:31b-cloud` |
| **Local vLLM** | `http://localhost:8000/v1` | `llama4-70b`, `kimi-k2.6` |

Set `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL` for custom endpoints. If `LLM_BASE_URL` is unset, the app falls back to **Ollama Cloud** using `OLLAMA_API_KEY`.

---

## Search Providers

Choose your web search backend via `SEARCH_PROVIDER`:

| Provider | Env | Notes |
|----------|-----|-------|
| **Brave** (default) | `SEARCH_PROVIDER=brave` | Traditional web search + news + videos |
| **Exa** | `SEARCH_PROVIDER=exa` | Neural AI search with autoprompt |

Override per-query with `?provider=exa` or the legacy `?exa=1`.

---

## Architecture

```
src/
├── routes/
│   ├── search/+page.svelte       # Main search results
│   ├── chat/+page.svelte         # Standalone AI chat
│   ├── settings/+page.svelte     # API key & prefs
│   └── auth/pair/                # Device pairing
├── lib/
│   ├── server/
│   │   ├── auth.ts               # Session/pairing logic
│   │   ├── db.ts                 # SQLite (better-sqlite3)
│   │   ├── brave.ts              # Brave Search client
│   │   ├── exa.ts                # Exa Neural Search client
│   │   └── llm.ts                # Unified LLM client
│   ├── components/
│   │   └── AIChat.svelte         # Shared chat component
│   └── bangs.ts                  # !bang shortcut engine
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SEARCH_PROVIDER` | No | `brave` (default) or `exa` |
| `BRAVE_API_KEY` | If provider=brave | Brave Search API key |
| `EXA_API_KEY` | If provider=exa | Exa Neural Search API key |
| `LLM_BASE_URL` | No | Custom LLM endpoint (OpenAI/Anthropic-compatible) |
| `LLM_API_KEY` | No | API key for custom LLM endpoint |
| `LLM_MODEL` | No | Default model slug |
| `OLLAMA_API_KEY` | No | Ollama Cloud (fallback if `LLM_BASE_URL` unset) |
| `PORT` | No | Override default `6767` |

---

## Search Engine Detection

The app ships with an [OpenSearch](https://developer.mozilla.org/en-US/docs/Web/OpenSearch) descriptor. Chromium-based browsers (Vanadium, Brave, Chrome, Edge) will auto-detect and offer to add hffmnn as a default search engine after visiting the site.

---

## License

MIT — built for personal use, shared in case it's useful.
