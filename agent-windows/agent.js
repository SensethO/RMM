/**
 * RMM Agent - Mini agent Node.js pour Windows
 * Aucune dépendance externe, utilise uniquement les modules built-in Node.js
 *
 * Usage: node agent.js
 */

const https = require('https');
const http  = require('http');
const os    = require('os');
const { execSync } = require('child_process');

// ─── Configuration ────────────────────────────────────────────────────────────
const CONFIG = {
  backend:          'https://backend-xi-one-36.vercel.app',
  username:         'admin',
  password:         'demo123',
  telemetryInterval: 30_000,  // ms entre chaque envoi de télémetrie
  pollInterval:      15_000,  // ms entre chaque poll de commandes
};

// ─── State ────────────────────────────────────────────────────────────────────
let authToken  = null;
let deviceDbId = null;      // UUID Supabase du device (retourné par /register)
let deviceInfo = null;

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url    = new URL(CONFIG.backend + path);
    const driver = url.protocol === 'https:' ? https : http;
    const data   = body ? JSON.stringify(body) : undefined;

    const options = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': authToken ? `Bearer ${authToken}` : undefined,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    // Remove undefined headers
    Object.keys(options.headers).forEach(k => options.headers[k] === undefined && delete options.headers[k]);

    const req = driver.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── CPU usage ────────────────────────────────────────────────────────────────
function cpuSample() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    for (const val of Object.values(cpu.times)) total += val;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

async function getCpuPercent() {
  const s1 = cpuSample();
  await new Promise(r => setTimeout(r, 500));
  const s2 = cpuSample();
  const idleDiff  = s2.idle  - s1.idle;
  const totalDiff = s2.total - s1.total;
  return Math.round((1 - idleDiff / totalDiff) * 100);
}

// ─── RAM usage ────────────────────────────────────────────────────────────────
function getRamPercent() {
  const total = os.totalmem();
  const free  = os.freemem();
  return Math.round(((total - free) / total) * 100);
}

// ─── Disk usage (Windows: partition C:) ──────────────────────────────────────
function getDiskPercent() {
  try {
    const out = execSync(
      'wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size /value',
      { encoding: 'utf8', timeout: 5000 }
    );
    const free  = parseInt((out.match(/FreeSpace=(\d+)/) || [])[1] || '0');
    const total = parseInt((out.match(/Size=(\d+)/)      || [])[1] || '0');
    if (!total) return 0;
    return Math.round(((total - free) / total) * 100);
  } catch {
    return 0;
  }
}

// ─── OS version ───────────────────────────────────────────────────────────────
function getOsVersion() {
  try {
    return execSync('ver', { encoding: 'utf8', timeout: 3000 }).trim().replace(/\r\n/g, ' ');
  } catch {
    return os.version ? os.version() : os.release();
  }
}

// ─── Device ID stable ────────────────────────────────────────────────────────
function getDeviceId() {
  // Use hostname + first MAC address as stable identifier
  const hostname = os.hostname();
  const ifaces   = os.networkInterfaces();
  let mac = 'unknown';
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        mac = iface.mac.replace(/:/g, '');
        break;
      }
    }
    if (mac !== 'unknown') break;
  }
  return `WIN-${hostname.toUpperCase()}-${mac}`.substring(0, 50);
}

// ─── Step 1: Login ────────────────────────────────────────────────────────────
async function login() {
  console.log('🔐 Connexion au backend...');
  const res = await request('POST', '/api/auth/login', {
    username: CONFIG.username,
    password: CONFIG.password,
  });
  if (res.status !== 200 || !res.data.token) {
    throw new Error(`Login échoué (${res.status}): ${JSON.stringify(res.data)}`);
  }
  authToken = res.data.token;
  console.log('✅ Connecté !');
}

// ─── Step 2: Register device ──────────────────────────────────────────────────
async function registerDevice() {
  deviceInfo = {
    device_id:   getDeviceId(),
    device_name: os.hostname().toUpperCase(),
    os:          'Windows',
    os_version:  getOsVersion(),
    user_id:     os.userInfo().username,
  };

  console.log(`\n💻 Enregistrement du device...`);
  console.log(`   Hostname : ${deviceInfo.device_name}`);
  console.log(`   Device ID: ${deviceInfo.device_id}`);
  console.log(`   OS       : ${deviceInfo.os_version}`);

  const res = await request('POST', '/api/devices/register', deviceInfo);

  if (res.status === 201 && res.data.data) {
    deviceDbId = res.data.data.id;
    console.log(`✅ Device enregistré ! UUID: ${deviceDbId}`);
    return true;
  }

  if (res.status === 400 && res.data.error?.includes('already registered')) {
    console.log(`ℹ️  Device déjà enregistré, recherche de l'UUID...`);
    // Search existing device by listing and matching device_id
    const listRes = await request('GET', '/api/devices', null);
    if (listRes.status === 200 && listRes.data.data) {
      const found = listRes.data.data.find(d => d.device_id === deviceInfo.device_id);
      if (found) {
        deviceDbId = found.id;
        console.log(`✅ Device trouvé ! UUID: ${deviceDbId}`);
        return true;
      }
    }
  }

  console.error(`❌ Erreur enregistrement (${res.status}):`, res.data);
  return false;
}

