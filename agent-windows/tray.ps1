# ─────────────────────────────────────────────────────────────────────────────
# RMM Agent - Icône barre des tâches
# Lance l'agent Node.js en arrière-plan et expose un menu tray
# Usage : powershell -ExecutionPolicy Bypass -File tray.ps1 [-AgentScript <path>]
# ─────────────────────────────────────────────────────────────────────────────
param(
    [string]$AgentScript = ""
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ── Chemins ──────────────────────────────────────────────────────────────────
$SCRIPT_DIR  = $PSScriptRoot
if (-not $SCRIPT_DIR) { $SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path }

$AGENT_SCRIPT = if ($AgentScript) { $AgentScript } else {
    # Détecter automatiquement le bon script agent
    $candidates = @(
        Join-Path $SCRIPT_DIR "agent-DESKTOP-IDOTISM.js",
        Join-Path $SCRIPT_DIR "agent.js"
    )
    $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

$DATA_DIR = Join-Path $env:ProgramData "RMM"
$LOG_FILE = Join-Path $DATA_DIR "agent.log"
$PID_FILE = Join-Path $DATA_DIR "agent.pid"

if (-not (Test-Path $DATA_DIR)) { New-Item -ItemType Directory -Path $DATA_DIR -Force | Out-Null }

# ── Trouver node.exe ──────────────────────────────────────────────────────────
function Find-NodeExe {
    $candidates = @(
        (Get-Command "node.exe" -ErrorAction SilentlyContinue)?.Source,
        "$env:ProgramFiles\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    ) | Where-Object { $_ -and (Test-Path $_) }
    return ($candidates | Select-Object -First 1) ?? "node.exe"
}
$NODE_EXE = Find-NodeExe

# ── Gestion du processus agent ────────────────────────────────────────────────
function Get-AgentProc {
    if (Test-Path $PID_FILE) {
        $pidVal = Get-Content $PID_FILE -ErrorAction SilentlyContinue
        if ($pidVal -match '^\d+$') {
            return Get-Process -Id ([int]$pidVal) -ErrorAction SilentlyContinue
        }
    }
    return $null
}

function Start-AgentProc {
    if (-not $AGENT_SCRIPT -or -not (Test-Path $AGENT_SCRIPT)) {
        [System.Windows.Forms.MessageBox]::Show(
            "Script agent introuvable :`n$AGENT_SCRIPT",
            "RMM Agent - Erreur", "OK", "Error") | Out-Null
        return $null
    }
    $proc = Start-Process -FilePath $NODE_EXE `
        -ArgumentList "`"$AGENT_SCRIPT`"" `
        -WorkingDirectory $SCRIPT_DIR `
        -WindowStyle Hidden `
        -PassThru
    Start-Sleep -Milliseconds 800
    if ($proc -and -not $proc.HasExited) {
        Set-Content -Path $PID_FILE -Value $proc.Id -Encoding UTF8
        return $proc
    }
    return $null
}

function Stop-AgentProc {
    $proc = Get-AgentProc
    if ($proc) {
        try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
        Start-Sleep -Milliseconds 400
    }
    Remove-Item $PID_FILE -ErrorAction SilentlyContinue
}

# ── Icône (extraite de shell32.dll icon #77 = moniteur) ─────────────────────
function Get-TrayIcon {
    try {
        # Moniteur vert / application icon depuis shell32
        $iconIndex = 77   # moniteur écran plat dans shell32
        $shell32 = "$env:SystemRoot\System32\shell32.dll"
        Add-Type -MemberDefinition @'
[DllImport("shell32.dll", CharSet=CharSet.Auto)]
public static extern IntPtr ExtractIcon(IntPtr hInst, string lpszExeFileName, int nIconIndex);
'@ -Name Shell32 -Namespace Win32 -ErrorAction SilentlyContinue
        $hIcon = [Win32.Shell32]::ExtractIcon([IntPtr]::Zero, $shell32, $iconIndex)
        if ($hIcon -ne [IntPtr]::Zero) {
            return [System.Drawing.Icon]::FromHandle($hIcon)
        }
    } catch {}
    # Fallback : icône application système
    return [System.Drawing.SystemIcons]::Application
}

# ── Créer la NotifyIcon ────────────────────────────────────────────────────────
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon    = Get-TrayIcon
$tray.Text    = "RMM Agent"
$tray.Visible = $true

# ── Menu contextuel ────────────────────────────────────────────────────────────
$menu = New-Object System.Windows.Forms.ContextMenuStrip

# Titre (non cliquable)
$itemTitle = New-Object System.Windows.Forms.ToolStripMenuItem
$itemTitle.Text    = "RMM Agent"
$itemTitle.Enabled = $false
$itemTitle.Font    = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)

$sep1 = New-Object System.Windows.Forms.ToolStripSeparator

# Voir les logs
$itemLogs = New-Object System.Windows.Forms.ToolStripMenuItem
$itemLogs.Text = "   Voir le suivi (logs)"
$itemLogs.Add_Click({
    if (Test-Path $LOG_FILE) {
        # Ouvre une fenêtre PowerShell qui suit le log en temps réel
        $cmd = "& { `$host.UI.RawUI.WindowTitle = 'RMM Agent - Suivi'; " +
               "Write-Host '=== RMM Agent - Logs en temps reel ===' -ForegroundColor Cyan; " +
               "Get-Content -Path '$LOG_FILE' -Wait -Tail 80 }"
        Start-Process powershell -ArgumentList "-NoProfile -NoExit -Command $cmd" -WindowStyle Normal
    } else {
        [System.Windows.Forms.MessageBox]::Show(
            "Aucun log disponible.`nL'agent n'a pas encore ecrit de log.",
            "RMM Agent", "OK", "Information") | Out-Null
    }
})

# Relancer
$itemRestart = New-Object System.Windows.Forms.ToolStripMenuItem
$itemRestart.Text = "   Relancer l'agent"
$itemRestart.Add_Click({
    $itemRestart.Enabled = $false
    $itemRestart.Text = "   Relance en cours..."
    Stop-AgentProc
    Start-Sleep -Milliseconds 1000
    $proc = Start-AgentProc
    $itemRestart.Enabled = $true
    $itemRestart.Text = "   Relancer l'agent"
    if ($proc) {
        $tray.ShowBalloonTip(3000, "RMM Agent", "Agent relance (PID $($proc.Id))", [System.Windows.Forms.ToolTipIcon]::Info)
        $tray.Text = "RMM Agent - PID $($proc.Id)"
    } else {
        $tray.ShowBalloonTip(3000, "RMM Agent", "Erreur au demarrage de l'agent", [System.Windows.Forms.ToolTipIcon]::Error)
    }
})

$sep2 = New-Object System.Windows.Forms.ToolStripSeparator

# Quitter
$itemQuit = New-Object System.Windows.Forms.ToolStripMenuItem
$itemQuit.Text = "   Quitter"
$itemQuit.Add_Click({
    Stop-AgentProc
    $tray.Visible = $false
    $tray.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$menu.Items.AddRange(@($itemTitle, $sep1, $itemLogs, $itemRestart, $sep2, $itemQuit))
$tray.ContextMenuStrip = $menu

# Double-clic = ouvrir les logs directement
$tray.Add_DoubleClick({
    $itemLogs.PerformClick()
})

# ── Démarrer l'agent si pas déjà actif ────────────────────────────────────────
$existingProc = Get-AgentProc
if (-not $existingProc) {
    $proc = Start-AgentProc
    if ($proc) {
        $tray.Text = "RMM Agent - PID $($proc.Id)"
        $tray.ShowBalloonTip(3000, "RMM Agent", "Agent demarre (PID $($proc.Id))", [System.Windows.Forms.ToolTipIcon]::Info)
    } else {
        $tray.ShowBalloonTip(3000, "RMM Agent", "Impossible de demarrer l'agent !", [System.Windows.Forms.ToolTipIcon]::Error)
    }
} else {
    $tray.Text = "RMM Agent - PID $($existingProc.Id)"
    $tray.ShowBalloonTip(2000, "RMM Agent", "Agent deja actif (PID $($existingProc.Id))", [System.Windows.Forms.ToolTipIcon]::Info)
}

# ── Watchdog : verifier que l'agent tourne toujours (toutes les 30s) ──────────
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 30000
$timer.Add_Tick({
    $proc = Get-AgentProc
    if (-not $proc) {
        $tray.Text = "RMM Agent - ARRETE"
        $tray.ShowBalloonTip(4000, "RMM Agent", "Agent arrete ! Redemarrage automatique...", [System.Windows.Forms.ToolTipIcon]::Warning)
        $newProc = Start-AgentProc
        if ($newProc) { $tray.Text = "RMM Agent - PID $($newProc.Id)" }
    } else {
        $tray.Text = "RMM Agent - PID $($proc.Id)"
    }
})
$timer.Start()

# ── Boucle Windows Forms ───────────────────────────────────────────────────────
[System.Windows.Forms.Application]::Run()
