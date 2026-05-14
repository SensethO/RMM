@echo off
title RMM Agent - Watchdog
cd /d "%~dp0"

set LOGFILE=%~dp0agent.log

echo [%DATE% %TIME%] ===== Watchdog demarre ===== >> "%LOGFILE%"

:restart
echo.
echo [%DATE% %TIME%] Demarrage de l'agent RMM...
echo [%DATE% %TIME%] Demarrage >> "%LOGFILE%"

node agent.js >> "%LOGFILE%" 2>&1
set EXIT_CODE=%ERRORLEVEL%

echo [%DATE% %TIME%] Agent arrete (code: %EXIT_CODE%) >> "%LOGFILE%"
echo.
echo [%DATE% %TIME%] Agent arrete (code: %EXIT_CODE%).

if %EXIT_CODE% EQU 0 (
    echo Arret volontaire - pas de redemarrage.
    echo [%DATE% %TIME%] Arret volontaire. >> "%LOGFILE%"
    pause
    exit /b 0
)
echo Redemarrage dans 10 secondes... (Ctrl+C pour annuler)
timeout /t 10 /nobreak > nul
goto restart
