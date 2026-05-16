# Azure AD Security Audit & Permission Reduction

## Executive Summary

**Current Situation:** Your RMM app likely has excessive Azure AD permissions that aren't needed for core functionality.

**Goal:** Reduce to minimum required permissions (Least Privilege Principle)

**Impact:** Improved security without breaking functionality

---

## Current Unnecessary Permissions (REMOVE)

These permissions should be **REMOVED** as they're not used:

| Permission | Scope | Why Remove |
|---|---|---|
| `Mail.Read` | Graph API | Not used - app doesn't read emails |
| `DeviceManagementManagedDevices.Read.All` | Graph API | Not needed - devices managed by agents, not Intune |
| `Directory.Read.All` | Graph API | Overkill - only need current user + optional group membership |
| `User.ReadWrite.All` | Graph API | Read-only is sufficient |
| `Application.Read.All` | Graph API | Not used |
| `Organization.Read.All` | Graph API | Not used |
| Any `Device` permissions except `Device.Read` | Graph API | Agent manages devices, not Azure |

---

## Required Minimal Permissions (KEEP)

These are the **ONLY** permissions you need:

### Delegated Permissions (what users grant)
| Permission | Scope | Why Keep |
|---|---|---|
| `openid` | OpenID Connect | Required - identifies user |
| `profile` | OpenID Connect | Required - gets user name/picture |
| `email` | OpenID Connect | Required - gets user email |
| `User.Read` | Graph API | Required - read current user profile |

### Application Permissions (optional, if using groups for super-admin)
| Permission | Scope | Why Keep |
|---|---|---|
| `Directory.Read.All` | Graph API | **ONLY IF** using Azure AD groups for super-admin access |

---

## Step-by-Step: Reduce Permissions

### Method 1: Azure Portal (Visual, Recommended)

#### Step 1: Navigate to App Registration
1. Go to **Azure Portal** → https://portal.azure.com
2. Search for **"App registrations"**
3. Find your app: **RMM** (or whatever name you used)
4. Click on it to open

#### Step 2: Remove API Permissions
1. In the app, click **API permissions** (left sidebar)
2. You'll see a list of currently requested permissions
3. For each permission you want to remove:
   - Click **...** (three dots) next to it
   - Select **Remove permission**
   - Confirm the deletion

#### Step 3: List of Permissions to REMOVE
Go through and remove these (if present):
- [ ] `Mail.Read` (Microsoft Graph)
- [ ] `Mail.ReadWrite` (Microsoft Graph)
- [ ] `MailboxSettings.Read` (Microsoft Graph)
- [ ] `DeviceManagementManagedDevices.Read.All` (Microsoft Graph)
- [ ] `DeviceManagementManagedDevices.ReadWrite.All` (Microsoft Graph)
- [ ] `Directory.Read.All` (Microsoft Graph) - **ONLY IF** not using groups
- [ ] `Directory.ReadWrite.All` (Microsoft Graph)
- [ ] `User.ReadWrite.All` (Microsoft Graph)
- [ ] `User.ReadWrite` (Microsoft Graph)
- [ ] `Application.Read.All` (Microsoft Graph)
- [ ] `Organization.Read.All` (Microsoft Graph)
- [ ] Any `Device.*` permissions (except `Device.Read` if needed)

#### Step 4: Verify Required Permissions Remain
After removal, you should have **AT MINIMUM**:
- [ ] `openid` (OpenID Connect)
- [ ] `profile` (OpenID Connect)
- [ ] `email` (OpenID Connect)  
- [ ] `User.Read` (Microsoft Graph)
- [ ] `Directory.Read.All` (Microsoft Graph) - **ONLY if using Azure AD groups**

#### Step 5: Admin Consent
1. Click **Grant admin consent for [Tenant Name]**
2. This updates all users' consent with new minimal permissions
3. **Important:** Users already logged in need to log out and back in for changes to take effect

---

## Method 2: PowerShell Script (Automated)

If you have Azure CLI or PowerShell with Azure module installed:

```powershell
# Connect to Azure (requires login)
Connect-AzureAD

# Get your app
$app = Get-AzureADApplication -Filter "DisplayName eq 'RMM'"
$appId = $app.AppId

# Get current permissions
$permissions = Get-AzureADApplicationRequiredResourceAccess -ObjectId $app.ObjectId

# View current permissions
$permissions | ForEach-Object {
    Write-Host "Resource: $($_.ResourceAppId)"
    $_.ResourceAccess | ForEach-Object {
        Write-Host "  - $($_.Id) ($($_.Type))"
    }
}
```

