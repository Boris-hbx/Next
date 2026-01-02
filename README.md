# Boris Life - Work Engine

A personal life management PWA built with Flask. Organize tasks with the Eisenhower Matrix, maintain motivation, manage prompts, and visualize data with bubble charts.

## Features

### Core Features
- **Todo (Eisenhower Matrix)**: Organize tasks by importance and urgency across three time horizons (Today, This Week, Next 30 Days)
- **Motivation**: Personal motivation text organized by categories
- **Prompt Todo**: Track and manage prompts with status workflow
- **Prompt History**: Archive executed prompts with auto-tagging
- **Bubble Chart Tool**: Create and save bubble chart visualizations
- **Games**: Spider game and Breakout for brain relaxation
- **AI Chat**: Integrated AI assistant interface (development)

### New Features (v2.1)
- **Task Labels**: Custom tags for task categorization (multi-tag support)
- **Daily Review**: End-of-day task summary with motivational messages (press `R`)

### Features (v2.0)
- **Dark Mode**: Automatic system preference detection + manual toggle (press `D`)
- **Keyboard Shortcuts**: Quick actions without mouse (press `?` for help)
- **Search**: Real-time task search with highlighting (press `S`)
- **Quick Add Bar**: Fast task creation from any view
- **Pomodoro Timer**: 25/5 work-break cycles with notifications (press `P`)
- **Focus Mode**: Distraction-free interface (press `F`)
- **Touch Drag & Drop**: Mobile-friendly task reordering
- **Gesture Navigation**: Swipe between tabs on mobile
- **Sync Status**: Visual feedback for save operations
- **Data Export/Import**: Backup and restore all data
- **Statistics API**: Task completion analytics

### Platform Features
- **PWA Support**: Install on mobile devices, works offline
- **Responsive Design**: Separate optimized layouts for desktop and mobile
- **Local-First**: All data stored in JSON/text files

## Quick Start

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the Application**
   ```bash
   cd backend
   python app.py
   ```

3. **Open in Browser**
   - Desktop: `http://localhost:3000`
   - Mobile: Same URL (auto-detects device)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | New task |
| `S` | Search |
| `R` | Daily review |
| `1` `2` `3` | Switch tabs (Today/Week/Month) |
| `D` | Toggle dark mode |
| `F` | Focus mode |
| `P` | Pomodoro timer |
| `?` | Show shortcuts help |
| `Esc` | Close modals |

## Project Structure

```
work-engine/
├── backend/
│   ├── app.py                 # Flask application with platform routing
│   └── test_app.py            # Tests
├── frontend/
│   └── templates/
│       ├── shared/            # Shared base templates
│       │   └── base_core.html
│       ├── desktop/           # Desktop-specific templates
│       │   ├── base.html
│       │   └── *.html
│       ├── mobile/            # Mobile-specific templates
│       │   ├── base.html
│       │   └── *.html
│       └── *.html             # Legacy/fallback templates
├── assets/
│   ├── css/
│   │   ├── base.css           # Shared styles (with dark mode)
│   │   ├── desktop.css        # Desktop-only styles
│   │   ├── mobile.css         # Mobile-only styles
│   │   └── style.css          # Legacy styles
│   ├── images/
│   ├── icons/
│   └── sw.js                  # Service worker
├── data/
│   ├── todos.json             # Task data
│   ├── prompts.json           # Prompt history
│   ├── prompt-todo.json       # Pending prompts
│   ├── bubbles.json           # Bubble chart data
│   └── quotes.txt             # Random quotes
├── config/
│   └── config.json            # App configuration
├── docs/
│   └── PRODUCT_DESIGN.md      # Product design document
└── requirements.txt           # Python dependencies
```

## Platform Architecture

The app automatically detects the device type and serves optimized templates:

- **Desktop**: Full sidebar layout with pet companion, timezone display
- **Mobile**: Bottom navigation bar, touch-optimized cards, pull-to-refresh

### Platform API

```javascript
// Get current platform
GET /api/platform/current
// Response: { "platform": "desktop", "is_mobile": false, "override": null }

// Switch platform manually
POST /api/platform/switch
// Body: { "platform": "mobile" }  // or "desktop" or "auto"
```

## API Endpoints

### Todos
- `GET /api/todos` - List all todos
- `POST /api/todos` - Create todo
- `PUT /api/todos/<id>` - Update todo
- `DELETE /api/todos/<id>` - Delete todo

### Prompts
- `GET /api/prompt-todos` - List all prompt todos
- `POST /api/prompt-todos` - Create new prompt todo
- `PUT /api/prompt-todos/<id>` - Update prompt (content/status)
- `DELETE /api/prompt-todos/<id>` - Delete prompt
- `POST /api/prompt-todos/<id>/complete` - Archive to history

### Data Management
- `GET /api/export` - Export all data as JSON
- `GET /api/export/csv` - Export todos as CSV
- `POST /api/import` - Import data from JSON backup
- `GET /api/stats` - Get task statistics

### Others
- `GET /api/quote/random` - Get random quote
- `GET /api/bubbles` - Get bubble chart data

## Mobile Usage

1. Open `http://<your-ip>:3000` on your phone (same network)
2. The app auto-detects mobile and shows optimized UI
3. Add to home screen via browser menu for app-like experience

### Mobile Gestures
- **Swipe left/right**: Switch between tabs
- **Long press + drag**: Move tasks between quadrants
- **Pull down**: Refresh content

## Philosophy

This tool is designed for clarity and simplicity:
- Reduce cognitive noise
- Keep important information visible
- Focus on thinking rather than task management mechanics
- Separate concerns between platforms for optimal UX

## Version History

### v2.1 (2025-12-27)
- Added task labels/tags system (F401)
- Added daily review modal (F601)
- Added keyboard shortcut R for daily review

### v2.0 (2025-12-27)
- Added dark mode with system preference detection
- Added keyboard shortcuts for all major actions
- Added task search with real-time filtering
- Added quick add bar for fast task creation
- Added Pomodoro timer with notifications
- Added focus mode for distraction-free work
- Added touch drag & drop for mobile
- Added gesture navigation on mobile
- Added sync status indicator
- Added data export/import functionality
- Added statistics API
- Fixed mobile drag and drop support
- Improved accessibility and keyboard navigation

### v1.0
- Initial release with Eisenhower Matrix
- Desktop and mobile responsive layouts
- PWA support
