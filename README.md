# Next

**Focus on the Right Thing.**

A personal task management app with AI assistant. Cut through the noise and focus on what truly matters — the next right thing to do.

## Features

- **Priority Lanes** — Organize tasks by urgency & importance (Eisenhower matrix)
- **Time Horizons** — Today / This Week / Next 30 Days
- **AI Assistant (阿宝)** — Natural language task management powered by Claude
- **Routines & Reviews** — Daily habits + periodic check-ins
- **Drag & Drop** — Reorder tasks across lanes and time tabs
- **PWA** — Install on mobile, works offline
- **Dark / Light Mode** — System detection + manual toggle

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Rust (Axum 0.8) |
| Database | SQLite (WAL mode) |
| Frontend | Vanilla HTML/CSS/JS |
| AI | Claude API (Anthropic) |
| Deployment | Docker + Fly.io |

## Quick Start

```bash
cd server
PORT=3001 ANTHROPIC_API_KEY=your_key cargo run
```

Open `http://localhost:3001`.

## Deploy

```bash
fly secrets set ANTHROPIC_API_KEY=xxx
fly deploy
```

## Documentation

Detailed docs live in `docs/ref/`:

| Topic | File |
|-------|------|
| Architecture & design | [ARCHITECTURE.md](docs/ref/ARCHITECTURE.md) |
| REST API & data models | [API.md](docs/ref/API.md) |
| Rust backend guide | [BACKEND.md](docs/ref/BACKEND.md) |
| Frontend JS/CSS/PWA | [FRONTEND.md](docs/ref/FRONTEND.md) |
| Deployment & Docker | [DEPLOYMENT.md](docs/ref/DEPLOYMENT.md) |
| Database schema | [DATA.md](docs/ref/DATA.md) |

## License

MIT
