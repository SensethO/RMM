# =============================================================================
# RMM Agent - Icone barre des taches (compatible Windows PowerShell 5.1)
# Usage : powershell -ExecutionPolicy Bypass -File tray.ps1
# =============================================================================
param([string]$AgentScript = "")

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ── Chemins (script:) pour les closures WinForms ─────────────────────────────
$script:SCRIPT_DIR = $PSScriptRoot
if (-not $script:SCRIPT_DIR) {
    $script:SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
}

# Trouver le script agent (cherche dans l'ordre : nom du PC, générique)
if ($AgentScript -and (Test-Path $AgentScript)) {
    $script:AGENT_SCRIPT = $AgentScript
} else {
    # Nom du PC courant pour matcher automatiquement le bon script
    $pcName = $env:COMPUTERNAME
    $c_pc   = (Join-Path $script:SCRIPT_DIR "agent-$pcName.js")
    $c1     = (Join-Path $script:SCRIPT_DIR "agent-DESKTOP-IDOTISM.js")
    $c2     = (Join-Path $script:SCRIPT_DIR "agent-Isno-Surf9.js")
    $c3     = (Join-Path $script:SCRIPT_DIR "agent.js")
    if     (Test-Path $c_pc) { $script:AGENT_SCRIPT = $c_pc }
    elseif (Test-Path $c1)   { $script:AGENT_SCRIPT = $c1 }
    elseif (Test-Path $c2)   { $script:AGENT_SCRIPT = $c2 }
    elseif (Test-Path $c3)   { $script:AGENT_SCRIPT = $c3 }
    else                     { $script:AGENT_SCRIPT = "" }
}

$script:DATA_DIR = Join-Path $env:ProgramData "RMM"
$script:LOG_FILE = Join-Path $script:DATA_DIR "agent.log"
$script:PID_FILE = Join-Path $script:DATA_DIR "agent.pid"

if (-not (Test-Path $script:DATA_DIR)) {
    New-Item -ItemType Directory -Path $script:DATA_DIR -Force | Out-Null
}

# ── Trouver node.exe ──────────────────────────────────────────────────────────
function Find-NodeExe {
    $gcmd = Get-Command "node.exe" -ErrorAction SilentlyContinue
    if ($gcmd -and (Test-Path $gcmd.Source)) { return $gcmd.Source }
    $p1 = "$env:ProgramFiles\nodejs\node.exe"
    $p2 = "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    if (Test-Path $p1) { return $p1 }
    if (Test-Path $p2) { return $p2 }
    return "node.exe"
}
$script:NODE_EXE = Find-NodeExe

# ── Gestion du processus agent ────────────────────────────────────────────────
function Get-AgentProc {
    if (Test-Path $script:PID_FILE) {
        $pidVal = Get-Content $script:PID_FILE -ErrorAction SilentlyContinue
        if ($pidVal -match '^\d+$') {
            $proc = Get-Process -Id ([int]$pidVal) -ErrorAction SilentlyContinue
            return $proc
        }
    }
    return $null
}

