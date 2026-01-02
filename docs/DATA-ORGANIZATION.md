# Data Organization Guide

## Overview

This project separates data into three categories for security and sharing purposes:

```
work-engine/
├── data/              # Active application data (mixed public/private)
├── private-data/      # Sensitive data ONLY (never committed to git)
├── sample-data/       # Example data templates (committed to git)
└── config/            # Configuration files with API keys (not committed)
```

## Folder Descriptions

### `/data` - Active Application Data
This folder contains the live data used by the application:
- `bubbles.json` - Bubble chart data
- `todos.json` - Task list data
- `prompts.json` - Prompt log entries
- `prompt-todo.json` - Prompt tasks
- `quotes.txt` - Motivational quotes
- `motivation.txt` - Motivation content
- `todolist.txt` - Plain text todo list

**Note:** Some files in this folder are tracked by git (non-sensitive), while others are ignored (sensitive). Check `.gitignore` for details.

### `/private-data` - Private/Sensitive Data
This folder is for highly sensitive data that should NEVER be shared:
- Personal information
- Business-sensitive data
- Private notes and records
- Any data you want to keep completely private

**IMPORTANT:** This entire folder is excluded from git tracking.

### `/sample-data` - Example Templates
This folder contains example data files that demonstrate the expected format:
- `bubbles.sample.json` - Sample bubble chart
- `todos.sample.json` - Sample task list
- `prompts.sample.json` - Sample prompts
- `prompt-todo.sample.json` - Sample prompt tasks
- `quotes.sample.txt` - Sample quotes
- `config.sample.json` - Sample configuration

**Use Case:** When setting up on a new machine, copy these files to `/data` or `/config` and customize them.

### `/config` - Configuration Files
Contains API keys and other configuration:
- `config.json` - Main configuration file with API keys

**IMPORTANT:** This folder is excluded from git tracking.

## Setup Instructions

### For New Installations

1. Copy sample files to their active locations:
   ```bash
   # Copy sample data to data folder
   cp sample-data/bubbles.sample.json data/bubbles.json
   cp sample-data/todos.sample.json data/todos.json
   cp sample-data/prompts.sample.json data/prompts.json
   cp sample-data/prompt-todo.sample.json data/prompt-todo.json
   cp sample-data/quotes.sample.txt data/quotes.txt

   # Create config folder and copy sample config
   mkdir -p config
   cp sample-data/config.sample.json config/config.json
   ```

2. Edit the configuration files with your actual settings:
   - Update `config/config.json` with your API keys
   - Customize the sample data as needed

### For Developers

- Always use sample data files for testing
- Never commit real user data to git
- When adding new data files, create corresponding sample files
- Update this documentation when changing data structure

## Security Rules

1. **NEVER commit** files containing:
   - API keys or passwords
   - Personal information
   - Business-sensitive data
   - Real user data

2. **ALWAYS check** `.gitignore` before committing new data files

3. **Keep backups** of your private data separately

## File Formats

### JSON Files
All JSON files use UTF-8 encoding with 2-space indentation.

### Text Files
Plain text files use UTF-8 encoding with LF line endings.

---
*Last updated: 2025-12-29*
