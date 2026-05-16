#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const FRONTEND_PROJECT = 'frontend';
const BACKEND_PROJECT = 'backend';

// Frontend environment variables
const FRONTEND_ENV = {
  'VITE_API_URL': 'https://isnocloudrmm-api.vercel.app',
  'VITE_AZURE_CLIENT_ID': '5572b04e-78e5-440e-a36e-919f07ff8956',
  'VITE_AZURE_AUTHORITY': 'https://login.microsoftonline.com/56de879c-d3d0-4bb3-8230-35477d85a1f0',
  'VITE_SUPABASE_URL': 'https://ebgjazfgxsumzbsvyrna.supabase.co',
  'VITE_SUPABASE_ANON_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NzI0OTksImV4cCI6MjA5NDE0ODQ5OX0.7O2ydW1hQnDOvcGF30t0ywcGATqGWdDnc7NZhuXxLSs',
};

// Backend environment variables
const BACKEND_ENV = {
  'NODE_ENV': 'production',
  'SUPABASE_URL': 'https://ebgjazfgxsumzbsvyrna.supabase.co',
  'SUPABASE_ANON_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NzI0OTksImV4cCI6MjA5NDE0ODQ5OX0.7O2ydW1hQnDOvcGF30t0ywcGATqGWdDnc7NZhuXxLSs',
  'SUPABASE_SERVICE_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU3MjQ5OSwiZXhwIjoyMDk0MTQ4NDk5fQ._6xb6xFxj9X_OUQRaGD-Qcb8KITvz0n1qr1O3OghZAc',
  'AZURE_TENANT_ID': '56de879c-d3d0-4bb3-8230-35477d85a1f0',
  'AZURE_CLIENT_ID': '5572b04e-78e5-440e-a36e-919f07ff8956',
  'AZURE_CLIENT_SECRET': '10c28ec2-c026-40fd-853c-f4116d1f2575',
  'JWT_SECRET': 'rmm-production-jwt-secret-change-this',
  'FRONTEND_URL': 'https://isnocloudrmm.vercel.app',
};

function run(cmd, cwd = '.') {
  console.log(`\n📋 Running: ${cmd}`);
  try {
    const output = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log(output);
    return output;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.stdout) console.error('STDOUT:', error.stdout);
    if (error.stderr) console.error('STDERR:', error.stderr);
    throw error;
  }
}

function configureEnv(project, envVars) {
  console.log(`\n\n🔧 Configuring environment for ${project}...`);

  const projectPath = path.join(process.cwd(), project);

  // Create .env file for reference
  let envContent = '# Environment variables for Vercel\n';
  for (const [key, value] of Object.entries(envVars)) {
    envContent += `${key}=${value}\n`;
  }

  const envFile = path.join(projectPath, '.env.vercel');
  fs.writeFileSync(envFile, envContent);
  console.log(`✅ Created ${envFile} for reference`);

  // For Vercel, we need to add via dashboard or API
  // This is just for reference - actual configuration happens in Vercel dashboard
  console.log(`\n💡 Add these to Vercel dashboard manually or use vercel env add:`);
  for (const [key, value] of Object.entries(envVars)) {
    console.log(`  ${key}=<secret>`);
  }
}

async function main() {
  console.log('🚀 RMM Vercel Deployment Configuration');
  console.log('=====================================\n');

  try {
    const rootPath = process.cwd();

    // Configure frontend
    configureEnv(FRONTEND_PROJECT, FRONTEND_ENV);

    // Configure backend
    configureEnv(BACKEND_PROJECT, BACKEND_ENV);

    console.log('\n\n✅ Configuration files created!');
    console.log('\n📝 Next steps:');
    console.log('1. Go to Vercel Dashboard: https://vercel.com/dashboard');
    console.log('2. For Frontend Project:');
    console.log('   - Settings → Environment Variables');
    console.log('   - Add all VITE_* variables from above');
    console.log('3. For Backend Project:');
    console.log('   - Settings → Environment Variables');
    console.log('   - Add all variables from above');
    console.log('4. Click "Redeploy" on both projects');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

main();
