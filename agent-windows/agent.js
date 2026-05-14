/**
 * RMM Agent - Mini agent Node.js pour Windows
 * Aucune dépendance externe, utilise uniquement les modules built-in Node.js
 *
 * Usage: node agent.js
 */

const AGENT_VERSION = '1.1.0';
const AGENT_RAW_URL = 'https://raw.githubusercontent.com/SensethO/RMM/master/agent-windows/agent.js';

const https = require('https');
const http  = require('http');
const os    = require('os');
const { execSync } = require('child_process');

// ─── Configuration ────────────────────────────────────────────────────────────
const CONFIG = {
  backend:  'https://backend-xi-one-36.vercel.app',
  username: 'admin',
  password: 'demo123',
};

// Paramètres actifs (mis à jour depuis le backend)
let agentConfig = {
  telemetryInterval: 30,   // secondes
  pollInterval:      15,   // secondes
  commandTimeout:    30,   // secondes
  maxOutputLength:  1000,  // caractères
  alerts: {
    cpuThreshold:  80,
    ramThreshold:  90,
    diskThreshold: 85,
  },
};

// ─── State ────────────────────────────────────────────────────────────────────
let authToken      = null;
let deviceDbId     = null;   // UUID Supabase du device (retourné par /register)
let deviceInfo     = null;
let telemetryTimer = null;
let pollTimer      = null;

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

