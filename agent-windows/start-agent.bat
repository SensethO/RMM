@echo off
title RMM Agent - Watchdog
cd /d "%~dp0"

:restart
echo.
echo [%DATE% %TIME%] Demarrage de l'agent RMM...
node agent.js
set EXIT_CODE=%ERRORLEVEL%
echo.
echo [%DATE% %TIME%] Agent arrete (code: %EXIT_CODE%).
if %EXIT_CODE% EQU 0 (
    echo Arret volontaire - pas de redemarrage.
    pause
    exit /b 0
)
echo Redemarrage dans 10 secondes... (Ctrl+C pour annuler)
timeout /t 10 /nobreak > nul
goto restart
