# Next

**Focus on the Right Thing.**

A personal task management desktop application built with Tauri + Flask. Organize tasks with the Eisenhower Matrix across different time horizons.

## Features

- **Eisenhower Matrix**: Organize tasks by importance and urgency
- **Time Horizons**: Today, This Week, Next 30 Days views
- **Dark Mode**: System preference detection + manual toggle
- **Keyboard Shortcuts**: Quick actions without mouse
- **Search**: Real-time task search with highlighting
- **Pomodoro Timer**: 25/5 work-break cycles
- **Focus Mode**: Distraction-free interface

## Quick Start

### Development Mode

```bash
# Start Flask backend
cd backend
python app.py

# Open http://localhost:2026
```

### Build Desktop App

```bash
# Run build script (requires Python + Rust)
build.bat

# Output:
#   - MSI installer: src-tauri/target/release/bundle/msi/
#   - NSIS installer: src-tauri/target/release/bundle/nsis/
```

## Tech Stack

- **Backend**: Flask (Python)
- **Frontend**: HTML/CSS/JS + Jinja2 templates
- **Desktop**: Tauri (Rust)
- **Data**: JSON files (local storage)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | New task |
| `S` | Search |
| `R` | Daily review |
| `1` `2` `3` | Switch tabs |
| `D` | Toggle dark mode |
| `F` | Focus mode |
| `P` | Pomodoro timer |
| `?` | Show help |

## Project Structure

```
Next/
├── backend/           # Flask backend
│   └── app.py
├── frontend/          # Jinja2 templates
│   └── templates/
├── assets/            # CSS, JS, icons
├── src-tauri/         # Tauri desktop wrapper
│   ├── src/main.rs
│   └── tauri.conf.json
├── data/              # JSON data files
├── build.bat          # Build script
└── flask-backend.spec # PyInstaller config
```

## Build Requirements

- Python 3.10+
- Rust (rustup.rs)
- Tauri CLI (`cargo install tauri-cli`)
- PyInstaller (`pip install pyinstaller`)

## License

MIT