// ─── Public IP ───────────────────────────────────────────────────────────────
function fetchPublicIp() {
  return new Promise((resolve) => {
    https.get('https://api.ipify.org?format=json', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data).ip); } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// ─── Disk usage (Windows: partition C:) ──────────────────────────────────────
function getDiskPercent() {
  // PowerShell first (wmic supprimé dans Windows 11 22H2+)
  try {
    const out = execSync(
      `powershell -NoProfile -Command "$d=Get-PSDrive C;''+$d.Used+','+$d.Free"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const [usedStr, freeStr] = out.trim().split(',');
    const used = parseInt(usedStr), free = parseInt(freeStr);
    const total = used + free;
    if (total > 0) return Math.round(used / total * 100);
  } catch {}
  // Fallback: wmic (Windows 10 / anciennes versions)
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

// ─── Fetch config from backend ────────────────────────────────────────────────
async function fetchConfig(silent = false) {
  try {
    const res = await request('GET', `/api/devices/${deviceDbId}/config`, null);
    if (res.status === 200 && res.data?.data) {
      const c = res.data.data;
      const prev = { ...agentConfig };
      if (c.telemetryInterval) agentConfig.telemetryInterval = c.telemetryInterval;
      if (c.pollInterval)      agentConfig.pollInterval      = c.pollInterval;
      if (c.commandTimeout)    agentConfig.commandTimeout    = c.commandTimeout;
      if (c.maxOutputLength)   agentConfig.maxOutputLength   = c.maxOutputLength;
      if (c.alerts)            agentConfig.alerts            = { ...agentConfig.alerts, ...c.alerts };

      const changed = prev.telemetryInterval !== agentConfig.telemetryInterval
                   || prev.pollInterval      !== agentConfig.pollInterval;
      // Log seulement si changement en cours d'exécution (pas au démarrage)
      if (changed && !silent) {
        console.log(`🔧 Config mise à jour depuis le backend :`);
        console.log(`   Télémetrie : ${agentConfig.telemetryInterval}s | Poll : ${agentConfig.pollInterval}s`);
        console.log(`   Seuils → CPU: ${agentConfig.alerts.cpuThreshold}% | RAM: ${agentConfig.alerts.ramThreshold}% | Disk: ${agentConfig.alerts.diskThreshold}%`);
        return true; // intervals changed → caller should restart timers
      }
      return changed;
    }
  } catch (e) {
    console.warn('   ⚠️  Config fetch failed (using current values):', e.message);
  }
  return false;
}

// ─── Start/restart interval timers ───────────────────────────────────────────
function restartTimers() {
  if (telemetryTimer) clearInterval(telemetryTimer);
  if (pollTimer)      clearInterval(pollTimer);

  telemetryTimer = setInterval(async () => {
    try { await sendTelemetry(); } catch (e) { console.error('Telemetry error:', e.message); }
  }, agentConfig.telemetryInterval * 1000);

  pollTimer = setInterval(async () => {
    try { await pollCommands(); } catch (e) { console.error('Poll error:', e.message); }
  }, agentConfig.pollInterval * 1000);
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
    status:        'online',
    ip_address:    getIpAddress(),
    last_seen:     new Date().toISOString(),
    agent_version: AGENT_VERSION,
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
    status:        'online',
    last_seen:     new Date().toISOString(),
    ip_address:    getIpAddress(),
    agent_version: AGENT_VERSION,
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
      output = await executeCommand(cmd.command_type, cmd.params || {});
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
      output:    output.substring(0, agentConfig.maxOutputLength),
    });
  }
}

async function executeCommand(type, params) {
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

    case 'list_dir': {
      const fs   = require('fs');
      const path = require('path');
      const dir  = params.path || 'C:\\';
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const result = entries.slice(0, 200).map(e => {
        let size = 0, modified = '';
        try {
          const stat = fs.statSync(path.join(dir, e.name));
          size     = stat.size;
          modified = stat.mtime.toISOString().substring(0, 16).replace('T', ' ');
        } catch {}
        return {
          name:     e.name,
          type:     e.isDirectory() ? 'dir' : 'file',
          size,
          modified,
        };
      });
      // Sort: dirs first, then files
      result.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return JSON.stringify({ path: dir, entries: result, total: entries.length }, null, 2);
    }

    case 'read_file': {
      const fs   = require('fs');
      const filePath = params.path;
      if (!filePath) throw new Error('Missing path param');
      const stat = fs.statSync(filePath);
      if (stat.size > 512 * 1024) throw new Error(`Fichier trop grand (${Math.round(stat.size/1024)}KB). Max 512KB.`);
      return fs.readFileSync(filePath, 'utf8');
    }

    case 'disk_info': {
      // PowerShell first (wmic supprimé dans Windows 11 22H2+)
      try {
        const ps = "$drives=Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Used -ne $null};" +
          "$drives | ForEach-Object {" +
          "  $t=$_.Used+$_.Free;" +
          "  [PSCustomObject]@{drive=$_.Name+':';label=$_.Root;" +
          "    total_gb=[math]::Round($t/1GB,1);free_gb=[math]::Round($_.Free/1GB,1);" +
          "    used_pct=[math]::Round($_.Used/$t*100)}" +
          "} | ConvertTo-Json";
        const out = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: 'utf8', timeout: 8000 });
        const data = JSON.parse(out.trim());
        return JSON.stringify(Array.isArray(data) ? data : [data], null, 2);
      } catch {}
      // Fallback: wmic (Windows 10 / anciennes versions)
      try {
        const out = execSync('wmic logicaldisk get Caption,FreeSpace,Size,VolumeName /value', { encoding: 'utf8', timeout: 5000 });
        const drives = [];
        const blocks = out.split('\r\n\r\n').filter(b => b.includes('Caption='));
        for (const block of blocks) {
          const caption    = (block.match(/Caption=(.+)/)     || [])[1]?.trim();
          const free       = parseInt((block.match(/FreeSpace=(\d+)/)  || [])[1] || '0');
          const size       = parseInt((block.match(/Size=(\d+)/)       || [])[1] || '0');
          const volumeName = (block.match(/VolumeName=(.*)/) || [])[1]?.trim() || '';
          if (caption && size > 0) {
            drives.push({
              drive:      caption,
              label:      volumeName,
              total_gb:   +(size / 1024**3).toFixed(1),
              free_gb:    +(free / 1024**3).toFixed(1),
              used_pct:   Math.round((size - free) / size * 100),
            });
          }
        }
        return JSON.stringify(drives, null, 2);
      } catch (e) {
        return `Erreur disk_info: ${e.message}`;
      }
    }

    case 'get_network_info': {
      const ifaces = os.networkInterfaces();
      const adapters = [];
      for (const [name, addrs] of Object.entries(ifaces)) {
        for (const addr of addrs) {
          if (!addr.internal) {
            adapters.push({ name, family: addr.family, address: addr.address, mac: addr.mac });
          }
        }
      }

      // Gateway + DNS via ipconfig /all (FR et EN)
      let gateways = [], dnsServers = [];
      try {
        const ipcfg = execSync('ipconfig /all', { encoding: 'utf8', timeout: 5000 });
        const gwMatches = [...ipcfg.matchAll(/(?:Default Gateway|Passerelle par d[^:]*)\.*\s*:\s*([\d.]+)/gi)];
        const dnsMatches = [...ipcfg.matchAll(/(?:DNS Servers|Serveurs DNS)\.*\s*:\s*([\d.]+)/gi)];
        gateways   = [...new Set(gwMatches.map(m => m[1]).filter(Boolean))];
        dnsServers = [...new Set(dnsMatches.map(m => m[1]).filter(Boolean))];
      } catch {}

      const publicIp = await fetchPublicIp();

      return JSON.stringify({
        public_ip:  publicIp || 'unavailable',
        local_ip:   getIpAddress(),
        hostname:   os.hostname(),
        adapters,
        gateways,
        dns_servers: dnsServers,
        timestamp:  new Date().toISOString(),
      }, null, 2);
    }

    case 'bandwidth_test': {
      const testSizes = [
        { label: '5 MB',  bytes: 5_000_000  },
        { label: '20 MB', bytes: 20_000_000 },
      ];
      const results = [];

      for (const { label, bytes } of testSizes) {
        const url   = `https://speed.cloudflare.com/__down?bytes=${bytes}`;
        const start = Date.now();
        try {
          const received = await new Promise((resolve, reject) => {
            let total = 0;
            https.get(url, res => {
              res.on('data', chunk => { total += chunk.length; });
              res.on('end',  () => resolve(total));
              res.on('error', reject);
            }).on('error', reject);
          });
          const elapsed = (Date.now() - start) / 1000;
          results.push({
            test:       label,
            download_mbps: +((received * 8) / (elapsed * 1e6)).toFixed(2),
            elapsed_s:  +elapsed.toFixed(2),
            received_mb: +(received / 1024 / 1024).toFixed(2),
          });
        } catch (e) {
          results.push({ test: label, error: e.message });
        }
      }

      // Upload test: POST 2 MB to Cloudflare
      let uploadMbps = null;
      try {
        const uploadBytes = 2_000_000;
        const buf = Buffer.alloc(uploadBytes, 'x');
        const upStart = Date.now();
        await new Promise((resolve, reject) => {
          const req = https.request({
            hostname: 'speed.cloudflare.com',
            path: '/__up',
            method: 'POST',
            headers: { 'Content-Length': uploadBytes, 'Content-Type': 'application/octet-stream' },
          }, res => { res.resume(); res.on('end', resolve); });
          req.on('error', reject);
          req.write(buf);
          req.end();
        });
        const upElapsed = (Date.now() - upStart) / 1000;
        uploadMbps = +((uploadBytes * 8) / (upElapsed * 1e6)).toFixed(2);
      } catch {}

      const best = results.find(r => r.download_mbps)?.download_mbps;
      return JSON.stringify({
        timestamp:       new Date().toISOString(),
        download_mbps:   best || 0,
        upload_mbps:     uploadMbps,
        details:         results,
      }, null, 2);
    }

    case 'self_update': {
      // Télécharge la dernière version de l'agent depuis GitHub et remplace le fichier
      const fs       = require('fs');
      const path     = require('path');
      const rawUrl   = params.url ||
        'https://raw.githubusercontent.com/SensethO/RMM/master/agent-windows/agent.js';
      const selfPath = path.resolve(__filename);

      const content = await new Promise((resolve, reject) => {
        const url    = new URL(rawUrl);
        const driver = url.protocol === 'https:' ? require('https') : require('http');
        let data = '';
        driver.get(rawUrl, res => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          res.on('data', c => data += c);
          res.on('end', () => resolve(data));
        }).on('error', reject);
      });

      // Écrire la nouvelle version
      fs.writeFileSync(selfPath, content, 'utf8');
      // Lancer la nouvelle version en arrière-plan puis quitter
      const { spawn } = require('child_process');
      spawn(process.execPath, [selfPath], { detached: true, stdio: 'inherit' }).unref();
      setTimeout(() => process.exit(0), 500);
      return `✅ Mise à jour téléchargée (${content.length} octets). Redémarrage en cours...`;
    }

    default:
      return `Commande "${type}" reçue avec params: ${JSON.stringify(params)}`;
  }
}

