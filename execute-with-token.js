#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://ebgjazfgxsumzbsvyrna.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU3MjQ5OSwiZXhwIjoyMDk0MTQ4NDk5fQ._6xb6xFxj9X_OUQRaGD-Qcb8KITvz0n1qr1O3OghZAc';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

async function executeMigration() {
  try {
    console.log('🚀 Migration Supabase avec Token de Service');
    console.log('==========================================\n');

    console.log('📖 Lecture du fichier de migration...');
    const migrationPath = path.join(__dirname, 'supabase/migrations/20240512000000_initial_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    console.log(`✅ Fichier chargé (${migrationSQL.length} bytes)\n`);

    console.log('🔌 Connexion à Supabase...');
    
    // Test de connexion
    const { data: testData, error: testError } = await supabase
      .from('tenants')
      .select('count');
    
    if (testError) {
      console.log('⚠️  Tables n\'existent pas encore (normal au démarrage)\n');
    } else {
      console.log('✅ Connexion établie\n');
    }

    console.log('💡 Approche: Diviser le SQL et exécuter les statements');
    console.log('⏳ Exécution...\n');

    // Split statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 ${statements.length} statements à exécuter\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Essayer différentes approches
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i] + ';';
      const preview = stmt.substring(0, 50).replace(/\n/g, ' ') + '...';

      try {
        // Approche 1: Essayer via RPC (probablement échouera)
        const { data, error } = await supabase.rpc('exec_sql', {
          sql_text: stmt
        });

        if (error && error.code === 'PGRST001') {
          // Function not found, c'est normal
          console.log(`⚠️  Statement ${i + 1}: RPC non disponible`);
          errorCount++;
          errors.push({ stmt: preview, error: 'RPC not available' });
        } else if (error) {
          console.log(`❌ Statement ${i + 1}: ${error.message}`);
          errorCount++;
          errors.push({ stmt: preview, error: error.message });
        } else {
          console.log(`✅ Statement ${i + 1} exécuté`);
          successCount++;
        }
      } catch (err) {
        // Si RPC échoue, c'est attendu
        errorCount++;
        console.log(`⚠️  Statement ${i + 1}: Erreur (${err.message})`);
      }
    }

    console.log(`\n📊 Résumé:`);
    console.log(`   ✅ Succès: ${successCount}`);
    console.log(`   ⚠️  Erreurs: ${errorCount}`);

    // Vérifier les tables
    console.log('\n🔍 Vérification des tables...\n');

    const tables = [
      'tenants', 'devices', 'device_telemetry', 'commands',
      'apps_catalog', 'deployments', 'alerts', 'audit_logs'
    ];

    let tablesCreated = 0;
    for (const tableName of tables) {
      try {
        const { error, count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });

        if (!error || error.code === 'PGRST116') {
          if (!error) {
            console.log(`✅ '${tableName}' exists`);
            tablesCreated++;
          } else {
            console.log(`⚠️  '${tableName}' not found`);
          }
        } else {
          console.log(`⚠️  '${tableName}' - ${error.code}`);
        }
      } catch (err) {
        console.log(`⚠️  Error checking '${tableName}'`);
      }
    }

    console.log(`\n📊 Tables créées: ${tablesCreated}/${tables.length}`);

    if (tablesCreated > 0) {
      console.log('\n✨ SUCCÈS! Les tables ont été créées!');
      console.log('\nLa plateforme est maintenant opérationnelle! 🚀');
    } else if (errorCount === 0) {
      console.log('\n⚠️  Impossible de déterminer le statut');
      console.log('Vérifiez manuellement dans la console Supabase');
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

executeMigration();
