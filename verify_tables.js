const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ebgjazfgxsumzbsvyrna.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU3MjQ5OSwiZXhwIjoyMDk0MTQ4NDk5fQ._6xb6xFxj9X_OUQRaGD-Qcb8KITvz0n1qr1O3OghZAc'
);

async function verifyTables() {
  const tables = ['tenants', 'devices', 'device_telemetry', 'commands', 'apps_catalog', 'deployments', 'alerts', 'audit_logs'];
  
  console.log('🔍 Vérification des tables Supabase...\n');
  
  for (const table of tables) {
    try {
      const { data, error, status } = await supabase.from(table).select('*').limit(0);
      
      if (status === 200) {
        console.log('✅', table.padEnd(20), '- CRÉÉE');
      } else if (error && error.code === 'PGRST116') {
        console.log('❌', table.padEnd(20), '- Inexistante');
      } else {
        console.log('⚠️ ', table.padEnd(20), '-', error?.message || 'Erreur inconnue');
      }
    } catch (err) {
      console.log('❌', table.padEnd(20), '- Erreur:', err.message);
    }
  }
}

verifyTables();
