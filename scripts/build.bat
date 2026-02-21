@echo off
REM Next - Build Script
REM Delegates to release.bat (build + copy to release/)
REM There is no scenario where you want a build without the installer in release/.

call "%~dp0release.bat" %*
