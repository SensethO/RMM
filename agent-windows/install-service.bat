@echo off
:: Installe l'agent RMM comme tache planifiee Windows
:: Demarre au boot, redemarrage gere par start-agent.bat (boucle watchdog)
:: Doit etre execute en tant qu'Administrateur

title Installation RMM Agent - Service
cd /d "%~dp0"

:: Trouver node.exe
for /f "tokens=*" %%i in ('where node 2^>nul') do set NODE_EXE=%%i
if "%NODE_EXE%"=="" (
    echo ERREUR: Node.js introuvable. Installez Node.js d'abord.
    pause
    exit /b 1
)
echo Node.js trouve : %NODE_EXE%

set TASK_NAME=RMM-Agent
set WRAPPER=%~dp0start-agent.bat

echo.
echo Installation de la tache planifiee "%TASK_NAME%"...
echo   Script : %WRAPPER%
echo.

:: Supprimer l'ancienne tache si elle existe
schtasks /delete /tn "%TASK_NAME%" /f > nul 2>&1

:: Creer la tache : au demarrage de Windows, 30s de delai, compte SYSTEM
schtasks /create /tn "%TASK_NAME%" /tr "\"%WRAPPER%\"" /sc onstart /delay 0000:30 /ru "SYSTEM" /rl HIGHEST /f

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Installation reussie !
    echo L'agent demarrera automatiquement au prochain boot.
    echo.
    echo Demarrage immediat...
    schtasks /run /tn "%TASK_NAME%"
    echo L'agent tourne maintenant en arriere-plan.
    echo.
    echo Pour verifier : schtasks /query /tn "%TASK_NAME%" /fo list
) else (
    echo.
    echo ERREUR lors de l'installation. Verifiez les droits administrateur.
)

echo.
pause
