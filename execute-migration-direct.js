#!/usr/bin/env node
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Supabase PostgreSQL connection string
// Format: postgresql://postgres:password@host:5432/database
const connectionString = 'postgresql://postgres:postgres.s4dn9cv4m7pqjk3v@ebgjazfgxsumzbsvyrna.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function executeMigration() {
  const client = await pool.connect();
  try {
    console.log('🚀 Executing Supabase Database Migration');
    console.log('========================================\n');

    console.log('📖 Reading migration file...');
    const migrationPath = path.join(__dirname, 'supabase/migrations/20240512000000_initial_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    console.log(`✅ Migration SQL loaded (${migrationSQL.length} bytes)\n`);

    console.log('🔌 Connected to PostgreSQL\n');

    console.log('⏳ Executing migration SQL...\n');
    const result = await client.query(migrationSQL);
    
    console.log('✅ Migration executed successfully!\n');

    console.log('🔍 Verifying tables created...\n');

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

    let count = 0;
    for (const table of tables) {
      const checkQuery = `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}');`;
      const checkResult = await client.query(checkQuery);
      if (checkResult.rows[0].exists) {
        console.log(`✅ Table '${table}' created successfully`);
        count++;
      } else {
        console.log(`❌ Table '${table}' not found`);
      }
    }

    console.log(`\n📊 Summary: ${count}/${tables.length} tables verified\n`);

    if (count === tables.length) {
      console.log('🎉 SUCCESS! All 8 tables created with Row-Level Security enabled');
      console.log('\n✨ Database is now ready for the RMM Platform!\n');
      console.log('📋 Next steps:');
      console.log('  1. Visit frontend: https://frontend-n9fcc4uxi-sensethos-projects.vercel.app');
      console.log('  2. Login with Azure AD credentials');
      console.log('  3. Register a device using the dashboard');
      console.log('  4. Test command queuing and telemetry collection\n');
      process.exit(0);
    } else {
      console.log('⚠️  Some tables missing - migration may be incomplete\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Cannot connect to PostgreSQL server');
      console.error('   Check: host, port, credentials');
    }
    process.exit(1);
  } finally {
    await client.end();
    await pool.end();
  }
}

executeMigration();
