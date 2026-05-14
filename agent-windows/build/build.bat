@echo off
:: ============================================================
:: RMM Agent - Build Script
:: Produit : dist\rmm-agent.exe  +  rmm-agent-setup.msi
::
:: Prérequis (à installer une seule fois) :
::   1. Node.js >= 18  (https://nodejs.org)
::   2. pkg            : npm install -g pkg
::   3. .NET SDK >= 6  (https://dot.net)
::   4. WiX v4         : dotnet tool install -g wix
::                        wix extension add WixToolset.Util.wixext
:: ============================================================

title RMM Agent - Build

cd /d "%~dp0.."

echo.
echo ╔════════════════════════════════════════╗
echo ║     RMM Agent Build Pipeline           ║
echo ╚════════════════════════════════════════╝
echo.

:: ── 1. Vérification des outils ───────────────────────────────
echo [1/4] Vérification des outils...

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   ERREUR : Node.js introuvable. Installez depuis https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo   Node.js : %%v

where pkg >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   pkg non trouvé - installation...
    npm install -g pkg
)
for /f "tokens=*" %%v in ('pkg --version 2^>nul') do echo   pkg    : %%v

where wix >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   WiX non trouvé - installation via dotnet...
    dotnet nuget add source https://api.nuget.org/v3/index.json --name nuget.org 2>nul
    dotnet tool install -g wix --version 5.0.2
)
echo   WiX    : OK
echo.

:: ── 2. Build EXE (pkg) ───────────────────────────────────────
echo [2/4] Compilation de l'agent (pkg)...

if not exist build\dist mkdir build\dist

pkg agent.js ^
    --target node18-win-x64 ^
    --output build\dist\rmm-agent.exe ^
    --compress GZip ^
    --no-bytecode

if %ERRORLEVEL% NEQ 0 (
    echo   ERREUR lors de la compilation.
    pause & exit /b 1
)

echo   OK : build\dist\rmm-agent.exe
for %%F in (build\dist\rmm-agent.exe) do echo   Taille : %%~zF octets
echo.

:: ── 3. Build MSI (WiX) ───────────────────────────────────────
echo [3/4] Construction du MSI (WiX)...

cd build

wix build installer.wxs ^
    -out rmm-agent-setup.msi ^
    -arch x64

if %ERRORLEVEL% NEQ 0 (
    echo   ERREUR lors de la construction du MSI.
    cd ..
    pause & exit /b 1
)

cd ..
echo   OK : build\rmm-agent-setup.msi
for %%F in (build\rmm-agent-setup.msi) do echo   Taille : %%~zF octets
echo.

:: ── 4. Résumé ────────────────────────────────────────────────
echo [4/4] Build terminé !
echo.
echo   Fichiers produits :
echo     build\dist\rmm-agent.exe   (executable autonome)
echo     build\rmm-agent-setup.msi  (installeur MSI)
echo.
echo   Prochaines étapes :
echo     - Pour signer  : build\sign.bat (nécessite certificat)
echo     - Pour tester  : msiexec /i build\rmm-agent-setup.msi
echo.
pause
