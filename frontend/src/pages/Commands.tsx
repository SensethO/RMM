import { useEffect, useState, useCallback, useRef } from 'react';
import { useApiClient } from '../hooks/useApi';
import { deviceAPI, commandAPI } from '../api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Device {
  id: string;
  device_id: string;
  device_name: string;
  status: string;
}

interface Command {
  id: string;
  command_type: string;
  params: Record<string, unknown>;
  status: 'pending' | 'executing' | 'success' | 'failed';
  output?: string;
  exit_code?: number;
  created_at: string;
  updated_at?: string;
}

interface DirEntry {
  name: string;
  type: 'dir' | 'file';
  size: number;
  modified: string;
}

interface DirResult {
  path: string;
  entries: DirEntry[];
  total: number;
}

// ─── Command definitions ──────────────────────────────────────────────────────

const COMMAND_DEFS = [
  {
    value: 'get_info',
    label: 'System Info',
    icon: 'ℹ️',
    color: 'blue',
    description: 'CPU, RAM, OS, uptime',
    params: [],
  },
  {
    value: 'disk_info',
    label: 'Disk Info',
    icon: '💿',
    color: 'purple',
    description: 'All drives usage',
    params: [],
  },
  {
    value: 'list_dir',
    label: 'List Directory',
    icon: '📁',
    color: 'yellow',
    description: 'Browse file system',
    params: [{ key: 'path', label: 'Path', placeholder: 'C:\\', required: false }],
  },
  {
    value: 'read_file',
    label: 'Read File',
    icon: '📄',
    color: 'green',
    description: 'View file contents (max 512KB)',
    params: [{ key: 'path', label: 'File Path', placeholder: 'C:\\path\\to\\file.txt', required: true }],
  },
  {
    value: 'ping',
    label: 'Ping',
    icon: '🔌',
    color: 'cyan',
    description: 'Network connectivity test',
    params: [{ key: 'host', label: 'Host', placeholder: '8.8.8.8', required: false }],
  },
  {
    value: 'run_script',
    label: 'Run Script',
    icon: '⚡',
    color: 'orange',
    description: 'Execute a command line',
    params: [{ key: 'script', label: 'Command', placeholder: 'ipconfig /all', required: true }],
  },
  {
    value: 'disk_cleanup',
    label: 'Disk Cleanup',
    icon: '🧹',
    color: 'teal',
    description: 'Report free disk space',
    params: [],
  },
  {
    value: 'reboot',
    label: 'Reboot',
    icon: '🔄',
    color: 'red',
    description: 'Reboot device (simulated)',
    params: [],
  },
] as const;

type CommandType = typeof COMMAND_DEFS[number]['value'];

const colorMap: Record<string, string> = {
  blue:   'bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-700',
  purple: 'bg-purple-50 border-purple-200 hover:bg-purple-100 text-purple-700',
  yellow: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100 text-yellow-700',
  green:  'bg-green-50 border-green-200 hover:bg-green-100 text-green-700',
  cyan:   'bg-cyan-50 border-cyan-200 hover:bg-cyan-100 text-cyan-700',
  orange: 'bg-orange-50 border-orange-200 hover:bg-orange-100 text-orange-700',
  teal:   'bg-teal-50 border-teal-200 hover:bg-teal-100 text-teal-700',
  red:    'bg-red-50 border-red-200 hover:bg-red-100 text-red-700',
};

const statusStyle: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-700',
  executing: 'bg-blue-100 text-blue-700 animate-pulse',
  success:   'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
};

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── File Browser Panel ───────────────────────────────────────────────────────

interface FileBrowserProps {
  result: DirResult;
  onNavigate: (path: string) => void;
  onReadFile: (path: string) => void;
  loading: boolean;
}

