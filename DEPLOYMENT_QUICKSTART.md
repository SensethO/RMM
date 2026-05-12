# 🚀 RMM Platform - Deployment Quickstart

Deploy RMM Platform to production in 30 minutes!

## ⚡ Quick Checklist

### 1. Supabase Setup (10 min)

```bash
# Get credentials from https://console.supabase.com
# Project Settings → API

# Copy:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_KEY

# Execute SQL migration in Supabase console:
# SQL Editor → New Query → Paste from:
# supabase/migrations/20240512000000_initial_schema.sql
```

See detailed guide: `docs/SUPABASE_QUICKSTART.md`

### 2. Vercel Frontend Deployment (5 min)

```bash
# Go to https://vercel.com
# 1. Click "Add New → Project"
# 2. Import GitHub repo: SensethO/RMM
# 3. Configure:
#    - Framework: Vite
#    - Root Directory: ./frontend
#    - Build Command: npm run build
# 4. Add Environment Variables (see below)
# 5. Click Deploy

# Environment Variables for Frontend:
VITE_API_URL=https://rmm-api.vercel.app
VITE_AZURE_CLIENT_ID=your-azure-app-id
VITE_AZURE_AUTHORITY=https://login.microsoftonline.com/your-tenant-id
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Vercel Backend Deployment (10 min)

```bash
# Go to https://vercel.com
# 1. Click "Add New → Project"
# 2. Import same GitHub repo again
# 3. Configure:
#    - Framework: Other
#    - Root Directory: ./backend
#    - Build Command: npm run build
# 4. Add Environment Variables (see below)
# 5. Click Deploy

# Environment Variables for Backend:
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-app-id
AZURE_CLIENT_SECRET=your-secret
JWT_SECRET=generate-random-string
FRONTEND_URL=https://rmm-frontend.vercel.app
NODE_ENV=production
```

### 4. Update Frontend URL (2 min)

After backend deploys, update frontend:

```bash
# Frontend Project → Settings → Environment Variables
VITE_API_URL=https://rmm-api.vercel.app  # Update with actual URL
# Save → Redeploy
```

### 5. Test Deployment (3 min)

```bash
# Test Frontend
curl https://rmm-[random].vercel.app

# Test Backend Health
curl https://rmm-api-[random].vercel.app/api/health

# Response should be:
# {
#   "status": "ok",
#   "timestamp": "...",
#   "environment": "production"
# }
```

---

## 📋 Get Your Credentials

### From Supabase Console

1. Go to: https://console.supabase.com
2. Select your project
3. **Settings → API**
   - Copy: `Project URL` → `SUPABASE_URL`
   - Copy: `anon public` → `SUPABASE_ANON_KEY`
   - Copy: `service_role` → `SUPABASE_SERVICE_KEY`

### From Azure AD

1. Go to: https://portal.azure.com
2. **Azure Active Directory → App registrations**
3. Select your RMM app
4. Copy:
   - `Application (client) ID` → `AZURE_CLIENT_ID`
   - `Directory (tenant) ID` → `AZURE_TENANT_ID`
5. **Certificates & secrets**
   - Create new secret → Copy → `AZURE_CLIENT_SECRET`

---

## 🎯 What You Get After Deployment

✅ **Frontend Dashboard**
- Live at: `https://rmm-[random].vercel.app`
- Device management
- Command queue
- Real-time updates

✅ **Backend API**
- Live at: `https://rmm-api-[random].vercel.app`
- Device registration
- Command polling
- Telemetry collection

✅ **Database**
- Supabase PostgreSQL
- Multi-tenant isolation
- Row-level security

✅ **CI/CD**
- Automatic deployments on push to main
- GitHub Actions integrated
- Auto-rollback on failure

---

## 🧪 Test Production Setup

### Register a Device

```bash
TOKEN="your-jwt-token-here"

curl -X POST https://rmm-api.vercel.app/api/devices/register \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "device-001",
    "device_name": "Test PC",
    "os": "Windows",
    "os_version": "10"
  }'

# Response: Device UUID
```

### Check Dashboard

1. Open: `https://rmm-[random].vercel.app`
2. Login with Azure AD
3. You should see:
   - Device list (with your registered device)
   - Dashboard stats
   - Commands, Alerts pages

---

## 📚 Detailed Guides

- **Supabase Setup**: `docs/SUPABASE_QUICKSTART.md`
- **Vercel Deployment**: `docs/VERCEL_DEPLOYMENT.md`
- **API Testing**: `docs/API_TESTING.md`
- **Architecture**: `ARCHITECTURE.md`

---

## ⚠️ Important: Secure Your Secrets

**NEVER commit these to Git:**
- `SUPABASE_SERVICE_KEY` (private)
- `AZURE_CLIENT_SECRET` (private)
- `JWT_SECRET` (private)
- API keys or tokens

Vercel stores them in encrypted **Environment Variables**.

---

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot find module" | Backend: `npm install` in `backend/` directory |
| Blank frontend page | Check `VITE_API_URL` in Vercel env vars |
| API returns 401 | Check `SUPABASE_SERVICE_KEY` is set |
| Deployment fails | Check build logs in Vercel dashboard |
| CORS errors | Verify `FRONTEND_URL` in backend env vars |

---

## 📞 Next Steps

1. ✅ Deploy to Supabase + Vercel
2. ⏳ Test the full application
3. ⏳ Create Windows Agent (next phase)
4. ⏳ Monitor production usage
5. ⏳ Set up auto-scaling alerts

---

**Questions? Check docs/ folder for detailed guides!** 📖
