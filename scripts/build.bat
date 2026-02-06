@echo off
REM Next - Tauri Build Script
REM Usage: scripts\build.bat

echo Building Next...
cd /d "%~dp0..\src-tauri"
cargo tauri build
if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    exit /b 1
)
echo Build completed successfully.
echo.
echo Installer: src-tauri\target\release\bundle\nsis\
