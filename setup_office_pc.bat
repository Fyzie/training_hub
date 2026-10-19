@echo off
setlocal enabledelayedexpansion
title IRnow Hub - Initial Office PC Setup
color 0A

cd /d "%~dp0"
echo =====================================================================
echo         IRnow Hub - ONE-CLICK OFFICE PC SETUP
echo =====================================================================
echo This script will configure Node.js and Python dependencies on this PC.
echo.

:: 1. Detect Python (Prioritize Miniconda/Anaconda for GPU Workstations)
echo [*] Step 1/3: Checking Python...
set "PYTHON_CMD="

:: Priority 1: Environment variables or explicit conda environments
if defined PYTHON_EXE if exist "%PYTHON_EXE%" set "PYTHON_CMD=%PYTHON_EXE%"
if not defined PYTHON_CMD if defined CONDA_PREFIX if exist "%CONDA_PREFIX%\python.exe" set "PYTHON_CMD=%CONDA_PREFIX%\python.exe"
if not defined PYTHON_CMD if exist "%USERPROFILE%\anaconda3\envs\py-gpu\python.exe" set "PYTHON_CMD=%USERPROFILE%\anaconda3\envs\py-gpu\python.exe"
if not defined PYTHON_CMD if exist "%USERPROFILE%\miniconda3\envs\py-gpu\python.exe" set "PYTHON_CMD=%USERPROFILE%\miniconda3\envs\py-gpu\python.exe"

:: Priority 2: Standard Miniconda/Anaconda base paths in user profile or root
if not defined PYTHON_CMD if exist "%USERPROFILE%\miniconda3\python.exe" set "PYTHON_CMD=%USERPROFILE%\miniconda3\python.exe"
if not defined PYTHON_CMD if exist "%USERPROFILE%\anaconda3\python.exe" set "PYTHON_CMD=%USERPROFILE%\anaconda3\python.exe"
if not defined PYTHON_CMD if exist "C:\ProgramData\anaconda3\python.exe" set "PYTHON_CMD=C:\ProgramData\anaconda3\python.exe"
if not defined PYTHON_CMD if exist "C:\anaconda3\python.exe" set "PYTHON_CMD=C:\anaconda3\python.exe"

:: Priority 3: Scan user directories for miniconda3 / anaconda3 base python
if not defined PYTHON_CMD (
    for /d %%u in ("%SystemDrive%\Users\*") do (
        if not defined PYTHON_CMD if exist "%%u\miniconda3\python.exe" set "PYTHON_CMD=%%u\miniconda3\python.exe"
        if not defined PYTHON_CMD if exist "%%u\anaconda3\python.exe" set "PYTHON_CMD=%%u\anaconda3\python.exe"
        if not defined PYTHON_CMD if exist "%%u\anaconda3\envs\py-gpu\python.exe" set "PYTHON_CMD=%%u\anaconda3\envs\py-gpu\python.exe"
        if not defined PYTHON_CMD if exist "%%u\miniconda3\envs\py-gpu\python.exe" set "PYTHON_CMD=%%u\miniconda3\envs\py-gpu\python.exe"
    )
)

:: Priority 4: Fallback to system path python (ignoring WindowsApps store shims)
if not defined PYTHON_CMD (
    for /f "tokens=*" %%i in ('where python 2^>nul') do (
        if not defined PYTHON_CMD (
            echo "%%i" | findstr /i "WindowsApps" >nul
            if errorlevel 1 (
                set "PYTHON_CMD=%%i"
            )
        )
    )
)

if not defined PYTHON_CMD (
    echo [ERROR] Python not detected! Please install Python 3.10+ or Anaconda/Miniconda.
    pause
    exit /b 1
)
echo      Using Python: !PYTHON_CMD!

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
