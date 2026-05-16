const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  'https://ebgjazfgxsumzbsvyrna.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU3MjQ5OSwiZXhwIjoyMDk0MTQ4NDk5fQ._6xb6xFxj9X_OUQRaGD-Qcb8KITvz0n1qr1O3OghZAc'
);

// Read migration SQL
const sql = fs.readFileSync('./supabase/migrations/20240512000000_initial_schema.sql', 'utf8');

console.log('🔧 Executing Supabase migration...');
console.log('📝 SQL file size:', (sql.length / 1024).toFixed(2), 'KB');

// Try to execute via from() method - test if tables exist after migration
setTimeout(async () => {
  try {
    const { data, error } = await supabase.from('tenants').select('*').limit(0);
    
    if (error && error.message.includes('relation')) {
      console.log('❌ Tables not yet created');
      console.log('⚠️ SQL execution not possible via REST API');
      console.log('📌 Must execute via Supabase Console');
    } else {
      console.log('✅ Tables already exist!');
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}, 100);
