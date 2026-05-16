#!/usr/bin/env node
/**
 * Migration: Fix device_id unique constraint to be per-tenant
 * Exécute le SQL directement via Supabase API
 */

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ebgjazfgxsumzbsvyrna.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcxMzk2Njc1MCwiZXhwIjoyMDI5MzQyNzUwfQ.gYMGPHKLJK8zEd7HzKmHOXSMSTJxrPvpVaVkpE0kLXA';

const sqlStatements = [
  'ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_device_id_key;',
  'ALTER TABLE devices ADD CONSTRAINT devices_tenant_device_unique UNIQUE (tenant_id, device_id);',
];

async function querySupabase(sql) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: '/rest/v1/rpc/sql_query',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
    };

    // Supabase doesn't have public SQL execution endpoint
    // Instead, create a temporary function and call it via RPC
    console.log('❌ Supabase REST API ne supporte pas l\'exécution directe de SQL.');
    console.log('');
    console.log('✅ Solution: Copie-colle manuellement dans Supabase SQL Editor:');
    console.log('👉 https://supabase.com/dashboard/project/ebgjazfgxsumzbsvyrna/sql/new');
    console.log('');
    sqlStatements.forEach(stmt => console.log(stmt));
    console.log('');
    process.exit(0);
  });
}

querySupabase(sqlStatements.join('\n')).catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
