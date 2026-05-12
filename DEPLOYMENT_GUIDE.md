# Deployment Guide - GitHub, Supabase, Vercel

## 1. GitHub Repository

✅ **Created**: https://github.com/SensethO/RMM

Your code is already in GitHub. Make sure to:

```bash
git remote -v  # Verify remote is set
git push origin main  # Push to main branch for production
```

## 2. Supabase Configuration

### Get Your Credentials

1. Go to: https://app.supabase.com
2. Select your project
3. Navigate to **Settings → API**
4. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon key** → `SUPABASE_ANON_KEY` (for frontend)
   - **service_role key** → `SUPABASE_SERVICE_KEY` (for backend - keep secret!)

### Create Database Schema

You have two options:

**Option A: Via Supabase Console (Recommended)**
1. Go to **SQL Editor** in Supabase
2. Click **New Query**
3. Copy content from `supabase/migrations/20240512000000_initial_schema.sql`
4. Execute the query

**Option B: Via Supabase CLI**
```bash
npm install -g supabase
supabase link --project-ref your-project-id
supabase db push
```

### Test the Connection

```bash
# In your .env.local, add:
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Then test:
cd backend && npm run test
```

## 3. Vercel Deployment

### Connect Your GitHub Repository

1. Go to: https://vercel.com
2. Click **New Project**
3. Select **RMM** from GitHub
4. Configure:
   - **Framework**: Next.js / Vite (select Vite for frontend)
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Install Command**: `npm install`

### Set Environment Variables in Vercel

In Vercel Dashboard → Project Settings → Environment Variables

Add:
```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AZURE_TENANT_ID=00000000-0000-0000-0000-000000000000
AZURE_CLIENT_ID=00000000-0000-0000-0000-000000000000
AZURE_CLIENT_SECRET=your-secret
JWT_SECRET=your-secret-key
```

### Deploy

```bash
git push origin main  # Automatically triggers Vercel deployment
```

## 4. Environment Variables Security

### ⚠️ IMPORTANT: Never Commit Secrets

The Supabase key you provided is **sensitive**:
```
sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Safe Practices:**
1. ✅ Store in Vercel's encrypted Environment Variables
2. ✅ Store in `.env.local` (in .gitignore)
3. ✅ Rotate keys regularly in Supabase console
4. ❌ Never commit to git
5. ❌ Never share in plain text
6. ❌ Never hardcode in source code

### How to Rotate Keys

If the key is accidentally exposed:
1. Go to Supabase → Settings → API
2. Click **Regenerate** next to service_role key
3. Update all deployments with new key

## 5. Local Development Setup

### Setup .env.local

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your credentials:
```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AZURE_CLIENT_ID=your-app-id
AZURE_TENANT_ID=your-tenant-id
JWT_SECRET=your-secret
```

### Start Development

```bash
# Terminal 1 - Backend
cd backend
npm install
npm run dev

# Terminal 2 - Frontend
cd frontend
npm install
npm run dev

# Open http://localhost:5173
```

## 6. CI/CD Pipeline

GitHub Actions automatically runs on push:

1. **Lint & Test Backend** → `npm run lint && npm run test`
2. **Lint & Test Frontend** → `npm run lint && npm run test`
3. **Build Backend** → `npm run build`
4. **Build Frontend** → `npm run build`
5. **Deploy to Vercel** → (only on main branch)

Check logs: GitHub → Actions tab

## 7. Monitoring

### Backend Logs
```bash
# Vercel Dashboard → Functions → Logs
# Or via Vercel CLI:
vercel logs
```

### Frontend Logs
```bash
# Vercel Dashboard → Deployments → Logs
# Or browser console (F12)
```

### Database Logs
```bash
# Supabase Console → Logs → Database
```

## 8. Troubleshooting

### Deployment Fails
1. Check GitHub Actions logs
2. Verify environment variables in Vercel
3. Check Vercel build logs

### Database Connection Error
```
Error: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY
```
Solution: Add variables to Vercel or .env.local

### CORS Issues
Update `FRONTEND_URL` in backend to match Vercel deployment URL

### Authentication Fails
1. Verify Azure AD credentials in Vercel
2. Check token expiration
3. See Supabase Auth logs

## 9. Production Checklist

- [ ] Database backups enabled (Supabase automatic)
- [ ] Environment variables set in Vercel
- [ ] GitHub Actions passing all tests
- [ ] Vercel deployment successful
- [ ] Health check: `GET /api/health`
- [ ] Frontend loads without CORS errors
- [ ] Authentication working with Azure AD
- [ ] Database queries working with tenant isolation

## 10. Rollback Procedure

### Rollback to Previous Deploy

**Vercel:**
1. Vercel Dashboard → Deployments
2. Click the previous deployment
3. Click "Redeploy"

**Database:**
1. Supabase → Backups
2. Restore from backup

## References

- GitHub: https://github.com/SensethO/RMM
- Vercel Docs: https://vercel.com/docs
- Supabase Docs: https://supabase.com/docs
- Azure AD: https://portal.azure.com
