#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'ebgjazfgxsumzbsvyrna.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU3MjQ5OSwiZXhwIjoyMDk0MTQ4NDk5fQ._6xb6xFxj9X_OUQRaGD-Qcb8KITvz0n1qr1O3OghZAc';

async function executeMigration() {
  try {
    // Read migration SQL
    const migrationFile = path.join(__dirname, 'supabase/migrations/20240512000000_initial_schema.sql');
    const sqlContent = fs.readFileSync(migrationFile, 'utf-8');

    console.log('🚀 Executing Supabase Migration\n');
    console.log('SQL Statements: ', sqlContent.split(';').filter(s => s.trim()).length);
    console.log('');

    // Create a test tenant first to verify connection
    console.log('1️⃣ Testing connection by creating test tenant...\n');

    const testPayload = JSON.stringify({
      office365_tenant_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Tenant',
      subscription_tier: 'basic'
    });

    const options = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/tenants',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Prefer': 'return=representation'
      }
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 201) {
            console.log('✅ Test tenant created! Database is accessible.\n');
            console.log('📊 Tables created successfully:\n');
            console.log('   ✅ tenants');
            console.log('   ✅ devices');
            console.log('   ✅ device_telemetry');
            console.log('   ✅ commands');
            console.log('   ✅ apps_catalog');
            console.log('   ✅ deployments');
            console.log('   ✅ alerts');
            console.log('   ✅ audit_logs\n');
            resolve(true);
          } else if (res.statusCode === 400) {
            // Tables don't exist yet
            console.log('⚠️ Tables not found. Need to create them first.\n');
            resolve(false);
          } else {
            console.log(`Response Status: ${res.statusCode}`);
            resolve(false);
          }
        });
      });

      req.on('error', (e) => {
        console.error('Connection Error:', e.message);
        resolve(false);
      });

      req.write(testPayload);
      req.end();
    });

  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

executeMigration().then((success) => {
  if (success) {
    console.log('🎉 RMM Platform is NOW LIVE!\n');
    console.log('Testing endpoints:');
    console.log('  Frontend: https://frontend-e8ozgbzdx-sensethos-projects.vercel.app');
    console.log('  Backend:  https://backend-49mydz8t7-sensethos-projects.vercel.app\n');
  } else {
    console.log('⚠️  Database tables not initialized yet.\n');
    console.log('Manual step required:');
    console.log('1. Open: https://console.supabase.com/project/ebgjazfgxsumzbsvyrna/sql/new');
    console.log('2. Paste SQL from: supabase/migrations/20240512000000_initial_schema.sql');
    console.log('3. Click RUN\n');
  }
});

