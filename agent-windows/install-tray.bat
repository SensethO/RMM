@echo off
:: =============================================================================
:: RMM Agent - Migration vers icone systray
:: Supprime l'ancienne tache planifiee (boucle batch) et installe la tray
:: Executer en tant qu'Administrateur
:: =============================================================================
title RMM Agent - Migration vers Tray Icon
cd /d "%~dp0"
setlocal enabledelayedexpansion

echo.
echo ===================================================
echo   RMM Agent - Migration vers icone systray
echo ===================================================
echo.

:: ── 1. Arreter et supprimer TOUTES les anciennes taches RMM ─────────────────
echo [1/5] Suppression des anciennes taches planifiees...
schtasks /end    /tn "RMM-Agent"      > nul 2>&1
schtasks /delete /tn "RMM-Agent" /f   > nul 2>&1
schtasks /end    /tn "RMM-Agent-Tray" > nul 2>&1
schtasks /delete /tn "RMM-Agent-Tray" /f > nul 2>&1
echo        OK.

:: ── 2. Tout arreter proprement ───────────────────────────────────────────────
echo [2/5] Arret de tous les processus RMM...

:: Tuer les tray PowerShell existantes
wmic process where "name='powershell.exe' and commandline like '%%tray.ps1%%'" delete > nul 2>&1
wmic process where "name='powershell.exe' and commandline like '%%tray%%'"     delete > nul 2>&1

:: Tuer les lanceurs wscript (start-agent.vbs)
wmic process where "name='wscript.exe' and commandline like '%%start-agent%%'" delete > nul 2>&1

:: Tuer le watchdog start-agent.bat (boucle cmd.exe)
wmic process where "name='cmd.exe' and commandline like '%%start-agent%%'" delete > nul 2>&1
taskkill /f /fi "WINDOWTITLE eq RMM Agent*" > nul 2>&1

timeout /t 2 /nobreak > nul

:: Tuer tous les node.exe
taskkill /f /im node.exe > nul 2>&1
timeout /t 2 /nobreak > nul
taskkill /f /im node.exe > nul 2>&1
timeout /t 1 /nobreak > nul
echo        OK.

:: ── 4. Installer la nouvelle tache planifiee (tray au boot) ─────────────────
echo [4/5] Installation de la nouvelle tache au demarrage...
set TASK_NAME=RMM-Agent-Tray
set VBS_PATH=%~dp0start-agent.vbs

schtasks /create /tn "%TASK_NAME%" ^
    /tr "wscript.exe \"%VBS_PATH%\"" ^
    /sc onstart ^
    /delay 0000:30 ^
    /ru "%USERNAME%" ^
    /rl HIGHEST /f > nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo        Tache "%TASK_NAME%" installee avec succes.
) else (
    echo        AVERTISSEMENT : echec creation tache. Verifiez les droits admin.
)

:: ── 5. Lancer immediatement la tray ─────────────────────────────────────────
echo [5/5] Lancement de l'icone systray...
start "" wscript.exe "%VBS_PATH%"
timeout /t 3 /nobreak > nul

echo.
echo ===================================================
echo   Migration terminee !
echo   - Watchdog bat    : ARRETE
echo   - Tous node.exe   : ARRETES
echo   - Tache au boot   : RMM-Agent-Tray (start-agent.vbs)
echo   - Tray            : LANCEE - verifiez la barre des taches
echo ===================================================
echo.
echo Pour verifier la tache : schtasks /query /tn "RMM-Agent-Tray" /fo list
echo.
pause
