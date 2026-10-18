@echo off
setlocal enabledelayedexpansion
title IRnow Hub - Initial Office PC Setup
color 0A

cd /d "%~dp0"
echo =====================================================================
echo          IRnow Hub - ONE-CLICK OFFICE PC SETUP
echo =====================================================================
echo This script will configure Node.js and Python dependencies on this PC.
echo.

:: 1. Detect Python
echo [*] Step 1/3: Checking Python...
set "PYTHON_CMD="
where python >nul 2>&1
if %ERRORLEVEL% equ 0 set "PYTHON_CMD=python"
if not defined PYTHON_CMD (
    if exist "%USERPROFILE%\anaconda3\python.exe" set "PYTHON_CMD=%USERPROFILE%\anaconda3\python.exe"
    if exist "%USERPROFILE%\miniconda3\python.exe" set "PYTHON_CMD=%USERPROFILE%\miniconda3\python.exe"
    if exist "C:\ProgramData\anaconda3\python.exe" set "PYTHON_CMD=C:\ProgramData\anaconda3\python.exe"
    if exist "C:\anaconda3\python.exe" set "PYTHON_CMD=C:\anaconda3\python.exe"
)

if not defined PYTHON_CMD (
    echo [ERROR] Python not detected! Please install Python 3.10+ or Anaconda.
    pause
    exit /b 1
)
echo     Using Python: !PYTHON_CMD!

:: Install python requirements
echo [*] Installing Python requirements from requirements.txt...
"%PYTHON_CMD%" -m pip install -r requirements.txt
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Some python packages failed to install. Please check network. Continuing...
)

:: 2. Detect Node.js & Install npm packages
echo.
echo [*] Step 2/3: Checking Node.js and npm...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not detected! Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

echo [*] Installing Node packages...
call npm install

:: 3. Build Next.js
echo.
echo [*] Step 3/3: Building Next.js production bundle...
call npm run build

echo.
echo =====================================================================
echo [SUCCESS] Office PC Setup is Complete!
echo You can now double-click "start_hub.bat" anytime to launch everything.
echo =====================================================================
echo.
pause

