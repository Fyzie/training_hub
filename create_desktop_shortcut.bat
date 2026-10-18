@echo off
setlocal
cd /d "%~dp0"
echo [*] Creating Desktop shortcut for IRnow Hub...

set "PS_EXE=powershell.exe"
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

"%PS_EXE%" -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut([System.IO.Path]::Combine($desktop, 'IRnow Hub.lnk')); $s.TargetPath = [System.IO.Path]::Combine('%~dp0', 'start_hub.bat'); $s.WorkingDirectory = '%~dp0'; $s.Description = 'IRnow Hub Workstation Portal'; $s.Save()"

echo [SUCCESS] Shortcut created on your Desktop: "IRnow Hub"
ping 127.0.0.1 -n 3 >nul

