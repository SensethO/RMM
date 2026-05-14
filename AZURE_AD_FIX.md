# Correction Azure AD - Ajouter l'URL de Redirection

## 🔧 Le Problème

Erreur: **"No reply address is registered for the application"**

L'enregistrement Azure AD n'a pas l'URL de redirection configurée pour le frontend.

## ✅ La Solution (5 minutes)

### URL à Ajouter:
```
https://frontend-n9fcc4uxi-sensethos-projects.vercel.app
```

### Étapes:

1. **Allez au portail Azure:**
   ```
   https://portal.azure.com
   ```

2. **Naviguez à Azure AD:**
   - Menu de gauche → "Azure Active Directory"
   - ou recherchez "App registrations"

3. **Trouvez l'app "SensethO RMM":**
   - Client ID: `5572b04e-78e5-440e-a36e-919f07ff8956`

4. **Cliquez sur l'app**

5. **Dans le menu de gauche, cliquez: "Authentication"**

6. **Sous "Platform configurations", cherchez "Web":**
   - Si absent, cliquez "+ Add a platform" → "Web"

7. **Dans la section "Redirect URIs", cliquez "Add URI":**
   ```
   https://frontend-n9fcc4uxi-sensethos-projects.vercel.app
   ```

8. **Cliquez "Save"**

### Alternative: PowerShell

Si vous avez l'Azure PowerShell module:

```powershell
# Connect-AzureAD

# Set redirect URI
$app = Get-AzureADApplication -Filter "AppId eq '5572b04e-78e5-440e-a36e-919f07ff8956'"

$webApp = $app.PublicClient = $false
$webApp.ReplyUrls.Add("https://frontend-n9fcc4uxi-sensethos-projects.vercel.app")

Set-AzureADApplication -ObjectId $app.ObjectId -ReplyUrls $webApp.ReplyUrls
```

## ✨ Après la Configuration

1. Attendez ~1-2 minutes (propagation Azure AD)
2. Rafraîchissez le navigateur
3. Essayez de vous connecter à nouveau:
   ```
   https://frontend-n9fcc4uxi-sensethos-projects.vercel.app
   ```

## 🆘 Si ça Ne Marche Pas

**Vérifiez:**
- ✅ URL exacte copiée sans espaces
- ✅ Application correcte (ID: 5572b04e-78e5-440e-a36e-919f07ff8956)
- ✅ Cliquez "Save" après ajout
- ✅ Attendez 1-2 minutes
- ✅ Videz le cache du navigateur (Ctrl+Shift+Delete)
- ✅ Essayez une navigation privée

## 📋 Credentials Azure AD

- **Tenant ID:** 56de879c-d3d0-4bb3-8230-35477d85a1f0
- **Client ID:** 5572b04e-78e5-440e-a36e-919f07ff8956
- **Client Secret:** (stocké sécurisé dans Vercel)

---

**C'est tout!** Après cette étape, la connexion Azure AD devrait fonctionner! 🚀
