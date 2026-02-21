# Next

**Focus on the Right Thing.**

A focused task management desktop app for Windows. Next helps you cut through the noise and zero in on what truly matters — the next right thing to do.

## Features

- **Priority Lanes**: Organize tasks by urgency and importance to surface what needs attention now
- **Time Horizons**: Today, This Week, Next 30 Days — plan at the right granularity
- **Drag & Drop**: Move tasks across priorities and time horizons with mouse or touch
- **Progress Tracking**: 0-100% progress bars, auto-complete at 100%
- **Routines**: Daily recurring tasks to build habits
- **Dark/Light Mode**: System preference detection + manual toggle
- **Keyboard Shortcuts**: Full keyboard navigation
- **Search**: Real-time task search with highlighting
- **Changelog**: Automatic change history for every task

## Quick Start

```bash
# Development mode
cargo tauri dev

# Production build
cargo tauri build

# Build + copy installer to release/
scripts\release.bat
```

Build output: `src-tauri/target/release/bundle/nsis/Next_x.x.x_x64-setup.exe`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri 2.0 (Rust) |
| Backend | Rust (Tauri Commands) |
| Frontend | Vanilla HTML/CSS/JS |
| Data | JSON files (`%LOCALAPPDATA%\Next\data\`) |
| Installer | NSIS (.exe) |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | New task |
| `S` | Search |
| `R` | Daily review |
| `1` `2` `3` | Switch Today / Week / Month |
| `D` | Toggle dark mode |
| `?` | Show help |

## Build Requirements

- Rust (rustup.rs)
- Tauri CLI (`cargo install tauri-cli`)

## License

MIT
