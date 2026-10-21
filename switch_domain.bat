@echo off
setlocal enabledelayedexpansion

title IRnow Workspace - Domain Switcher

echo =====================================================================
echo                IRnow Workspace - DOMAIN CONFIGURATION TOOL
echo =====================================================================
echo.

set "ENV_DIR=%~dp0..\env_hub"
set "ENV_FILE=%ENV_DIR%\.env"

if not exist "%ENV_DIR%" (
    mkdir "%ENV_DIR%"
)

:: Read existing values from .env if present
set "EXISTING_KEY="
set "CURRENT_EMAIL="
set "CURRENT_URL="

if exist "%ENV_FILE%" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
        set "KEY_NAME=%%A"
        set "KEY_VAL=%%B"
        if /i "!KEY_NAME!"=="RESEND_API_KEY" set "EXISTING_KEY=!KEY_VAL!"
        if /i "!KEY_NAME!"=="RESEND_FROM_EMAIL" set "CURRENT_EMAIL=!KEY_VAL!"
        if /i "!KEY_NAME!"=="APP_URL" set "CURRENT_URL=!KEY_VAL!"
    )
)

echo Current Settings:
echo   - App URL:    !CURRENT_URL!
echo   - From Email: !CURRENT_EMAIL!
echo   - API Key:    !EXISTING_KEY!
echo.
echo ---------------------------------------------------------------------

set "TARGET_DOMAIN=%~1"

if "%TARGET_DOMAIN%"=="" (
    echo Select target domain or type your custom domain:
    echo   [1] hub.hafizimalik.com
    echo   [2] hub.irnow.com.my
    echo   [3] Custom domain / subdomain
    echo.
    set /p "CHOICE=Enter choice [1, 2, 3 or domain name]: "

    if "!CHOICE!"=="1" (
        set "TARGET_DOMAIN=hub.hafizimalik.com"
    ) else if "!CHOICE!"=="2" (
        set "TARGET_DOMAIN=hub.irnow.com.my"
    ) else if "!CHOICE!"=="3" (
        set /p "TARGET_DOMAIN=Enter full domain/subdomain (e.g. hub.irnow.com.my): "
    ) else (
        set "TARGET_DOMAIN=!CHOICE!"
    )
)

:: Clean target domain (strip https://, http://, trailing slashes)
set "TARGET_DOMAIN=%TARGET_DOMAIN:https://=%"
set "TARGET_DOMAIN=%TARGET_DOMAIN:http://=%"
if "%TARGET_DOMAIN:~-1%"=="/" set "TARGET_DOMAIN=%TARGET_DOMAIN:~0,-1%"

if "%TARGET_DOMAIN%"=="" (
    echo [ERROR] No domain specified. Aborting.
    pause
    exit /b 1
)

set "NEW_EMAIL=no-reply@%TARGET_DOMAIN%"
set "NEW_URL=https://%TARGET_DOMAIN%"

echo.
echo [*] Updating configuration to:
echo       Domain:     %TARGET_DOMAIN%
echo       APP_URL:    %NEW_URL%
echo       From Email: %NEW_EMAIL%

:: Write to .env
(
    echo # IRnow Workspace Environment Configuration
    echo # Auto-configured via switch_domain.bat on %DATE% %TIME%
    echo RESEND_API_KEY=%EXISTING_KEY%
    echo RESEND_FROM_EMAIL=%NEW_EMAIL%
    echo APP_URL=%NEW_URL%
) > "%ENV_FILE%"

echo.
echo =====================================================================
echo [SUCCESS] Domain updated successfully in:
echo           "%ENV_FILE%"
echo =====================================================================
echo.
echo Checklist for %TARGET_DOMAIN%:
echo.
echo  1. Cloudflare Tunnel:
echo     - In Cloudflare Zero Trust ^> Tunnels ^> Public Hostnames:
echo       Add/update hostname: %TARGET_DOMAIN% -^> http://localhost:3000
echo.
echo  2. Resend Dashboard:
echo     - Go to https://resend.com/domains
echo     - Add domain: %TARGET_DOMAIN%
echo     - Copy the DNS records (DKIM, SPF, DMARC)
echo.
echo  3. Cloudflare DNS:
echo     - Add the records given by Resend to Cloudflare DNS
echo     - Make sure CNAME / DKIM records are set to 'DNS Only' (Grey cloud)
echo.
echo  4. Restart Hub:
echo     - Restart your hub (start_hub.bat) to apply the new domain configuration.
echo.
echo =====================================================================
pause

