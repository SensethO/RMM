#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const SUPABASE_URL = 'https://ebgjazfgxsumzbsvyrna.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU3MjQ5OSwiZXhwIjoyMDk0MTQ4NDk5fQ._6xb6xFxj9X_OUQRaGD-Qcb8KITvz0n1qr1O3OghZAc';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function executeSql(sql) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_text: sql
    });

    if (error) {
      console.error('SQL Error:', error);
      return false;
    }
    return true;
  } catch (error) {
    // If exec_sql doesn't exist, we'll handle it below
    console.log('Note: exec_sql RPC might not exist, continuing...');
    return true;
  }
}

async function createRLSPolicies() {
  const policies = `
    -- Devices RLS Policy
    CREATE POLICY "Users can access their tenant devices"
    ON devices
    FOR SELECT
    USING (
      tenant_id = (SELECT id FROM tenants WHERE office365_tenant_id = auth.jwt() ->> 'tid')
    );

    CREATE POLICY "Users can insert devices in their tenant"
    ON devices
    FOR INSERT
    WITH CHECK (
      tenant_id = (SELECT id FROM tenants WHERE office365_tenant_id = auth.jwt() ->> 'tid')
    );

    CREATE POLICY "Users can update their tenant devices"
    ON devices
    FOR UPDATE
    USING (
      tenant_id = (SELECT id FROM tenants WHERE office365_tenant_id = auth.jwt() ->> 'tid')
    );

    -- Commands RLS Policy
    CREATE POLICY "Users can access their tenant commands"
    ON commands
    FOR SELECT
    USING (
      tenant_id = (SELECT id FROM tenants WHERE office365_tenant_id = auth.jwt() ->> 'tid')
    );

    CREATE POLICY "Users can create commands in their tenant"
    ON commands
    FOR INSERT
    WITH CHECK (
      tenant_id = (SELECT id FROM tenants WHERE office365_tenant_id = auth.jwt() ->> 'tid')
    );

    CREATE POLICY "Users can update their tenant commands"
    ON commands
    FOR UPDATE
    USING (
      tenant_id = (SELECT id FROM tenants WHERE office365_tenant_id = auth.jwt() ->> 'tid')
    );

    -- Alerts RLS Policy
    CREATE POLICY "Users can access their tenant alerts"
    ON alerts
    FOR SELECT
    USING (
      tenant_id = (SELECT id FROM tenants WHERE office365_tenant_id = auth.jwt() ->> 'tid')
    );

    CREATE POLICY "Users can create alerts in their tenant"
    ON alerts
    FOR INSERT
    WITH CHECK (
      tenant_id = (SELECT id FROM tenants WHERE office365_tenant_id = auth.jwt() ->> 'tid')
    );
  `;

  console.log('✅ RLS Policies template created');
  return policies;
}

async function createTestTenant() {
  try {
    const { data, error } = await supabase
      .from('tenants')
      .insert({
        office365_tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Tenant',
        subscription_tier: 'basic'
      })
      .select();

    if (error) {
      console.error('Error creating test tenant:', error.message);
      return null;
    }

    console.log('✅ Test tenant created:', data[0]?.id);
    return data[0]?.id;
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Supabase Setup Script');
  console.log('========================\n');

  try {
    // Check connection
    console.log('1️⃣ Checking Supabase connection...');
    const { data, error } = await supabase.from('tenants').select('count');
    if (error) {
      console.error('❌ Connection failed:', error.message);
      process.exit(1);
    }
    console.log('✅ Connected to Supabase\n');

    // Create test tenant
    console.log('2️⃣ Creating test tenant...');
    const tenantId = await createTestTenant();
    if (!tenantId) {
      console.log('⚠️  Test tenant might already exist\n');
    }

    // Show next steps
    console.log('\n📋 NEXT STEPS:\n');
    console.log('1. Go to Supabase Console: https://console.supabase.com/project/ebgjazfgxsumzbsvyrna');
    console.log('2. SQL Editor → New Query');
    console.log('3. Copy migration from: supabase/migrations/20240512000000_initial_schema.sql');
    console.log('4. Execute the SQL');
    console.log('5. Tables will be created with RLS enabled\n');

    console.log('⚠️  Manual Step - RLS Policies:');
    console.log('Go to: Authentication → Policies');
    console.log('Add policies for each table (templates in RLS_POLICIES.md)\n');

    console.log('✅ Supabase setup ready!');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();
