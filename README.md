# hffmnn search

> A private, editorial search experience. Built for people who miss when search felt like reading a newspaper instead of scrolling through ads.

**hffmnn search** is a self-hosted search frontend that combines Brave Search results with AI-powered overviews, local news aggregation, and an editorial "front page" feel. No tracking. No ads. Your queries stay yours.

---

## Features

| Feature | Description |
|---------|-------------|
| **AI Search** | Brave Search backend with AI-generated overviews via Ollama |
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
# Edit .env with your keys:
#   BRAVE_API_KEY=...    # https://api.search.brave.com
#   OLLAMA_API_KEY=...   # https://ollama.com
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

## Architecture

```
src/
├── routes/
│   ├── search/+page.svelte     # Main search results
│   ├── chat/+page.svelte       # Standalone AI chat
│   ├── settings/+page.svelte   # API key & prefs
│   └── auth/pair/              # Device pairing
├── lib/
│   ├── server/
│   │   ├── auth.ts             # Session/pairing logic
│   │   ├── db.ts               # SQLite (better-sqlite3)
│   │   └── search.ts           # Brave + Ollama integration
│   ├── components/
│   │   └── AIChat.svelte       # Shared chat component
│   └── bangs.ts                # !bang shortcut engine
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BRAVE_API_KEY` | Yes | Brave Search API key |
| `OLLAMA_API_KEY` | Yes | Ollama Cloud API key |
| `PORT` | No | Override default `6767` |

---

## Search Engine Detection

The app ships with an [OpenSearch](https://developer.mozilla.org/en-US/docs/Web/OpenSearch) descriptor. Chromium-based browsers (Vanadium, Brave, Chrome, Edge) will auto-detect and offer to add hffmnn as a default search engine after visiting the site.

---

## License

MIT — built for personal use, shared in case it's useful.
