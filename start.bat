@echo off
chcp 65001 >nul
title Next - Focus on the Right Thing

:: 获取当前目录
set APP_DIR=%~dp0
cd /d "%APP_DIR%"

echo ========================================
echo    Next - Development Mode
echo ========================================
echo.

:: 检查是否有已构建的 Tauri 应用
if exist "src-tauri\target\release\next.exe" (
    echo [INFO] Found built Tauri app
    echo [INFO] Starting Next...
    start "" "src-tauri\target\release\next.exe"
    exit /b 0
)

:: 开发模式：启动 Flask 后端
echo [INFO] Starting Flask backend on port 2026...
echo [INFO] Press Ctrl+C to stop
echo.

:: 设置端口
set FLASK_PORT=2026

:: 延迟打开浏览器
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:2026"

:: 启动 Flask
cd backend
python app.py
