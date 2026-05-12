# Vercel Deployment Guide - RMM Platform

## Prerequisites

✅ GitHub repo pushed: https://github.com/SensethO/RMM
✅ Supabase configured (see SUPABASE_QUICKSTART.md)
✅ Backend + Frontend compile locally

---

## Step 1: Create Vercel Account

1. Go to: https://vercel.com
2. Sign up with GitHub account
3. Grant Vercel permission to access your repos

---

## Step 2: Deploy Frontend

### Connect GitHub Repository

1. In Vercel dashboard, click **Add New → Project**
2. Select **Import Git Repository**
3. Search for **RMM** → Click **Import**
4. Configure:
   - **Framework**: Vite
   - **Root Directory**: `./frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Click **Deploy**

### Add Environment Variables

1. Go to project **Settings → Environment Variables**
2. Add the following:

```
VITE_API_URL=https://rmm-api.vercel.app  # Will set after backend deploy
VITE_AZURE_CLIENT_ID=your-azure-app-id
VITE_AZURE_AUTHORITY=https://login.microsoftonline.com/your-tenant-id
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

3. Click **Save**
4. Click **Redeploy** to rebuild with env vars

### Result

✅ Frontend deployed at: `https://rmm-[random].vercel.app`

---

## Step 3: Deploy Backend (Serverless Functions)

### Option A: Deploy Backend to Vercel (Recommended for MVP)

1. Create `vercel.json` (already created):

```json
{
  "buildCommand": "cd backend && npm run build",
  "outputDirectory": "backend/dist",
  "framework": "nodejs",
  "functions": {
    "backend/dist/**/*.js": {
      "runtime": "nodejs18.x"
    }
  }
}
```

2. In Vercel dashboard → **Add New → Project**
3. Select **RMM** repo again (same repo, different project)
4. Configure:
   - **Framework**: Other
   - **Root Directory**: `./backend`
   - **Build Command**: `npm run build`
5. Click **Deploy**

### Option B: Use Existing Backend Server

If you have a dedicated server:
- Deploy backend separately to your server
- Set `VITE_API_URL` to your backend URL

### Add Backend Environment Variables

1. Go to backend project **Settings → Environment Variables**
2. Add:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-app-id
AZURE_CLIENT_SECRET=your-secret
JWT_SECRET=your-jwt-secret
FRONTEND_URL=https://rmm-[random].vercel.app
NODE_ENV=production
```

3. Click **Save** → Redeploy

### Result

✅ Backend deployed at: `https://rmm-api-[random].vercel.app`

---

## Step 4: Update Frontend with Backend URL

1. Go to **Frontend Project → Settings → Environment Variables**
2. Update `VITE_API_URL`:
   ```
   VITE_API_URL=https://rmm-api-[random].vercel.app
   ```
3. Click **Save** → Redeploy

---

## Step 5: Configure Custom Domain (Optional)

### Add Domain to Vercel

1. Go to **Settings → Domains**
2. Enter your domain (e.g., `rmm.example.com`)
3. Add DNS records shown by Vercel
4. ✅ Domain configured

---

## Step 6: Verify Deployment

### Test Frontend

```bash
# Open in browser
https://rmm-[random].vercel.app

# You should see:
✅ Login page
✅ Azure AD login button
```

### Test Backend Health

```bash
curl https://rmm-api-[random].vercel.app/api/health

# Response:
{
  "status": "ok",
  "timestamp": "2026-05-12T...",
  "environment": "production"
}
```

### Test API with Token

```bash
TOKEN="your-jwt-token"

curl https://rmm-api-[random].vercel.app/api/devices \
  -H "Authorization: Bearer $TOKEN"

# Should return: list of devices (or empty array)
```

---

## Step 7: Enable Automatic Deployments

Vercel auto-deploys on push to main branch. To verify:

1. Edit a file locally
2. Commit and push: `git push origin main`
3. Go to Vercel dashboard → **Deployments**
4. ✅ New deployment should start automatically

---

## Step 8: Monitor Deployments

### View Logs

1. Go to **Deployments** tab
2. Click on a deployment
3. View:
   - Build logs
   - Function logs
   - Error details

### Set Up Alerts

1. Go to **Settings → Notifications**
2. Enable email alerts for:
   - Deployment failures
   - Function errors

---

## Step 9: Rollback if Needed

If deployment breaks:

1. Go to **Deployments**
2. Find last working deployment
3. Click **...** → **Promote to Production**
4. ✅ Previous version restored

---

## Troubleshooting

### Build Fails

**"Cannot find module"**
```bash
# Check package.json has all dependencies
cd backend && npm install
npm run build
```

**"PORT not set"**
```bash
# Vercel sets PORT automatically, but add fallback:
const PORT = process.env.PORT || 3000;
```

### Frontend Shows Blank Page

- Check **Network** tab in DevTools
- Verify `VITE_API_URL` is correct
- Check console for CORS errors

### API Returns 401

- Verify `SUPABASE_SERVICE_KEY` is set in backend env
- Check token in request header
- Verify Azure AD is configured

### Slow Performance

- Check Vercel Analytics: **Dashboard → Analytics**
- Optimize database queries
- Enable caching headers

---

## GitHub Actions Integration

Vercel automatically links with GitHub. To customize:

1. Create `.github/workflows/vercel.yml`:

```yaml
name: Vercel Deployment
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: vercel/action@v4
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

2. Add secrets to GitHub repo → **Settings → Secrets**

---

## Cost Optimization

✅ **Free tier includes**:
- 100GB bandwidth/month
- Unlimited deployments
- Serverless functions (up to execution limit)

💰 **Paid features** (optional):
- Priority support
- Advanced analytics
- Custom domains

---

## Next Steps

1. ✅ Frontend deployed
2. ✅ Backend deployed
3. ⏳ Test full application
4. ⏳ Configure Windows Agent
5. ⏳ Monitor production usage

---

## Useful Links

- Vercel Dashboard: https://vercel.com/dashboard
- Vercel Docs: https://vercel.com/docs
- GitHub Integration: https://vercel.com/docs/git
- Monitoring: https://vercel.com/docs/analytics
- Environment Variables: https://vercel.com/docs/projects/environment-variables
