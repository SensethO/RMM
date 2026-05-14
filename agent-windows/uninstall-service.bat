@echo off
title Désinstallation RMM Agent
set TASK_NAME=RMM-Agent

echo Arrêt et suppression de la tâche "%TASK_NAME%"...
schtasks /end /tn "%TASK_NAME%" > nul 2>&1
schtasks /delete /tn "%TASK_NAME%" /f

if %ERRORLEVEL% EQU 0 (
    echo Tâche supprimée avec succès.
) else (
    echo Tâche introuvable ou déjà supprimée.
)
pause
