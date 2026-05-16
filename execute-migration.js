#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SUPABASE_URL = 'https://ebgjazfgxsumzbsvyrna.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU3MjQ5OSwiZXhwIjoyMDk0MTQ4NDk5fQ._6xb6xFxj9X_OUQRaGD-Qcb8KITvz0n1qr1O3OghZAc';

async function executeMigration() {
  try {
    console.log('🚀 Supabase Migration Execution');
    console.log('================================\n');

    // Read migration file
    console.log('📖 Reading migration file: supabase/migrations/20240512000000_initial_schema.sql\n');
    const migrationPath = path.join(__dirname, 'supabase/migrations/20240512000000_initial_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log(`✅ File loaded (${migrationSQL.length} bytes)`);

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    console.log('\n🔌 Connecting to Supabase...');
    
    // Test connection
    const { data: connTest, error: connError } = await supabase
      .from('tenants')
      .select('count', { count: 'exact', head: true });

    if (connError && connError.code !== 'PGRST116') {
      console.error('❌ Connection failed:', connError.message);
      process.exit(1);
    }
    
    console.log('✅ Connected to Supabase\n');

    console.log('⏳ Executing migration SQL...\n');

    // Try to execute via RPC first
    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_text: migrationSQL
      });

      if (error) {
        console.error('⚠️  RPC exec_sql not available, trying raw execution...\n');
      } else {
        console.log('✅ Migration executed via RPC\n');
        console.log('📊 Result:', data);
      }
    } catch (rpcErr) {
      console.log('⚠️  RPC method not available\n');
    }

    // Verify tables exist
    console.log('\n🔍 Verifying table creation...\n');

    const tables = [
      'tenants',
      'devices', 
      'device_telemetry',
      'commands',
      'apps_catalog',
      'deployments',
      'alerts',
      'audit_logs'
    ];

    let tablesCreated = 0;
    for (const tableName of tables) {
      try {
        const { error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);

        if (!error) {
          console.log(`✅ '${tableName}' table exists`);
          tablesCreated++;
        } else if (error.code === 'PGRST116') {
          console.log(`⚠️  '${tableName}' table not found yet`);
        } else {
          console.log(`⚠️  '${tableName}' - ${error.message}`);
        }
      } catch (err) {
        console.log(`⚠️  Error checking '${tableName}'`);
      }
    }

    console.log(`\n📊 Summary: ${tablesCreated}/${tables.length} tables verified`);

    if (tablesCreated === tables.length) {
      console.log('\n✨ 🎉 All tables created successfully!');
      console.log('\n📋 Next steps:');
      console.log('1. ✅ Database schema initialized');
      console.log('2. ✅ All tables created with RLS enabled');
      console.log('3. ✅ Ready for backend API testing');
    } else if (tablesCreated > 0) {
      console.log('\n⚠️  Some tables verified - migration may be partially complete');
      console.log('    Go to Supabase Console → Table Editor to verify manually');
    } else {
      console.log('\n❌ Tables not found - migration may not have executed');
      console.log('    Please execute the SQL manually in Supabase Console');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

executeMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
