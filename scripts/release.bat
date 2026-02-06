@echo off
REM Next - Build and copy installers to release/
REM Usage: scripts\release.bat

setlocal

set "PROJECT_DIR=%~dp0.."
set "RELEASE_DIR=%PROJECT_DIR%\release"
set "BUNDLE_DIR=%PROJECT_DIR%\src-tauri\target\release\bundle"

echo Building Next...
cd /d "%PROJECT_DIR%\src-tauri"
cargo tauri build
if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    exit /b 1
)

echo.
echo Copying installers to release/...
if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"

for %%f in ("%BUNDLE_DIR%\nsis\*.exe") do (
    copy /Y "%%f" "%RELEASE_DIR%\"
    echo   Copied: %%~nxf
)

echo.
echo Done! Installers are in: release\
dir /b "%RELEASE_DIR%"