// ─── Step 3: Update status online ────────────────────────────────────────────
async function setOnline() {
  await request('PATCH', `/api/devices/${deviceDbId}`, {
    status:     'online',
    ip_address: getIpAddress(),
    last_seen:  new Date().toISOString(),
  });
}

function getIpAddress() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (!iface.internal && iface.family === 'IPv4') return iface.address;
    }
  }
  return '0.0.0.0';
}

// ─── Step 4: Send telemetry ───────────────────────────────────────────────────
async function sendTelemetry() {
  const cpu    = await getCpuPercent();
  const ram    = getRamPercent();
  const disk   = getDiskPercent();
  const ts     = new Date().toISOString().replace('T', ' ').substring(0, 19);

  console.log(`📊 [${ts}] CPU: ${cpu}% | RAM: ${ram}% | Disk C: ${disk}%`);

  const res = await request('POST', `/api/devices/${deviceDbId}/telemetry`, {
    cpu_percent:      cpu,
    ram_percent:      ram,
    disk_percent:     disk,
    network_bytes_sec: 0,
  });

  if (res.status !== 201) {
    console.warn(`   ⚠️  Telemetry error (${res.status}):`, res.data?.error);
  }

  // Also update last_seen + status
  await request('PATCH', `/api/devices/${deviceDbId}`, {
    status:    'online',
    last_seen: new Date().toISOString(),
    ip_address: getIpAddress(),
  });
}

// ─── Step 5: Poll commands ────────────────────────────────────────────────────
async function pollCommands() {
  const res = await request('GET', `/api/commands/${deviceDbId}/pending`, null);
  if (res.status !== 200 || !res.data.data?.length) return;

  console.log(`\n⚙️  ${res.data.data.length} commande(s) en attente !`);

  for (const cmd of res.data.data) {
    console.log(`   ▶  ${cmd.command_type} (id: ${cmd.id.substring(0, 8)}...)`);

    // Ack: executing
    await request('PATCH', `/api/commands/${cmd.id}`, { status: 'executing' });

    // Execute
    let output = '';
    let exitCode = 0;
    let success = true;

    try {
      output = executeCommand(cmd.command_type, cmd.params || {});
      console.log(`   ✅ Succès: ${output.substring(0, 80)}`);
    } catch (err) {
      output   = err.message;
      exitCode = 1;
      success  = false;
      console.log(`   ❌ Echec: ${output}`);
    }

    // Report result
    await request('PATCH', `/api/commands/${cmd.id}`, {
      status:    success ? 'success' : 'failed',
      exit_code: exitCode,
      output:    output.substring(0, 1000),
    });
  }
}

function executeCommand(type, params) {
  switch (type) {
    case 'ping':
      return execSync(`ping -n 1 ${params.host || '8.8.8.8'}`, { encoding: 'utf8', timeout: 10000 });

    case 'get_info':
      return JSON.stringify({
        hostname:  os.hostname(),
        platform:  os.platform(),
        arch:      os.arch(),
        cpus:      os.cpus().length,
        totalRam:  Math.round(os.totalmem() / 1024 / 1024 / 1024) + ' GB',
        uptime:    Math.round(os.uptime() / 3600) + 'h',
      }, null, 2);

    case 'reboot':
      // Just simulate for demo (ne pas vraiment redémarrer !)
      return 'Reboot simulé (désactivé en demo). Uptime: ' + Math.round(os.uptime()) + 's';

    case 'run_script':
      if (!params.script) throw new Error('Missing script param');
      return execSync(params.script, { encoding: 'utf8', shell: 'cmd.exe', timeout: 30000 });

    case 'disk_cleanup':
      return `Disk cleanup simulé. Espace libre C: actuellement ${getDiskPercent()}% utilisé.`;

    default:
      return `Commande "${type}" reçue avec params: ${JSON.stringify(params)}`;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║        RMM Agent - Windows             ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`Backend: ${CONFIG.backend}\n`);

  try {
    await login();
    const ok = await registerDevice();
    if (!ok) { console.error('Impossible de s\'enregistrer.'); process.exit(1); }

    await setOnline();
    await sendTelemetry();      // première mesure immédiate
    await pollCommands();

    // Boucle telemetrie
    setInterval(async () => {
      try { await sendTelemetry(); } catch (e) { console.error('Telemetry error:', e.message); }
    }, CONFIG.telemetryInterval);

    // Boucle commandes
    setInterval(async () => {
      try { await pollCommands(); } catch (e) { console.error('Poll error:', e.message); }
    }, CONFIG.pollInterval);

    console.log(`\n🟢 Agent actif !`);
    console.log(`   Télémetrie toutes les ${CONFIG.telemetryInterval / 1000}s`);
    console.log(`   Commandes toutes les  ${CONFIG.pollInterval / 1000}s`);
    console.log(`   Ctrl+C pour arrêter\n`);

  } catch (err) {
    console.error('❌ Erreur fatale:', err.message);
    process.exit(1);
  }
}

// Gestion arrêt propre
process.on('SIGINT', async () => {
  console.log('\n\n🔴 Arrêt de l\'agent...');
  if (deviceDbId && authToken) {
    try {
      await request('PATCH', `/api/devices/${deviceDbId}`, { status: 'offline' });
      console.log('   Device marqué offline.');
    } catch {}
  }
  process.exit(0);
});

main();
