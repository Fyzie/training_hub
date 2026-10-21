@echo off
setlocal enabledelayedexpansion
title IRnow Workspace - Initial Office PC Setup
color 0A

cd /d "%~dp0"
echo =====================================================================
echo         IRnow Workspace - ONE-CLICK OFFICE PC SETUP
echo =====================================================================
echo This script will configure Node.js and Python dependencies on this PC.
echo.

:: 1. Detect Python (Prioritize Miniconda/Anaconda GPU environments, then standard Python)
echo [*] Step 1/3: Checking Python environment...
set "PYTHON_CMD="

:: Priority 0: Saved in .env.local from previous configuration
if exist "%~dp0.env.local" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0.env.local") do (
        if /i "%%A"=="PYTHON_EXE" if exist "%%B" set "PYTHON_CMD=%%B"
    )
)

:: Priority 1: Environment variables or active conda prefix
if not defined PYTHON_CMD if defined PYTHON_EXE if exist "%PYTHON_EXE%" set "PYTHON_CMD=%PYTHON_EXE%"
if not defined PYTHON_CMD if defined CONDA_PREFIX if exist "%CONDA_PREFIX%\python.exe" set "PYTHON_CMD=%CONDA_PREFIX%\python.exe"

:: Priority 2: py-gpu conda environment in user profile
if not defined PYTHON_CMD if exist "%USERPROFILE%\anaconda3\envs\py-gpu\python.exe" set "PYTHON_CMD=%USERPROFILE%\anaconda3\envs\py-gpu\python.exe"
if not defined PYTHON_CMD if exist "%USERPROFILE%\miniconda3\envs\py-gpu\python.exe" set "PYTHON_CMD=%USERPROFILE%\miniconda3\envs\py-gpu\python.exe"
if not defined PYTHON_CMD if exist "%USERPROFILE%\.conda\envs\py-gpu\python.exe" set "PYTHON_CMD=%USERPROFILE%\.conda\envs\py-gpu\python.exe"

:: Priority 3: Standard Anaconda/Miniconda base paths in user profile or root
if not defined PYTHON_CMD if exist "%USERPROFILE%\anaconda3\python.exe" set "PYTHON_CMD=%USERPROFILE%\anaconda3\python.exe"
if not defined PYTHON_CMD if exist "%USERPROFILE%\miniconda3\python.exe" set "PYTHON_CMD=%USERPROFILE%\miniconda3\python.exe"
if not defined PYTHON_CMD if exist "C:\ProgramData\anaconda3\python.exe" set "PYTHON_CMD=C:\ProgramData\anaconda3\python.exe"
if not defined PYTHON_CMD if exist "C:\anaconda3\python.exe" set "PYTHON_CMD=C:\anaconda3\python.exe"
if not defined PYTHON_CMD if exist "C:\miniconda3\python.exe" set "PYTHON_CMD=C:\miniconda3\python.exe"

:: Priority 4: User AppData Local Python installations
if not defined PYTHON_CMD if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe" set "PYTHON_CMD=%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe"
if not defined PYTHON_CMD if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe" set "PYTHON_CMD=%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe"
if not defined PYTHON_CMD if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python310\python.exe" set "PYTHON_CMD=%USERPROFILE%\AppData\Local\Programs\Python\Python310\python.exe"
if not defined PYTHON_CMD if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python39\python.exe" set "PYTHON_CMD=%USERPROFILE%\AppData\Local\Programs\Python\Python39\python.exe"
if not defined PYTHON_CMD if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python38\python.exe" set "PYTHON_CMD=%USERPROFILE%\AppData\Local\Programs\Python\Python38\python.exe"

:: Priority 5: Common system Python paths
if not defined PYTHON_CMD if exist "C:\Python312\python.exe" set "PYTHON_CMD=C:\Python312\python.exe"
if not defined PYTHON_CMD if exist "C:\Python311\python.exe" set "PYTHON_CMD=C:\Python311\python.exe"
if not defined PYTHON_CMD if exist "C:\Python310\python.exe" set "PYTHON_CMD=C:\Python310\python.exe"

