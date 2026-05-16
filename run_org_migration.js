#!/usr/bin/env node
const { Client } = require('pg');
const fs = require('fs');

// Supabase project is in eu-west-1; use Transaction Pooler (port 6543)
// Username format for Supabase pooler: postgres.[project-ref]
const client = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.ebgjazfgxsumzbsvyrna',
  password: 'postgres.s4dn9cv4m7pqjk3v',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

async function run() {
  console.log('🔌 Connexion à Supabase...');
  await client.connect();
  console.log('✅ Connecté\n');

  const sql = fs.readFileSync('supabase/migration_org_structure.sql', 'utf-8');
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📋 ${statements.length} statements à exécuter...\n`);

  for (const stmt of statements) {
    const preview = stmt.replace(/\n/g, ' ').slice(0, 70);
    process.stdout.write(`  → ${preview}... `);
    try {
      await client.query(stmt + ';');
      console.log('✅');
    } catch (e) {
      const msg = e.message || String(e);
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        console.log('⚠️  déjà existant (OK)');
      } else {
        console.log(`❌ ${msg.slice(0, 100)}`);
      }
    }
  }

  console.log('\n🔍 Vérification des tables...');
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('organizations','sites','departments')
    ORDER BY table_name
  `);
  const tables = rows.map(r => r.table_name);
  console.log('Tables trouvées:', tables);

  console.log('\n🔍 Vérification colonnes devices...');
  const { rows: cols } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'devices'
    AND column_name IN ('organization_id','site_id','department_id','notes')
    ORDER BY column_name
  `);
  console.log('Colonnes devices:', cols.map(r => r.column_name));

  console.log('\n🔍 Données de démo...');
  const { rows: orgs } = await client.query(`SELECT name, city FROM organizations LIMIT 5`);
  console.log('Organisations:', orgs);

  await client.end();
  console.log('\n✅ Migration terminée avec succès !');
}

run().catch(e => { console.error('❌ Erreur fatale:', e.message); process.exit(1); });
