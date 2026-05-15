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

:: ── 2. Tuer le watchdog start-agent.bat (boucle cmd.exe) ────────────────────
echo [2/5] Arret du watchdog start-agent.bat...
:: Tuer via WMIC les cmd.exe qui ont "start-agent" dans leur ligne de commande
wmic process where "name='cmd.exe' and commandline like '%%start-agent%%'" delete > nul 2>&1
:: Aussi tuer via le titre de fenetre defini dans start-agent.bat
taskkill /f /fi "WINDOWTITLE eq RMM Agent*" > nul 2>&1
:: Attendre que les processus soient bien morts
timeout /t 2 /nobreak > nul
echo        OK.

:: ── 3. Tuer tous les node.exe en cours ──────────────────────────────────────
echo [3/5] Arret de tous les processus node.exe...
taskkill /f /im node.exe > nul 2>&1
timeout /t 2 /nobreak > nul
:: Verifier qu'il n'en reste plus
tasklist /fi "imagename eq node.exe" 2>nul | findstr /i "node.exe" > nul
if %ERRORLEVEL% EQU 0 (
    echo        Encore des node.exe, nouvelle tentative...
    taskkill /f /im node.exe > nul 2>&1
    timeout /t 2 /nobreak > nul
)
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