:: Priority 6: Scan all user directories for anaconda/miniconda/python
if not defined PYTHON_CMD (
    for /d %%u in ("%SystemDrive%\Users\*") do (
        if not defined PYTHON_CMD if exist "%%u\anaconda3\envs\py-gpu\python.exe" set "PYTHON_CMD=%%u\anaconda3\envs\py-gpu\python.exe"
        if not defined PYTHON_CMD if exist "%%u\miniconda3\envs\py-gpu\python.exe" set "PYTHON_CMD=%%u\miniconda3\envs\py-gpu\python.exe"
        if not defined PYTHON_CMD if exist "%%u\anaconda3\python.exe" set "PYTHON_CMD=%%u\anaconda3\python.exe"
        if not defined PYTHON_CMD if exist "%%u\miniconda3\python.exe" set "PYTHON_CMD=%%u\miniconda3\python.exe"
        if not defined PYTHON_CMD if exist "%%u\AppData\Local\Programs\Python\Python312\python.exe" set "PYTHON_CMD=%%u\AppData\Local\Programs\Python\Python312\python.exe"
        if not defined PYTHON_CMD if exist "%%u\AppData\Local\Programs\Python\Python311\python.exe" set "PYTHON_CMD=%%u\AppData\Local\Programs\Python\Python311\python.exe"
        if not defined PYTHON_CMD if exist "%%u\AppData\Local\Programs\Python\Python310\python.exe" set "PYTHON_CMD=%%u\AppData\Local\Programs\Python\Python310\python.exe"
    )
)

:: Priority 7: Fallback to system path python (ignoring WindowsApps store shims)
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
set "PYTHON_EXE=!PYTHON_CMD!"
echo PYTHON_EXE=!PYTHON_CMD!> "%~dp0.env.local"
echo      Saved Python configuration to .env.local

:: Install python requirements
echo.
echo [*] Installing and verifying Python requirements from requirements.txt...
"!PYTHON_CMD!" -m pip install -r "%~dp0requirements.txt"
"!PYTHON_CMD!" -m pip install roboflow

echo.
echo [*] Testing Python modules:
"!PYTHON_CMD!" -c "import roboflow; print('     [+] Roboflow verified: version', getattr(roboflow, '__version__', 'ready'))" 2>nul || echo      [!] Warning: Failed to import roboflow.
"!PYTHON_CMD!" -c "import fastapi, uvicorn, PIL, requests, pydantic, psutil; print('     [+] Backend libraries (FastAPI, PIL, Requests) verified.')" 2>nul || echo      [!] Warning: Some backend libraries failed to import.
"!PYTHON_CMD!" -c "import torch; print('     [+] PyTorch verified: CUDA available =', torch.cuda.is_available())" 2>nul || echo      [i] Info: PyTorch not installed yet. (Optional: install with CUDA for local GPU training)

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

:: 4. Ensure env_hub and .env exist for Resend API
echo.
echo [*] Checking env_hub configuration...
if not exist "%~dp0..\env_hub" (
    echo [*] Creating env_hub directory at "%~dp0..\env_hub"...
    mkdir "%~dp0..\env_hub"
)
if not exist "%~dp0..\env_hub\.env" (
    echo [*] Initializing .env in env_hub for Resend API keys...
    (
        echo # IRnow Workspace Environment Configuration
        echo # Insert your Resend API Key below for email notifications ^(Password Reset, Training Alerts^)
        echo RESEND_API_KEY=
        echo RESEND_FROM_EMAIL=no-reply@hub.hafizimalik.com
        echo APP_URL=https://hub.hafizimalik.com
    ) > "%~dp0..\env_hub\.env"
    echo      Created "%~dp0..\env_hub\.env". You can fill RESEND_API_KEY anytime.
) else (
    echo      [+] env_hub\.env already exists.
)

echo.
echo =====================================================================
echo [SUCCESS] Office PC Setup is Complete!
echo You can now double-click "start_hub.bat" anytime to launch everything.
echo =====================================================================
echo.
pause
