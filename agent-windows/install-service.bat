@echo off
:: Installe l'agent RMM comme tâche planifiée Windows
:: Démarre au boot, redémarre automatiquement si crash
:: Doit être exécuté en tant qu'Administrateur

title Installation RMM Agent - Service
cd /d "%~dp0"

:: Trouver node.exe
for /f "tokens=*" %%i in ('where node 2^>nul') do set NODE_EXE=%%i
if "%NODE_EXE%"=="" (
    echo ERREUR: Node.js introuvable. Installez Node.js d'abord.
    pause
    exit /b 1
)
echo Node.js trouvé : %NODE_EXE%

set AGENT_PATH=%~dp0agent.js
set TASK_NAME=RMM-Agent
set WRAPPER=%~dp0start-agent.bat

echo.
echo Installation de la tâche planifiée "%TASK_NAME%"...
echo   Script  : %WRAPPER%
echo   Node    : %NODE_EXE%
echo.

:: Supprimer l'ancienne tâche si elle existe
schtasks /delete /tn "%TASK_NAME%" /f > nul 2>&1

:: Créer la tâche : au démarrage de Windows, sous le compte SYSTEM, niveau élevé
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "\"%WRAPPER%\"" ^
  /sc onstart ^
  /delay 0000:30 ^
  /ru "SYSTEM" ^
  /rl HIGHEST ^
  /f ^
  /settings /restartcount:99 /restartinterval:PT1M

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Installation reussie !
    echo L'agent demarrera automatiquement au prochain boot.
    echo.
    echo Demarrage immediat...
    schtasks /run /tn "%TASK_NAME%"
    echo L'agent tourne maintenant en arriere-plan.
) else (
    echo.
    echo ERREUR lors de l'installation. Verifiez les droits administrateur.
)

echo.
pause
