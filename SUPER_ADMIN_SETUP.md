# Super Admin Configuration

## Overview
This guide explains how to set up super-admin access in the RMM platform. Super-admin users can view and manage devices across ALL tenants (not just their own).

## Implementation Details

### How It Works

1. **Azure AD Group Membership**: Super-admin access is controlled via an Azure AD security group
2. **Token Claims**: The user's Azure AD token includes a `groups` claim with all group IDs they belong to
3. **Backend Detection**: The auth middleware checks if the user belongs to the `SUPER_ADMIN_GROUP_ID` group
4. **Tenant Context**: Super-admins get `req.tenant.id = null`, which means:
   - No tenant filtering on database queries
   - Can view all devices across all tenants
   - Can create resources that affect all tenants

### Architecture

```
User with Azure AD Token
        ↓
Auth Middleware (checks `groups` claim)
        ↓
Is user in SUPER_ADMIN_GROUP_ID? 
        ↓ YES
Set req.tenant.id = null (super-admin context)
        ↓
All database queries skip tenant_id filtering
        ↓
User sees ALL devices across ALL tenants
```

---

## Setup Steps

### Step 1: Create Azure AD Group for Super-Admins

1. Go to **Azure Portal** → **Azure Active Directory** → **Groups**
2. Click **+ New group**
3. Fill in:
   - **Group type**: Security
   - **Group name**: `RMM-SuperAdmins` (or your preferred name)
   - **Group description**: "Super administrators for RMM platform"
4. Click **Create**
5. **Copy the Group ID** (you'll need this in Step 2)

Example Group ID: `00000000-0000-0000-0000-000000000000`

### Step 2: Add Users to the Super-Admin Group

1. Open the newly created group `RMM-SuperAdmins`
2. Click **Members** → **+ Add members**
3. Search for and select the users who should be super-admins
4. Click **Select**

### Step 3: Configure Backend Environment Variable

Set the `SUPER_ADMIN_GROUP_ID` environment variable on Vercel:

#### On Vercel:
1. Go to your Backend project settings
2. **Settings** → **Environment Variables**
3. Add new variable:
   - **Name**: `SUPER_ADMIN_GROUP_ID`
   - **Value**: `<paste-the-group-id-from-step-1>`
4. Click **Save**
5. **Redeploy** the backend for changes to take effect

#### Local Development (.env):
```bash
SUPER_ADMIN_GROUP_ID=00000000-0000-0000-0000-000000000000
```

### Step 4: Verify Configuration

Deploy the backend and test:

1. **Verify Group ID is set**:
   ```bash
   curl https://your-backend-url/api/health
   ```
   Should return `{"status": "ok", ...}`

2. **Login with a super-admin user** and check browser console:
   ```javascript
   // Check the JWT claims
   const token = localStorage.getItem('token');
   if (token) {
     const parts = token.split('.');
     const payload = JSON.parse(atob(parts[1]));
     console.log('Token claims:', payload);
     console.log('Is super-admin?', payload.isSuperAdmin); // Should be true
   }
   ```

3. **List all devices** (should show devices from ALL tenants):
   ```bash
   curl -H "Authorization: Bearer <token>" \
     https://your-backend-url/api/devices
   ```

---

## Verification Checklist

After setup, verify:

- [ ] Azure AD group `RMM-SuperAdmins` created
- [ ] Super-admin users added to the group
- [ ] `SUPER_ADMIN_GROUP_ID` set in Vercel environment variables
- [ ] Backend redeployed
- [ ] Super-admin user logs in, sees ALL tenants' devices in dashboard
- [ ] Regular users still see only their own tenant's devices
- [ ] Super-admin can access any device, create commands, etc.

---

## Testing Super-Admin Access

### Test 1: Login as Super-Admin
```javascript
// In browser console after login with a super-admin user
const token = localStorage.getItem('token');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('User is super-admin:', payload.isSuperAdmin === true); // Should be true
```

### Test 2: List All Devices
```bash
# Should return devices from ALL tenants (count > previous tenant's device count)
curl -H "Authorization: Bearer $TOKEN" \
  https://your-backend-url/api/devices?limit=100
```

### Test 3: Verify Regular Users Still Isolated
```bash
# Login as regular (non-admin) user
# Should only see devices for their own tenant
curl -H "Authorization: Bearer $REGULAR_USER_TOKEN" \
  https://your-backend-url/api/devices
```

---

## Important Security Notes

⚠️ **Super-Admin Access is Powerful** — Use with caution:
- Super-admins can see all devices across all customers
- Super-admins can execute commands on any device
- Super-admins can view all alerts, configurations, and deployment history
- Audit log all super-admin actions (consider adding audit logging if not already present)

✅ **Best Practices**:
1. Limit super-admin group to 1-2 MSP administrators
2. Enable Multi-Factor Authentication (MFA) for all super-admin accounts
3. Monitor super-admin access via Azure AD audit logs
4. Document who has super-admin access and why
5. Review access quarterly and remove unnecessary members

---

## Troubleshooting

### Super-Admin Users Still See Only Their Tenant

**Cause**: The group ID in the environment variable doesn't match the user's actual group memberships.

**Solution**:
1. Verify the user is actually in the Azure AD group:
   - Azure Portal → User → Group memberships
2. Check that the Group ID in Vercel matches exactly (no typos)
3. Redeploy the backend after updating the variable

### Token Shows No `groups` Claim

**Cause**: Azure AD token doesn't include groups by default in some configurations.

**Solution**:
1. In Azure Portal → App Registrations → Your App → Token configuration
2. Click **+ Add groups claim**
3. Select **Security groups** and **Groups assigned to the application**
4. Wait a few minutes for the change to propagate

### Backend Doesn't Recognize Super-Admin

**Cause**: Backend code is caching the environment variable before it was set.

**Solution**: Redeploy the backend after setting the environment variable:
```bash
vercel --prod
```

---

## Disabling Super-Admin Access

To disable all super-admin functionality:

1. Go to Vercel → Backend settings → Environment Variables
2. Delete the `SUPER_ADMIN_GROUP_ID` variable
3. Redeploy the backend

Now all users (including Azure AD users) will be restricted to their own tenant.

---

## Future Enhancements

Consider adding:
- [ ] Audit logging for super-admin actions
- [ ] Time-limited super-admin sessions
- [ ] Approval workflow for super-admin operations
- [ ] Separate read-only super-admin role
- [ ] Super-admin action dashboard
