@echo off
:: ============================================================
:: RMM Agent - Script de Signature de Code
::
:: Prérequis :
::   1. Certificat de signature de code installé (OV ou EV)
::      Fournisseurs : DigiCert, Sectigo, SSL.com, GlobalSign
::      Coût : ~200-700 €/an  |  EV recommandé (SmartScreen instantané)
::
::   2. signtool.exe disponible via Windows SDK (gratuit) :
::      https://developer.microsoft.com/windows/downloads/windows-sdk/
::      Chemin typique : C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe
::
::   3. Pour EV : le token USB doit être branché
::
:: Usage : sign.bat [thumbprint_du_certificat]
:: ============================================================

title RMM Agent - Code Signing

cd /d "%~dp0.."

:: ── Configuration ────────────────────────────────────────────
:: Remplacez par l'empreinte de votre certificat (visible dans certmgr.msc)
set CERT_THUMBPRINT=%1
if "%CERT_THUMBPRINT%"=="" (
    echo.
    echo Usage : sign.bat [thumbprint]
    echo Exemple : sign.bat A1B2C3D4E5F6...
    echo.
    echo Pour trouver l'empreinte de votre certificat :
    echo   1. Ouvrez certmgr.msc
    echo   2. Personnel ^> Certificats
    echo   3. Double-cliquez sur votre certificat de signature
    echo   4. Onglet "Détails" ^> champ "Empreinte"
    echo.
    pause & exit /b 1
)

:: Timestamp servers (essayez plusieurs si l'un est indisponible)
set TIMESTAMP_URL=http://timestamp.digicert.com
:: set TIMESTAMP_URL=http://timestamp.sectigo.com
:: set TIMESTAMP_URL=http://timestamp.globalsign.com/scripts/timstamp.dll

:: Chemin signtool (Windows SDK)
set SIGNTOOL="C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe"
if not exist %SIGNTOOL% (
    set SIGNTOOL="C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe"
)
if not exist %SIGNTOOL% (
    where signtool >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo ERREUR : signtool.exe introuvable.
        echo Installez le Windows SDK : https://developer.microsoft.com/windows/downloads/windows-sdk/
        pause & exit /b 1
    )
    set SIGNTOOL=signtool
)

echo.
echo ╔════════════════════════════════════════╗
echo ║     RMM Agent - Code Signing           ║
echo ╚════════════════════════════════════════╝
echo.
echo   Certificat : %CERT_THUMBPRINT%
echo   Timestamp  : %TIMESTAMP_URL%
echo.

:: ── Signer l'EXE ────────────────────────────────────────────
echo [1/2] Signature de rmm-agent.exe...

%SIGNTOOL% sign ^
    /sha1 "%CERT_THUMBPRINT%" ^
    /tr "%TIMESTAMP_URL%" ^
    /td SHA256 ^
    /fd SHA256 ^
    /d "RMM Agent" ^
    /du "https://github.com/SensethO/RMM" ^
    "build\dist\rmm-agent.exe"

if %ERRORLEVEL% NEQ 0 (
    echo   ERREUR lors de la signature de l'EXE.
    pause & exit /b 1
)
echo   OK : rmm-agent.exe signé.

:: ── Signer le MSI ────────────────────────────────────────────
echo [2/2] Signature de rmm-agent-setup.msi...

%SIGNTOOL% sign ^
    /sha1 "%CERT_THUMBPRINT%" ^
    /tr "%TIMESTAMP_URL%" ^
    /td SHA256 ^
    /fd SHA256 ^
    /d "RMM Agent Installer" ^
    /du "https://github.com/SensethO/RMM" ^
    "build\rmm-agent-setup.msi"

if %ERRORLEVEL% NEQ 0 (
    echo   ERREUR lors de la signature du MSI.
    pause & exit /b 1
)
echo   OK : rmm-agent-setup.msi signé.

:: ── Vérification ────────────────────────────────────────────
echo.
echo [Vérification des signatures]
%SIGNTOOL% verify /pa /v "build\dist\rmm-agent.exe"
%SIGNTOOL% verify /pa /v "build\rmm-agent-setup.msi"

echo.
echo ✓ Signature terminée avec succès !
echo.
echo   build\dist\rmm-agent.exe    → signé
echo   build\rmm-agent-setup.msi   → signé
echo.
echo   Le MSI peut maintenant être distribué.
echo   SmartScreen reconnaîtra automatiquement un certificat EV.
echo.
pause