function Start-AgentProc {
    if (-not $script:AGENT_SCRIPT -or -not (Test-Path $script:AGENT_SCRIPT)) {
        [System.Windows.Forms.MessageBox]::Show(
            "Script agent introuvable :`n$($script:AGENT_SCRIPT)",
            "RMM Agent - Erreur",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
        return $null
    }
    $proc = Start-Process `
        -FilePath $script:NODE_EXE `
        -ArgumentList "`"$($script:AGENT_SCRIPT)`"" `
        -WorkingDirectory $script:SCRIPT_DIR `
        -WindowStyle Hidden `
        -PassThru
    Start-Sleep -Milliseconds 800
    if ($proc -and -not $proc.HasExited) {
        Set-Content -Path $script:PID_FILE -Value $proc.Id -Encoding UTF8
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
    Remove-Item $script:PID_FILE -ErrorAction SilentlyContinue
}

# ── Icone (shell32.dll) ───────────────────────────────────────────────────────
function Get-TrayIcon {
    try {
        $shell32 = "$env:SystemRoot\System32\shell32.dll"
        Add-Type -MemberDefinition '[DllImport("shell32.dll",CharSet=CharSet.Auto)] public static extern IntPtr ExtractIcon(IntPtr h,string f,int i);' `
            -Name Shell32 -Namespace Win32 -ErrorAction SilentlyContinue
        $hIcon = [Win32.Shell32]::ExtractIcon([IntPtr]::Zero, $shell32, 15)
        if ($hIcon -ne [IntPtr]::Zero) {
            return [System.Drawing.Icon]::FromHandle($hIcon)
        }
    } catch {}
    return [System.Drawing.SystemIcons]::Application
}

# ── NotifyIcon ────────────────────────────────────────────────────────────────
$script:tray = New-Object System.Windows.Forms.NotifyIcon
$script:tray.Icon    = Get-TrayIcon
$script:tray.Text    = "RMM Agent"
$script:tray.Visible = $true

# ── Menu ──────────────────────────────────────────────────────────────────────
$menu = New-Object System.Windows.Forms.ContextMenuStrip

$itemTitle = New-Object System.Windows.Forms.ToolStripMenuItem
$itemTitle.Text    = "RMM Agent"
$itemTitle.Enabled = $false
$itemTitle.Font    = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)

$sep1 = New-Object System.Windows.Forms.ToolStripSeparator

# -- Voir les logs
$script:itemLogs = New-Object System.Windows.Forms.ToolStripMenuItem
$script:itemLogs.Text = "  Voir le suivi (logs)"
$script:itemLogs.Add_Click({
    if (Test-Path $script:LOG_FILE) {
        $logPath = $script:LOG_FILE
        $args = "-NoProfile -NoExit -Command `"& { `$host.UI.RawUI.WindowTitle='RMM Agent - Suivi'; Get-Content -Path '$logPath' -Wait -Tail 80 }`""
        Start-Process powershell -ArgumentList $args -WindowStyle Normal
    } else {
        [System.Windows.Forms.MessageBox]::Show(
            "Aucun log disponible.`nL'agent n'a pas encore ecrit de log.",
            "RMM Agent",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
    }
})

# -- Relancer
$script:itemRestart = New-Object System.Windows.Forms.ToolStripMenuItem
$script:itemRestart.Text = "  Relancer l'agent"
$script:itemRestart.Add_Click({
    $script:itemRestart.Enabled = $false
    $script:itemRestart.Text    = "  Relance en cours..."
    Stop-AgentProc
    Start-Sleep -Milliseconds 1000
    $proc = Start-AgentProc
    $script:itemRestart.Enabled = $true
    $script:itemRestart.Text    = "  Relancer l'agent"
    if ($proc) {
        $script:tray.Text = "RMM Agent - PID $($proc.Id)"
        $script:tray.ShowBalloonTip(3000, "RMM Agent", "Agent relance (PID $($proc.Id))", [System.Windows.Forms.ToolTipIcon]::Info)
    } else {
        $script:tray.ShowBalloonTip(3000, "RMM Agent", "Erreur au demarrage !", [System.Windows.Forms.ToolTipIcon]::Error)
    }
})

$sep2 = New-Object System.Windows.Forms.ToolStripSeparator

# -- Quitter
$itemQuit = New-Object System.Windows.Forms.ToolStripMenuItem
$itemQuit.Text = "  Quitter"
$itemQuit.Add_Click({
    Stop-AgentProc
    $script:tray.Visible = $false
    $script:tray.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$menu.Items.Add($itemTitle)  | Out-Null
$menu.Items.Add($sep1)       | Out-Null
$menu.Items.Add($script:itemLogs)    | Out-Null
$menu.Items.Add($script:itemRestart) | Out-Null
$menu.Items.Add($sep2)       | Out-Null
$menu.Items.Add($itemQuit)   | Out-Null
$script:tray.ContextMenuStrip = $menu

# Double-clic = logs
$script:tray.Add_DoubleClick({
    $script:itemLogs.PerformClick()
})

# ── Demarrer l'agent au lancement ─────────────────────────────────────────────
$existingProc = Get-AgentProc
if (-not $existingProc) {
    $proc = Start-AgentProc
    if ($proc) {
        $script:tray.Text = "RMM Agent - PID $($proc.Id)"
        $script:tray.ShowBalloonTip(3000, "RMM Agent", "Agent demarre (PID $($proc.Id))", [System.Windows.Forms.ToolTipIcon]::Info)
    } else {
        $script:tray.ShowBalloonTip(4000, "RMM Agent", "Impossible de demarrer l'agent !", [System.Windows.Forms.ToolTipIcon]::Error)
    }
} else {
    $script:tray.Text = "RMM Agent - PID $($existingProc.Id)"
    $script:tray.ShowBalloonTip(2000, "RMM Agent", "Agent deja actif (PID $($existingProc.Id))", [System.Windows.Forms.ToolTipIcon]::Info)
}

# ── Watchdog toutes les 30s ───────────────────────────────────────────────────
$script:watchdog = New-Object System.Windows.Forms.Timer
$script:watchdog.Interval = 30000
$script:watchdog.Add_Tick({
    $proc = Get-AgentProc
    if (-not $proc) {
        $script:tray.Text = "RMM Agent - ARRETE"
        $script:tray.ShowBalloonTip(4000, "RMM Agent", "Agent arrete ! Redemarrage...", [System.Windows.Forms.ToolTipIcon]::Warning)
        $newProc = Start-AgentProc
        if ($newProc) { $script:tray.Text = "RMM Agent - PID $($newProc.Id)" }
    } else {
        $script:tray.Text = "RMM Agent - PID $($proc.Id)"
    }
})
$script:watchdog.Start()

# ── Boucle principale ─────────────────────────────────────────────────────────
[System.Windows.Forms.Application]::Run()
