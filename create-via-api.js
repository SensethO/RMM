#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

const SUPABASE_URL = 'ebgjazfgxsumzbsvyrna.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU3MjQ5OSwiZXhwIjoyMDk0MTQ4NDk5fQ._6xb6xFxj9X_OUQRaGD-Qcb8KITvz0n1qr1O3OghZAc';

async function createTablesViaAPI() {
  const tables = [
    {
      name: 'tenants',
      sql: `CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        office365_tenant_id UUID UNIQUE,
        name VARCHAR(255) NOT NULL,
        subscription_tier VARCHAR(50) DEFAULT 'basic',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`
    },
    {
      name: 'devices',
      sql: `CREATE TABLE IF NOT EXISTS devices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        device_id VARCHAR(255) UNIQUE NOT NULL,
        device_name VARCHAR(255) NOT NULL,
        os VARCHAR(50) NOT NULL,
        os_version VARCHAR(50),
        status VARCHAR(20) DEFAULT 'offline',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT status_check CHECK (status IN ('online', 'offline', 'error', 'maintenance'))
      );`
    }
  ];

  console.log('🚀 Creating tables via Supabase REST API...\n');

  // Test basic REST API
  console.log('Testing table creation via REST API...\n');

  // Try to insert a test tenant to verify tables can be created
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
      'Content-Length': testPayload.length,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Prefer': 'return=representation'
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        if (res.statusCode === 400) {
          console.log('Error Response:', data);
          console.log('\n⚠️  Tables don\'t exist yet - need to create them\n');
          resolve(false);
        } else if (res.statusCode === 201) {
          console.log('✅ Success! Tenant created:', JSON.parse(data));
          resolve(true);
        } else {
          console.log('Response:', data);
          resolve(false);
        }
      });
    });

    req.on('error', (e) => {
      console.error('Error:', e.message);
      resolve(false);
    });

    req.write(testPayload);
    req.end();
  });
}

createTablesViaAPI().then((success) => {
  if (!success) {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('⏳ MANUAL STEP REQUIRED: Execute SQL in Supabase Console');
    console.log('══════════════════════════════════════════════════════════\n');
    
    console.log('Open: https://console.supabase.com/project/ebgjazfgxsumzbsvyrna/sql/new\n');
    
    const migrationSql = fs.readFileSync('./supabase/migrations/20240512000000_initial_schema.sql', 'utf-8');
    console.log('Copy and paste this SQL:\n');
    console.log('─'.repeat(60));
    console.log(migrationSql);
    console.log('─'.repeat(60));
    
    console.log('\nThen click RUN\n');
  } else {
    console.log('✅ Database setup complete!');
  }
});