---

## Verification: Check What Your App Needs

### Test 1: User Login
```
Before: Remove Mail.Read
Expected: User can still log in ✓
```

### Test 2: View Devices  
```
Before: Remove DeviceManagementManagedDevices.Read.All
Expected: Dashboard still shows devices (from RMM DB, not Intune) ✓
```

### Test 3: View Own Profile
```
Needs: User.Read
Expected: Can see logged-in user's email/name ✓
```

### Test 4: Super-Admin Group Check (optional)
```
Before: Remove Directory.Read.All (if not using groups)
Expected: Super-admin still works via token claims ✓
If using Azure AD groups: Keep Directory.Read.All
```

---

## Security Best Practices

After reducing permissions, implement these:

### 1. Token Configuration
Verify your app token includes necessary claims:
- `openid` → `oid` (user object ID)
- `email` → `email` claim
- `profile` → `name`, `given_name`, `family_name`
- `User.Read` → Can read `/me` endpoint

### 2. Scope Requests in Frontend
In your Azure AD MSAL configuration, request only what you need:

```javascript
// Good ✓
const scopes = ["openid", "profile", "email", "User.Read"];

// Bad ✗ (over-requesting)
const scopes = ["Mail.Read", "Directory.Read.All", "User.ReadWrite.All"];
```

### 3. Audit Azure AD Access
Regularly review:
1. Who has admin consent rights
2. Which apps have which permissions
3. Remove old/unused app registrations

### 4. Monitor Usage
Set up Azure AD alerts for:
- Multiple failed login attempts
- Unusual access patterns
- Admin activity on production apps

---

## Rollback (If Something Breaks)

If you remove a permission and something breaks:

1. **Quickly add it back:**
   - Go to **API permissions**
   - Click **Add a permission**
   - Search for the permission
   - Select it and **Add**

2. **Grant admin consent again**

3. **Test immediately**

---

## Checklist: Before vs After

### BEFORE (Current State - Too Permissive)
```
❌ Mail.Read
❌ Directory.Read.All (if not using groups)
❌ DeviceManagementManagedDevices.Read.All
❌ User.ReadWrite.All (when only Read needed)
❌ Application.Read.All
❌ Organization.Read.All
✓ User.Read
✓ openid
✓ profile
✓ email
```

### AFTER (Secure - Minimal)
```
✓ openid
✓ profile
✓ email
✓ User.Read
✓ Directory.Read.All (ONLY IF using Azure AD groups for super-admin)
```

**Reduction:** From 10+ permissions → 4-5 permissions ✅

---

## FAQ

### Q: Will users need to re-consent?
**A:** Yes, if you reduce delegated permissions. They'll see a consent prompt on next login. This is expected and secure.

### Q: What if the app stops working?
**A:** 
1. Check browser console for errors mentioning permissions
2. Check backend logs for API failures
3. Add back the permission if genuinely needed
4. Contact Microsoft support if unclear

### Q: Does super-admin still work after removing permissions?
**A:** Yes, if you keep `Directory.Read.All`. The app reads group claims from the token itself, not by querying Graph API.

### Q: Can I script this?
**A:** Yes, see "Method 2: PowerShell Script" above, or use:
```bash
az ad app permission add --id <app-id> --api <api-id> --api-permissions <scope>
az ad app permission delete --id <app-id> --api <api-id> --api-permissions <scope>
```

### Q: What about CORS / Frontend permissions?
**A:** These Azure AD permissions don't affect CORS. CORS is separate (check your backend headers).

---

## Timeline & Risk Assessment

| Action | Risk | Time |
|---|---|---|
| Remove Mail.Read | None - not used | 2 min |
| Remove DeviceManagementManagedDevices.* | None - agents manage devices | 2 min |
| Remove Directory.Read.All | **Medium** - only if NOT using groups | 2 min |
| Remove User.ReadWrite.All | Low - switch to User.Read | 2 min |
| Remove Application.Read.All | None - not used | 2 min |
| Grant new consent | None - users will re-consent | 1 min |
| **Total** | **Low** | **~10 min** |

---

## Next Steps

1. ✅ Read this document
2. Go to Azure Portal → Your App Registration
3. Remove unnecessary permissions (Method 1 above)
4. Grant admin consent
5. Test login and super-admin access
6. Monitor for issues (check logs)
7. Document what you removed in your security audit file

**Estimated time:** 10-15 minutes total
