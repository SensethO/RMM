#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Supabase PostgreSQL connection - using service role password
const connectionConfig = {
  host: 'ebgjazfgxsumzbsvyrna.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres.s4dn9cv4m7pqjk3v',  // You would need the actual postgres password
  ssl: {
    rejectUnauthorized: false
  }
};

async function executeMigration() {
  const client = new Client(connectionConfig);

  try {
    console.log('🚀 Direct PostgreSQL Migration');
    console.log('================================\n');

    console.log('📖 Reading migration file...');
    const migrationPath = path.join(__dirname, 'supabase/migrations/20240512000000_initial_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    console.log(`✅ File loaded (${migrationSQL.length} bytes)\n`);

    console.log('🔌 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected\n');

    console.log('⏳ Executing migration SQL...\n');
    const result = await client.query(migrationSQL);
    
    console.log('✅ Migration executed successfully!\n');
    console.log('📊 Result:', result);

    console.log('\n🔍 Verifying tables...\n');

    const tables = [
      'tenants', 'devices', 'device_telemetry', 'commands',
      'apps_catalog', 'deployments', 'alerts', 'audit_logs'
    ];

    let created = 0;
    for (const table of tables) {
      const checkResult = await client.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${table}');`
      );
      if (checkResult.rows[0].exists) {
        console.log(`✅ Table '${table}' created`);
        created++;
      } else {
        console.log(`❌ Table '${table}' not found`);
      }
    }

    console.log(`\n📊 Summary: ${created}/${tables.length} tables created`);

    if (created === tables.length) {
      console.log('\n✨ 🎉 All tables created successfully!');
      console.log('   Database schema is now initialized');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Connection refused - check host/port/credentials');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

executeMigration();
