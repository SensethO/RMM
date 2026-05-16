#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get auth token from Vercel CLI
function getVercelToken() {
  try {
    const result = execSync('vercel whoami --token-only 2>/dev/null || echo "not-found"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return result !== 'not-found' ? result : null;
  } catch (e) {
    return null;
  }
}

// Get project info
function getProjectInfo(projectName, projectPath) {
  try {
    const vercelDir = path.join(projectPath, '.vercel');
    if (fs.existsSync(vercelDir)) {
      const projectJson = path.join(vercelDir, 'project.json');
      if (fs.existsSync(projectJson)) {
        const data = JSON.parse(fs.readFileSync(projectJson, 'utf-8'));
        return {
          projectId: data.projectId,
          orgId: data.orgId,
          projectName: data.projectName
        };
      }
    }
  } catch (e) {
    console.error(`Error reading project info: ${e.message}`);
  }
  return null;
}

// Main configuration
async function main() {
  console.log('🚀 Vercel Environment Configuration');
  console.log('====================================\n');

  const projectRoot = process.cwd();
  const frontendPath = path.join(projectRoot, 'frontend');
  const backendPath = path.join(projectRoot, 'backend');

  // Environment variables
  const configs = {
    frontend: {
      path: frontendPath,
      env: {
        'VITE_API_URL': 'https://backend-h5m9ggtt2-sensethos-projects.vercel.app',
        'VITE_AZURE_CLIENT_ID': '5572b04e-78e5-440e-a36e-919f07ff8956',
        'VITE_AZURE_AUTHORITY': 'https://login.microsoftonline.com/56de879c-d3d0-4bb3-8230-35477d85a1f0',
        'VITE_SUPABASE_URL': 'https://ebgjazfgxsumzbsvyrna.supabase.co',
        'VITE_SUPABASE_ANON_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NzI0OTksImV4cCI6MjA5NDE0ODQ5OX0.7O2ydW1hQnDOvcGF30t0ywcGATqGWdDnc7NZhuXxLSs'
      }
    },
    backend: {
      path: backendPath,
      env: {
        'NODE_ENV': 'production',
        'SUPABASE_URL': 'https://ebgjazfgxsumzbsvyrna.supabase.co',
        'SUPABASE_ANON_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NzI0OTksImV4cCI6MjA5NDE0ODQ5OX0.7O2ydW1hQnDOvcGF30t0ywcGATqGWdDnc7NZhuXxLSs',
        'SUPABASE_SERVICE_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU3MjQ5OSwiZXhwIjoyMDk0MTQ4NDk5fQ._6xb6xFxj9X_OUQRaGD-Qcb8KITvz0n1qr1O3OghZAc',
        'AZURE_TENANT_ID': '56de879c-d3d0-4bb3-8230-35477d85a1f0',
        'AZURE_CLIENT_ID': '5572b04e-78e5-440e-a36e-919f07ff8956',
        'AZURE_CLIENT_SECRET': '10c28ec2-c026-40fd-853c-f4116d1f2575',
        'JWT_SECRET': 'rmm-prod-jwt-secret-2024',
        'FRONTEND_URL': 'https://frontend-xi-one-36.vercel.app'
      }
    }
  };

  // Process each project
  for (const [projectName, config] of Object.entries(configs)) {
    console.log(`\n📋 ${projectName.toUpperCase()}`);
    console.log('-'.repeat(40));

    const projectInfo = getProjectInfo(projectName, config.path);
    if (!projectInfo) {
      console.log(`⚠️  Project info not found for ${projectName}`);
      continue;
    }

    console.log(`Project ID: ${projectInfo.projectId}`);
    console.log(`Org ID: ${projectInfo.orgId}\n`);

    // Create .env file for reference
    let envContent = '# Vercel Environment Variables\n# Add these manually via: https://vercel.com/dashboard\n\n';
    for (const [key, value] of Object.entries(config.env)) {
      envContent += `${key}=${value}\n`;
    }

    const envFile = path.join(config.path, '.env.vercel');
    fs.writeFileSync(envFile, envContent);
    console.log(`✅ Created ${envFile}`);

    // Show env vars
    console.log(`\n📝 Environment Variables to Add:`);
    Object.keys(config.env).forEach(key => {
      console.log(`   ${key} = <secret>`);
    });
  }

  console.log('\n\n✅ Configuration files created!');
  console.log('\n📌 IMPORTANT: Manual Steps Required');
  console.log('====================================');
  console.log(`
1. Go to Vercel Dashboard: https://vercel.com/dashboard/sensethos-projects

2. For FRONTEND project:
   - Click on "frontend" project
   - Go to Settings → Environment Variables
   - Add all VITE_* variables (see frontend/.env.vercel)
   - Click "Save"
   - Go to Deployments, click latest, click "Redeploy"

3. For BACKEND project:
   - Click on "backend" project
   - Go to Settings → Environment Variables
   - Add all variables (see backend/.env.vercel)
   - Click "Save"
   - Go to Deployments, click latest, click "Redeploy"

4. After both redeploy, test:
   - Frontend: https://frontend-xi-one-36.vercel.app
   - Backend: curl https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
  `);

  console.log('\n🎯 Or use Vercel CLI to add env vars (non-interactive):');
  console.log('   cd frontend && vercel env add VITE_API_URL <<< "https://..."');
  console.log('   cd ../backend && vercel env add JWT_SECRET <<< "rmm-prod-secret"');
}

main().catch(console.error);
