@echo off
:: =============================================================================
:: RMM Agent - Migration vers icone systray
:: Supprime l'ancienne tache planifiee (boucle batch) et installe la tray
:: Executer en tant qu'Administrateur
:: =============================================================================
title RMM Agent - Migration vers Tray Icon
cd /d "%~dp0"

echo.
echo ===================================================
echo   RMM Agent - Migration vers icone systray
echo ===================================================
echo.

:: ── 1. Arreter et supprimer l'ancienne tache planifiee ──────────────────────
echo [1/4] Suppression de l'ancienne tache planifiee RMM-Agent...
schtasks /end    /tn "RMM-Agent" > nul 2>&1
schtasks /delete /tn "RMM-Agent" /f > nul 2>&1
echo        OK.

:: ── 2. Tuer tous les node.exe en cours ──────────────────────────────────────
echo [2/4] Arret des processus node.exe en cours...
taskkill /f /im node.exe > nul 2>&1
timeout /t 2 /nobreak > nul
echo        OK.

:: ── 3. Installer la nouvelle tache planifiee (lance start-agent.vbs au boot) -
echo [3/4] Installation de la nouvelle tache (tray au demarrage)...
set TASK_NAME=RMM-Agent-Tray
set VBS_PATH=%~dp0start-agent.vbs

:: Supprimer si deja existante
schtasks /delete /tn "%TASK_NAME%" /f > nul 2>&1

:: Creer la tache : au demarrage, 30s de delai, utilisateur courant
schtasks /create /tn "%TASK_NAME%" ^
    /tr "wscript.exe \"%VBS_PATH%\"" ^
    /sc onstart ^
    /delay 0000:30 ^
    /ru "%USERNAME%" ^
    /rl HIGHEST /f > nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo        Tache "%TASK_NAME%" installee.
) else (
    echo        AVERTISSEMENT : echec creation tache. Verifiez les droits admin.
)

:: ── 4. Lancer immediatement la tray ─────────────────────────────────────────
echo [4/4] Lancement de l'icone systray...
start "" wscript.exe "%VBS_PATH%"
timeout /t 2 /nobreak > nul

echo.
echo ===================================================
echo   Migration terminee !
echo   - Ancienne tache batch : SUPPRIMEE
echo   - Nouvelle tache tray  : INSTALLEE (demarre au boot)
echo   - Tray lancee maintenant : verifiez la barre des taches
echo ===================================================
echo.
pause
