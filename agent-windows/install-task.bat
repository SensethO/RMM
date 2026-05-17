@echo off
REM Install RMM Agent as Windows Scheduled Task
cd /d "%~dp0"

echo Killing any running node processes...
taskkill /IM node.exe /F 2>nul

echo Removing old scheduled task...
schtasks /delete /tn "RMM-Agent" /f 2>nul

echo Creating RMM Agent scheduled task...
schtasks /create /tn "RMM-Agent" /tr "%cd%\start-agent.bat" /sc onstart /delay 0000:30 /ru SYSTEM /rl HIGHEST /f

echo.
echo Task created. Checking status...
schtasks /query /tn "RMM-Agent" /fo list

echo.
echo Starting agent now...
schtasks /run /tn "RMM-Agent"

echo.
echo Done! Agent will start automatically on next reboot.
pause
