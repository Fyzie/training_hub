@echo off
setlocal
cd /d "%~dp0"
echo =====================================================================
echo                 STOPPING IRnow Hub SERVICES
echo =====================================================================

echo [*] Terminating Next.js on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

echo [*] Terminating FastAPI Backend on port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

echo [*] Terminating Cloudflare tunnel processes if running...
taskkill /f /im cloudflared.exe >nul 2>&1

echo [OK] All IRnow Hub processes have been stopped.
echo =====================================================================
if "%1"=="" ping 127.0.0.1 -n 3 >nul

