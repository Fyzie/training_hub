@echo off
setlocal enabledelayedexpansion
title IRnow Hub - Launcher & Controller
color 0B

cd /d "%~dp0"

:START
echo =====================================================================
echo                 IRnow Hub - WORKSTATION PORTAL
echo =====================================================================
echo.

:: 1. Detect Python (prioritize GPU conda env if present)
echo [*] Checking Python environment...
set "PYTHON_CMD="

if defined PYTHON_EXE if exist "%PYTHON_EXE%" set "PYTHON_CMD=%PYTHON_EXE%"
if not defined PYTHON_CMD if defined CONDA_PREFIX if exist "%CONDA_PREFIX%\python.exe" set "PYTHON_CMD=%CONDA_PREFIX%\python.exe"
if not defined PYTHON_CMD if exist "%USERPROFILE%\anaconda3\envs\py-gpu\python.exe" set "PYTHON_CMD=%USERPROFILE%\anaconda3\envs\py-gpu\python.exe"
if not defined PYTHON_CMD if exist "%USERPROFILE%\miniconda3\envs\py-gpu\python.exe" set "PYTHON_CMD=%USERPROFILE%\miniconda3\envs\py-gpu\python.exe"

if not defined PYTHON_CMD (
    for /d %%u in ("%SystemDrive%\Users\*") do (
        if not defined PYTHON_CMD if exist "%%u\anaconda3\envs\py-gpu\python.exe" set "PYTHON_CMD=%%u\anaconda3\envs\py-gpu\python.exe"
        if not defined PYTHON_CMD if exist "%%u\miniconda3\envs\py-gpu\python.exe" set "PYTHON_CMD=%%u\miniconda3\envs\py-gpu\python.exe"
    )
)

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
    if exist "%USERPROFILE%\anaconda3\python.exe" set "PYTHON_CMD=%USERPROFILE%\anaconda3\python.exe"
    if exist "%USERPROFILE%\miniconda3\python.exe" set "PYTHON_CMD=%USERPROFILE%\miniconda3\python.exe"
    if exist "C:\ProgramData\anaconda3\python.exe" set "PYTHON_CMD=C:\ProgramData\anaconda3\python.exe"
    if exist "C:\anaconda3\python.exe" set "PYTHON_CMD=C:\anaconda3\python.exe"
    for /d %%u in ("%SystemDrive%\Users\*") do (
        if not defined PYTHON_CMD if exist "%%u\anaconda3\python.exe" set "PYTHON_CMD=%%u\anaconda3\python.exe"
        if not defined PYTHON_CMD if exist "%%u\miniconda3\python.exe" set "PYTHON_CMD=%%u\miniconda3\python.exe"
        if not defined PYTHON_CMD if exist "%%u\AppData\Local\Programs\Python\Python311\python.exe" set "PYTHON_CMD=%%u\AppData\Local\Programs\Python\Python311\python.exe"
        if not defined PYTHON_CMD if exist "%%u\AppData\Local\Programs\Python\Python310\python.exe" set "PYTHON_CMD=%%u\AppData\Local\Programs\Python\Python310\python.exe"
    )
)

if not defined PYTHON_CMD (
    echo [ERROR] Python was not found in PATH or standard Anaconda folders!
    echo         Please install Python 3.10+ or Anaconda and add it to PATH.
    pause
    exit /b 1
)
echo     Found Python: !PYTHON_CMD!

:: 2. Detect Node.js
echo [*] Checking Node.js environment...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js was not found in PATH!
    echo         Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

:: 3. Check node_modules
if not exist "node_modules\" (
    echo [*] First-time setup: Installing Node dependencies...
    call npm install
)

:: 4. Check production build
if not exist ".next\" (
    echo [*] Building Next.js production bundle...
    call npm run build
)

:: 5. Detect Cloudflare tunnel (optional)
set "CLOUDFLARED_CMD="
where cloudflared >nul 2>&1
if %ERRORLEVEL% equ 0 set "CLOUDFLARED_CMD=cloudflared"
if not defined CLOUDFLARED_CMD (
    if exist "%~dp0cloudflared.exe" set "CLOUDFLARED_CMD=%~dp0cloudflared.exe"
    if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" set "CLOUDFLARED_CMD=C:\Program Files (x86)\cloudflared\cloudflared.exe"
    if exist "C:\Program Files\cloudflared\cloudflared.exe" set "CLOUDFLARED_CMD=C:\Program Files\cloudflared\cloudflared.exe"
)

:: 6. Check and initialize storage-hub if needed
set "STORAGE_DIR=%~dp0..\storage-hub"
if not exist "!STORAGE_DIR!\data" (
    echo [*] Initializing decoupled storage-hub directory...
    call "!PYTHON_CMD!" "%~dp0scripts\migrate_to_storage_hub.py"
)
:: 7. Clean up old processes on ports 3000, 8000 if running
echo [*] Clearing any stale processes on ports 3000, 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

:: 8. Launch services in minimized windows
echo.
echo [*] Starting Services:
echo     1. Starting FastAPI Backend on port 8000...
start "IRnow Hub - FastAPI Backend" /min cmd /c ""!PYTHON_CMD!" run_backend.py"

echo     2. Starting Next.js Web Application on port 3000...
start "IRnow Hub - Web Portal" /min cmd /c "npx next start -H 0.0.0.0 -p 3000"

echo     3. Cloudflare Tunnel: Standby (Controlled on-demand via Web Portal Gateway)

:: Wait 3 seconds for server boot
ping 127.0.0.1 -n 4 >nul

:: Detect LAN IP
set "PS_EXE=powershell.exe"
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
for /f "tokens=*" %%i in ('"%PS_EXE%" -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL' -and $_.IPAddress -notlike '169.254*' } | Select-Object -First 1).IPAddress" 2^>nul') do set "LAN_IP=%%i"
if not defined LAN_IP set "LAN_IP=127.0.0.1"

:: Automatically open browser
start http://localhost:3000

:MENU
cls
echo =====================================================================
echo                 IRnow Hub - WORKSTATION PORTAL
echo =====================================================================
echo.
echo   [ACTIVE SERVICES]
echo   -------------------------------------------------------------------
echo   * Web Portal:       http://localhost:3000
echo   * Local Network:    http://!LAN_IP!:3000
echo   * Python FastAPI:   http://localhost:8000  (Docs: /docs)
echo   * Cloudflare:       Controlled on-demand via Web Portal (Host Gateway)
echo   -------------------------------------------------------------------
echo.
echo   [CONTROLS]
echo   1. Open Web Portal in Browser (http://localhost:3000)
echo   2. Open FastAPI API Docs (http://localhost:8000/docs)
echo   3. Restart All Services
echo   Q. Stop All Services and Exit
echo.
echo =====================================================================
set /p "CHOICE=Select an option [1, 2, 3, Q]: "

if /i "!CHOICE!"=="1" (
    start http://localhost:3000
    goto MENU
)
if /i "!CHOICE!"=="2" (
    start http://localhost:8000/docs
    goto MENU
)
if /i "!CHOICE!"=="3" (
    call "%~dp0stop_hub.bat"
    ping 127.0.0.1 -n 3 >nul
    goto :START
)
if /i "!CHOICE!"=="Q" goto SHUTDOWN
goto MENU

:SHUTDOWN
echo.
echo [*] Stopping all IRnow Hub services...
call "%~dp0stop_hub.bat"
echo [*] All services stopped cleanly. Goodbye!
ping 127.0.0.1 -n 3 >nul
exit /b 0
