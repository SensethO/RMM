const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ebgjazfgxsumzbsvyrna.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU3MjQ5OSwiZXhwIjoyMDk0MTQ4NDk5fQ._6xb6xFxj9X_OUQRaGD-Qcb8KITvz0n1qr1O3OghZAc'
);

async function verifyTables() {
  const tables = ['tenants', 'devices', 'device_telemetry', 'commands', 'apps_catalog', 'deployments', 'alerts', 'audit_logs'];
  
  console.log('\n📊 Vérification des tables créées:\n');
  
  let allCreated = true;
  for (const table of tables) {
    try {
      const { data, error, status } = await supabase.from(table).select('*').limit(1);
      
      if (status === 200 || (error && error.code !== 'PGRST116')) {
        console.log('✅', table.padEnd(20), '- CRÉÉE');
      } else {
        console.log('❌', table.padEnd(20), '- Introuvable');
        allCreated = false;
      }
    } catch (err) {
      console.log('⚠️ ', table.padEnd(20), '- Erreur:', err.message);
      allCreated = false;
    }
  }
  
  console.log('\n' + (allCreated ? '✅ Toutes les tables sont créées!' : '⚠️ Vérifiez les tables manquantes'));
  process.exit(allCreated ? 0 : 1);
}

verifyTables();
