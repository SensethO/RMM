# RMM Agent - Packaging MSI

## Ce que fait le build

```
agent.js  ──(pkg)──►  rmm-agent.exe  ──(WiX)──►  rmm-agent-setup.msi  ──(signtool)──►  .msi signé
```

| Étape | Outil | Ce que ça produit |
|-------|-------|-------------------|
| 1 | `pkg` | `dist/rmm-agent.exe` — Node.js embarqué, aucune dépendance sur la machine cible |
| 2 | WiX v4 | `rmm-agent-setup.msi` — installeur standard Windows |
| 3 | `signtool` | MSI + EXE signés numériquement (anti-SmartScreen) |

---

## Prérequis (installation unique)

### 1. Node.js >= 18
https://nodejs.org

### 2. pkg (bundler Node.js → EXE)
```bat
npm install -g pkg
```

### 3. .NET SDK >= 6
https://dot.net

### 4. WiX Toolset v4
```bat
dotnet tool install -g wix
wix extension add WixToolset.Util.wixext
```

### 5. Windows SDK (pour signtool)
https://developer.microsoft.com/windows/downloads/windows-sdk/
> Cocher uniquement "Windows SDK Signing Tools"

---

## Lancer le build

```bat
build\build.bat
```

Produit :
- `build\dist\rmm-agent.exe`
- `build\rmm-agent-setup.msi`

---

## Signer le MSI (recommandé pour la distribution)

```bat
build\sign.bat [EMPREINTE_CERTIFICAT]
```

### Obtenir un certificat de signature de code

| Fournisseur | Type | Prix/an | Délai SmartScreen |
|-------------|------|---------|-------------------|
| [DigiCert](https://www.digicert.com/code-signing/) | EV | ~490€ | **Immédiat** |
| [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing) | EV | ~350€ | **Immédiat** |
| [SSL.com](https://www.ssl.com/certificates/ev-code-signing/) | EV | ~250€ | **Immédiat** |
| DigiCert/Sectigo | OV | ~200€ | ~quelques semaines |

> **EV recommandé** : SmartScreen (l'alerte "Windows a protégé votre PC") disparaît **immédiatement** avec un certificat EV. Avec un certificat OV, il faut attendre que la réputation se construise (volume de téléchargements).

### Procédure EV
1. Commander le certificat → vérification légale de votre entreprise (~5-10 jours)
2. Recevoir le token USB (livré physiquement)
3. Brancher le token
4. Lancer `sign.bat VOTRE_EMPREINTE`

---

## Ce que fait le MSI sur la machine cible

- Installe `rmm-agent.exe` dans `C:\Program Files\SensethO\RMM Agent\`
- Crée une tâche planifiée `RMM-Agent` (SYSTEM, HIGHEST, démarrage Windows + 30s)
- Démarre immédiatement l'agent
- Ajoute les clés de registre pour l'uninstalleur Windows
- **Désinstallation** : supprime la tâche + les fichiers proprement

---

## Validation Microsoft (optionnel / gratuit)

Si vous ne voulez pas payer un certificat EV tout de suite :

1. Signez avec un certificat OV standard
2. Soumettez le fichier sur [Microsoft Security Intelligence](https://www.microsoft.com/en-us/wdsi/filesubmission)
3. Délai : 1-3 jours ouvrés
4. Microsoft whitelist le hash SHA256 de votre fichier dans Defender

---

## Tester l'installeur

```bat
:: Installer
msiexec /i build\rmm-agent-setup.msi /l*v install.log

:: Vérifier la tâche
schtasks /query /tn "RMM-Agent" /fo list

:: Désinstaller
msiexec /x build\rmm-agent-setup.msi
```
