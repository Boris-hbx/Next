@echo off
chcp 65001 >nul
title Next - Tauri Build Script

echo ========================================
echo    Next Application Build Script
echo    (Tauri + Flask Backend)
echo ========================================
echo.

:: 获取当前目录
set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

:: 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH
    pause
    exit /b 1
)

:: 检查 PyInstaller
python -c "import PyInstaller" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing PyInstaller...
    pip install pyinstaller
)

:: 检查 Cargo/Rust
cargo --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Rust/Cargo is not installed
    echo Please install from https://rustup.rs
    pause
    exit /b 1
)

:: 检查 Tauri CLI
cargo tauri --version >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing Tauri CLI...
    cargo install tauri-cli
)

echo [INFO] All dependencies ready
echo.

:: Step 1: 构建 Flask 后端
echo ========================================
echo [Step 1/3] Building Flask Backend...
echo ========================================
python -m PyInstaller flask-backend.spec --noconfirm
if errorlevel 1 (
    echo [ERROR] Flask backend build failed!
    pause
    exit /b 1
)
echo [OK] Flask backend built
echo.

:: Step 2: 复制到 Tauri resources
echo ========================================
echo [Step 2/3] Copying to Tauri resources...
echo ========================================
if not exist "src-tauri\resources" mkdir "src-tauri\resources"
copy /Y "dist\flask-backend.exe" "src-tauri\resources\" >nul
echo [OK] Copied flask-backend.exe
echo.

:: Step 3: 构建 Tauri 应用
echo ========================================
echo [Step 3/3] Building Tauri Application...
echo ========================================
cargo tauri build
if errorlevel 1 (
    echo [ERROR] Tauri build failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo    Build completed successfully!
echo ========================================
echo.
echo Output:
echo   - MSI: src-tauri\target\release\bundle\msi\
echo   - NSIS: src-tauri\target\release\bundle\nsis\
echo.
pause