function FileBrowser({ result, onNavigate, onReadFile, loading }: FileBrowserProps) {
  const parts = result.path.replace(/\\/g, '/').split('/').filter(Boolean);

  const buildPath = (idx: number) => {
    if (idx < 0) return 'C:\\';
    const p = parts.slice(0, idx + 1).join('\\');
    // If first part ends with ':', it's a drive like 'C:'
    return parts[0]?.endsWith(':') ? p : '\\' + p;
  };

  const parentPath = () => {
    const p = result.path.replace(/\\$/, '');
    const idx = p.lastIndexOf('\\');
    if (idx <= 2) return p.substring(0, 3); // e.g. "C:\"
    return p.substring(0, idx);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-3 py-2 bg-gray-50 border-b border-gray-200 text-sm flex-wrap">
        <button
          onClick={() => onNavigate('C:\\')}
          className="text-blue-600 hover:underline font-mono"
        >
          C:\
        </button>
        {parts.map((part, idx) => (
          <span key={idx} className="flex items-center gap-1">
            <span className="text-gray-400">\</span>
            <button
              onClick={() => onNavigate(buildPath(idx))}
              className="text-blue-600 hover:underline font-mono"
            >
              {part}
            </button>
          </span>
        ))}
        {loading && <span className="ml-2 text-gray-400 text-xs">Loading...</span>}
      </div>

      {/* Up button */}
      {result.path.replace(/\\$/, '') !== 'C:' && (
        <button
          onClick={() => onNavigate(parentPath())}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 border-b border-gray-100"
        >
          <span>📂</span>
          <span className="font-mono">..</span>
          <span className="text-gray-400 text-xs ml-1">Parent directory</span>
        </button>
      )}

      {/* Entries */}
      <div className="flex-1 overflow-auto">
        {result.entries.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">Empty directory</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase w-24">Size</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase w-36">Modified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {result.entries.map((entry) => (
                <tr
                  key={entry.name}
                  className={`hover:bg-blue-50 cursor-pointer transition-colors ${entry.type === 'dir' ? 'font-medium' : ''}`}
                  onClick={() => {
                    const fullPath = result.path.endsWith('\\')
                      ? result.path + entry.name
                      : result.path + '\\' + entry.name;
                    if (entry.type === 'dir') {
                      onNavigate(fullPath);
                    } else {
                      onReadFile(fullPath);
                    }
                  }}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span>{entry.type === 'dir' ? '📁' : getFileIcon(entry.name)}</span>
                      <span className={`font-mono text-xs ${entry.type === 'dir' ? 'text-blue-700' : 'text-gray-700'}`}>
                        {entry.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-gray-500 font-mono">
                    {entry.type === 'dir' ? '—' : formatSize(entry.size)}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-gray-400">
                    {entry.modified}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400">
        {result.total} items total · showing {result.entries.length}
      </div>
    </div>
  );
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    txt: '📝', log: '📋', json: '📋', xml: '📋', yaml: '📋', yml: '📋',
    js: '📜', ts: '📜', py: '🐍', cs: '📜', go: '📜',
    exe: '⚙️', dll: '🔧', msi: '📦', bat: '⚙️', ps1: '⚙️', cmd: '⚙️',
    zip: '📦', rar: '📦', gz: '📦', '7z': '📦',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', bmp: '🖼️', svg: '🖼️',
    mp4: '🎬', avi: '🎬', mkv: '🎬', mp3: '🎵', wav: '🎵',
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙',
    html: '🌐', css: '🎨',
    ini: '⚙️', cfg: '⚙️', conf: '⚙️', env: '⚙️',
  };
  return map[ext] || '📄';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Commands() {
  const { isReady } = useApiClient();

  // Device state
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  // Command sending state
  const [selectedCmd, setSelectedCmd] = useState<CommandType>('get_info');
  const [params, setParams] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<Command[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedCmdOutput, setSelectedCmdOutput] = useState<Command | null>(null);

  // File browser state
  const [fileBrowser, setFileBrowser] = useState<DirResult | null>(null);
  const [fileBrowserLoading, setFileBrowserLoading] = useState(false);
  const [fileContent, setFileContent] = useState<{ path: string; content: string } | null>(null);

  // Auto-refresh
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Load devices ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isReady) return;
    deviceAPI.list({ limit: 200 }).then((res) => {
      if (res.data.data) {
        const devs = res.data.data as Device[];
        setDevices(devs);
        const online = devs.find((d) => d.status === 'online');
        if (online) setSelectedDevice(online);
        else if (devs.length > 0) setSelectedDevice(devs[0]);
      }
    });
  }, [isReady]);

  // ─── Load history ────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async (deviceId: string) => {
    try {
      setHistoryLoading(true);
      const res = await commandAPI.getHistory(deviceId, 30);
      if (res.data.data) {
        setHistory(res.data.data as Command[]);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isReady || !selectedDevice) return;
    loadHistory(selectedDevice.id);

    // Auto-refresh history
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      loadHistory(selectedDevice.id);
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isReady, selectedDevice, loadHistory]);

  // ─── Watch history for completed commands ────────────────────────────────────
  useEffect(() => {
    if (!selectedCmdOutput) return;
    const updated = history.find((c) => c.id === selectedCmdOutput.id);
    if (updated && updated.status !== selectedCmdOutput.status) {
      setSelectedCmdOutput(updated);
      // Auto-handle file browser / file content output
      handleCommandOutput(updated);
    }
  }, [history]);

  function handleCommandOutput(cmd: Command) {
    if (!cmd.output || cmd.status !== 'success') return;

    if (cmd.command_type === 'list_dir') {
      try {
        const parsed = JSON.parse(cmd.output) as DirResult;
        setFileBrowser(parsed);
        setFileContent(null);
        setFileBrowserLoading(false);
      } catch { /* not JSON */ }
    } else if (cmd.command_type === 'read_file') {
      const path = (cmd.params as Record<string, string>).path || '';
      setFileContent({ path, content: cmd.output });
      setFileBrowserLoading(false);
    }
  }

  // ─── Send command ────────────────────────────────────────────────────────────
  const sendCommand = async (cmdType: CommandType, cmdParams: Record<string, string> = params) => {
    if (!selectedDevice) return;
    setSending(true);
    setSendError(null);

    try {
      const res = await commandAPI.queue(selectedDevice.id, {
        command_type: cmdType,
        params: cmdParams as Record<string, unknown>,
      });
      if (res.data.data) {
        const newCmd = res.data.data as Command;
        setSelectedCmdOutput(newCmd);
        // Refresh history immediately
        await loadHistory(selectedDevice.id);
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send command');
    } finally {
      setSending(false);
    }
  };

  // ─── File browser navigation ──────────────────────────────────────────────────
  const navigateTo = (path: string) => {
    setFileBrowserLoading(true);
    sendCommand('list_dir', { path });
  };

  const readFile = (path: string) => {
    setFileBrowserLoading(true);
    sendCommand('read_file', { path });
    // Switch params to show the path
    setSelectedCmd('read_file');
    setParams({ path });
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const selectedDef = COMMAND_DEFS.find((c) => c.value === selectedCmd)!;

  const onSelectCmd = (type: CommandType) => {
    setSelectedCmd(type);
    setParams({});
    setSendError(null);
  };

  const isActive = (cmdType: string) => selectedCmdOutput?.command_type === cmdType
    && (selectedCmdOutput.status === 'pending' || selectedCmdOutput.status === 'executing');

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 h-full">

      {/* Device Selector Bar */}
      <div className="bg-white rounded-lg shadow px-6 py-4 flex items-center gap-4">
        <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">Target Device:</span>
        <select
          value={selectedDevice?.id || ''}
          onChange={(e) => {
            const dev = devices.find((d) => d.id === e.target.value);
            setSelectedDevice(dev || null);
            setFileBrowser(null);
            setFileContent(null);
            setSelectedCmdOutput(null);
          }}
          className="flex-1 max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {devices.length === 0 && <option value="">No devices</option>}
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.device_name} — {d.status === 'online' ? '🟢' : '⚫'} {d.status.toUpperCase()}
            </option>
          ))}
        </select>
        {selectedDevice && (
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            selectedDevice.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {selectedDevice.status === 'online' ? '🟢 Online' : '⚫ Offline'}
          </span>
        )}
      </div>

      {/* Main Grid: Command Panel + Output */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Left: Command Panel */}
        <div className="xl:col-span-2 flex flex-col gap-4">

          {/* Command Grid */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Commands</h3>
            <div className="grid grid-cols-2 gap-2">
              {COMMAND_DEFS.map((cmd) => (
                <button
                  key={cmd.value}
                  onClick={() => onSelectCmd(cmd.value as CommandType)}
                  className={`relative flex flex-col items-start p-3 rounded-lg border text-left transition ${
                    selectedCmd === cmd.value
                      ? colorMap[cmd.color] + ' ring-2 ring-offset-1 ring-blue-400'
                      : colorMap[cmd.color]
                  }`}
                >
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-xl">{cmd.icon}</span>
                    <span className="text-xs font-semibold">{cmd.label}</span>
                  </div>
                  <p className="text-xs mt-1 opacity-70">{cmd.description}</p>
                  {isActive(cmd.value) && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Params + Send */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{selectedDef.icon}</span>
              <h3 className="text-sm font-semibold text-gray-700">{selectedDef.label}</h3>
            </div>

            {selectedDef.params.length > 0 ? (
              <div className="space-y-3 mb-4">
                {selectedDef.params.map((p) => (
                  <div key={p.key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {p.label} {p.required && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      value={params[p.key] || ''}
                      onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                      placeholder={p.placeholder}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-4 italic">No parameters required</p>
            )}

            {sendError && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {sendError}
              </div>
            )}

            <button
              onClick={() => sendCommand(selectedCmd)}
              disabled={
                sending ||
                !selectedDevice ||
                selectedDevice.status !== 'online' ||
                (selectedDef.params.some((p) => p.required) &&
                  !selectedDef.params.filter((p) => p.required).every((p) => params[p.key]?.trim()))
              }
              className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Sending...
                </>
              ) : (
                <>▶ Execute {selectedDef.label}</>
              )}
            </button>
            {selectedDevice && selectedDevice.status !== 'online' && (
              <p className="text-xs text-red-500 mt-2 text-center">Device is offline</p>
            )}
          </div>
        </div>

        {/* Right: Output Panel */}
        <div className="xl:col-span-3 bg-white rounded-lg shadow flex flex-col overflow-hidden" style={{ minHeight: '420px' }}>
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">
              {fileContent
                ? `📄 ${fileContent.path.split('\\').pop()}`
                : fileBrowser
                ? `📁 File Browser — ${fileBrowser.path}`
                : selectedCmdOutput
                ? `Output — ${selectedCmdOutput.command_type}`
                : 'Output'}
            </h3>
            {(fileContent || fileBrowser) && (
              <div className="flex gap-2">
                {fileContent && fileBrowser && (
                  <button
                    onClick={() => { setFileContent(null); }}
                    className="text-xs px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
                  >
                    ← Back to browser
                  </button>
                )}
                <button
                  onClick={() => { setFileBrowser(null); setFileContent(null); setSelectedCmdOutput(null); }}
                  className="text-xs px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
                >
                  ✕ Clear
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {/* File Content View */}
            {fileContent ? (
              <div className="h-full flex flex-col">
                <div className="px-4 py-2 bg-gray-800 text-xs text-gray-400 font-mono border-b border-gray-700">
                  {fileContent.path}
                </div>
                <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-gray-200 bg-gray-900 whitespace-pre-wrap break-all">
                  {fileContent.content}
                </pre>
              </div>
            ) : fileBrowser ? (
              /* File Browser View */
              <FileBrowser
                result={fileBrowser}
                onNavigate={navigateTo}
                onReadFile={readFile}
                loading={fileBrowserLoading}
              />
            ) : selectedCmdOutput ? (
              /* Command Output View */
              <div className="h-full flex flex-col">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusStyle[selectedCmdOutput.status]}`}>
                    {selectedCmdOutput.status === 'executing' ? '⏳ Executing...' :
                     selectedCmdOutput.status === 'pending'   ? '⏸ Pending'     :
                     selectedCmdOutput.status === 'success'   ? '✅ Success'     :
                                                                '❌ Failed'}
                  </span>
                  <span className="text-xs text-gray-500 font-mono">{selectedCmdOutput.command_type}</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {new Date(selectedCmdOutput.created_at).toLocaleTimeString()}
                  </span>
                </div>
                {(selectedCmdOutput.status === 'pending' || selectedCmdOutput.status === 'executing') ? (
                  <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                    <div className="text-center">
                      <div className="text-4xl mb-4 animate-pulse">⏳</div>
                      <p>Waiting for device to execute...</p>
                      <p className="text-xs mt-1">Auto-refreshing every 4s</p>
                    </div>
                  </div>
                ) : selectedCmdOutput.output ? (
                  <pre className="flex-1 overflow-auto p-4 text-xs font-mono bg-gray-900 text-gray-200 whitespace-pre-wrap break-all">
                    {selectedCmdOutput.output}
                  </pre>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                    No output
                  </div>
                )}
              </div>
            ) : (
              /* Empty State */
              <div className="h-full flex items-center justify-center text-gray-300">
                <div className="text-center">
                  <div className="text-5xl mb-4">💻</div>
                  <p className="text-gray-500 font-medium">Select a command and click Execute</p>
                  <p className="text-gray-400 text-sm mt-1">Output will appear here</p>
                  {selectedDevice?.status === 'online' && (
                    <div className="mt-6 grid grid-cols-3 gap-2 max-w-xs mx-auto text-xs text-gray-400">
                      <button onClick={() => sendCommand('get_info')} className="p-2 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition">ℹ️ Quick Info</button>
                      <button onClick={() => sendCommand('disk_info')} className="p-2 rounded bg-purple-50 text-purple-600 hover:bg-purple-100 transition">💿 Disks</button>
                      <button onClick={() => { setSelectedCmd('list_dir'); sendCommand('list_dir', { path: 'C:\\' }); }} className="p-2 rounded bg-yellow-50 text-yellow-600 hover:bg-yellow-100 transition">📁 Browse C:\</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">
            Command History {historyLoading && <span className="text-xs text-gray-400 ml-2">Refreshing...</span>}
          </h3>
          <button
            onClick={() => selectedDevice && loadHistory(selectedDevice.id)}
            className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition"
          >
            Refresh
          </button>
        </div>
        {history.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No commands sent yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Params</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Output</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((cmd) => {
                  const def = COMMAND_DEFS.find((d) => d.value === cmd.command_type);
                  return (
                    <tr
                      key={cmd.id}
                      className={`hover:bg-gray-50 cursor-pointer transition ${
                        selectedCmdOutput?.id === cmd.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => {
                        setSelectedCmdOutput(cmd);
                        if (cmd.status === 'success') handleCommandOutput(cmd);
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span>{def?.icon || '⚙️'}</span>
                          <span className="font-mono text-xs">{cmd.command_type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                        {Object.entries(cmd.params || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusStyle[cmd.status]}`}>
                          {cmd.status === 'executing' ? '⏳ executing' :
                           cmd.status === 'pending'   ? '⏸ pending'   :
                           cmd.status === 'success'   ? '✅ success'   :
                                                        '❌ failed'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                        {cmd.output ? cmd.output.substring(0, 60) + (cmd.output.length > 60 ? '…' : '') : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(cmd.created_at).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCmdOutput(cmd);
                            if (cmd.status === 'success') handleCommandOutput(cmd);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