// ─── Auto-update ─────────────────────────────────────────────────────────────
async function checkForUpdate() {
  try {
    const content = await new Promise((resolve, reject) => {
      https.get(AGENT_RAW_URL, res => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });

    // Extraire la version depuis le fichier distant
    const match = content.match(/AGENT_VERSION\s*=\s*'([^']+)'/);
    const remoteVersion = match?.[1];
    if (!remoteVersion || remoteVersion === AGENT_VERSION) return; // déjà à jour

    console.log(`\n🔄 Nouvelle version détectée : ${AGENT_VERSION} → ${remoteVersion}`);
    console.log('   Mise à jour en cours...');

    const fs   = require('fs');
    const path = require('path');
    fs.writeFileSync(path.resolve(__filename), content, 'utf8');

    console.log('   ✅ Fichier mis à jour. Redémarrage...');
    const { spawn } = require('child_process');
    spawn(process.execPath, [path.resolve(__filename)], { detached: true, stdio: 'inherit' }).unref();
    setTimeout(() => process.exit(0), 500);
  } catch (e) {
    // Silencieux : pas de mise à jour si GitHub injoignable
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

    // Charger la config depuis le backend
    console.log('\n⚙️  Chargement de la configuration...');
    await fetchConfig(true); // silent=true : pas de double log au démarrage
    console.log(`   Télémetrie : ${agentConfig.telemetryInterval}s | Poll : ${agentConfig.pollInterval}s`);
    console.log(`   Seuils → CPU: ${agentConfig.alerts.cpuThreshold}% | RAM: ${agentConfig.alerts.ramThreshold}% | Disk: ${agentConfig.alerts.diskThreshold}%`);

    await sendTelemetry();      // première mesure immédiate
    await pollCommands();

    // Boucles telemetrie + commandes (intervalles dynamiques)
    restartTimers();

    // Rechargement config toutes les 5 minutes
    setInterval(async () => {
      const changed = await fetchConfig();
      if (changed) restartTimers();
    }, 5 * 60 * 1000);

    console.log(`\n🟢 Agent actif ! (v${AGENT_VERSION})`);
    console.log(`   Télémetrie toutes les ${agentConfig.telemetryInterval}s`);
    console.log(`   Commandes toutes les  ${agentConfig.pollInterval}s`);
    console.log(`   Ctrl+C pour arrêter\n`);

    // Vérification de mise à jour au démarrage puis toutes les heures
    await checkForUpdate();
    setInterval(checkForUpdate, 60 * 60 * 1000);

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
