# Azure AD Permissions Reduction Script
# This script automatically removes unnecessary permissions from your RMM app

param(
    [string]$AppName = "RMM",
    [switch]$KeepDirectoryRead = $false,
    [switch]$WhatIf = $true
)

Write-Host "🔐 Azure AD Permissions Reduction Tool" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if connected to Azure
try {
    $context = Get-AzContext
    if (-not $context) {
        Write-Host "❌ Not connected to Azure. Connecting..." -ForegroundColor Red
        Connect-AzAccount
    }
    Write-Host "✓ Connected to: $($context.Tenant.TenantId)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: Please install Azure PowerShell module" -ForegroundColor Red
    Write-Host "   Install with: Install-Module -Name Az -AllowClobber" -ForegroundColor Yellow
    exit 1
}

# Find the app
Write-Host ""
Write-Host "🔍 Finding app: $AppName" -ForegroundColor Cyan
$app = Get-AzADApplication -DisplayName $AppName
if (-not $app) {
    Write-Host "❌ App not found: $AppName" -ForegroundColor Red
    Write-Host "Available apps:" -ForegroundColor Yellow
    Get-AzADApplication | Select-Object -ExpandProperty DisplayName
    exit 1
}

Write-Host "✓ Found app: $($app.DisplayName)" -ForegroundColor Green
Write-Host "  App ID: $($app.AppId)" -ForegroundColor Gray

# Permissions to remove (Microsoft Graph resource ID: 00000003-0000-0000-c000-000000000000)
$GRAPH_RESOURCE_ID = "00000003-0000-0000-c000-000000000000"
$permissionsToRemove = @(
    "Mail.Read",
    "Mail.ReadWrite",
    "MailboxSettings.Read",
    "MailboxSettings.ReadWrite",
    "DeviceManagementManagedDevices.Read.All",
    "DeviceManagementManagedDevices.ReadWrite.All",
    "Directory.ReadWrite.All",
    "User.ReadWrite.All",
    "User.ReadWrite",
    "Application.Read.All",
    "Application.ReadWrite.All",
    "Organization.Read.All"
)

# Optionally keep Directory.Read.All for super-admin group support
if (-not $KeepDirectoryRead) {
    $permissionsToRemove += "Directory.Read.All"
}

$permissionsToKeep = @(
    "openid",      # OpenID Connect
    "profile",     # OpenID Connect
    "email",       # OpenID Connect
    "User.Read"    # Microsoft Graph - read current user
)

if ($KeepDirectoryRead) {
    $permissionsToKeep += "Directory.Read.All"
}

Write-Host ""
Write-Host "📋 Current Required Permissions:" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
foreach ($perm in $permissionsToKeep) {
    Write-Host "  ✓ $perm" -ForegroundColor Green
}

Write-Host ""
Write-Host "🗑️  Permissions to Remove:" -ForegroundColor Yellow
Write-Host "=======================" -ForegroundColor Yellow
foreach ($perm in $permissionsToRemove) {
    Write-Host "  ❌ $perm" -ForegroundColor Red
}

if ($KeepDirectoryRead) {
    Write-Host ""
    Write-Host "ℹ️  Keeping Directory.Read.All for Azure AD group support" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "ℹ️  Removing Directory.Read.All (not needed unless using Azure AD groups)" -ForegroundColor Cyan
}

Write-Host ""

if ($WhatIf) {
    Write-Host "⚠️  Running in WhatIf mode (no changes will be made)" -ForegroundColor Yellow
    Write-Host "To apply changes, run with: -WhatIf:\$false" -ForegroundColor Yellow
    Write-Host ""
}

# Get Graph service principal
Write-Host "🔗 Getting Microsoft Graph service principal..." -ForegroundColor Cyan
$graphSpn = Get-AzADServicePrincipal -Filter "AppId eq '$GRAPH_RESOURCE_ID'"
if (-not $graphSpn) {
    Write-Host "❌ Could not find Microsoft Graph service principal" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Found Microsoft Graph SPN" -ForegroundColor Green

# Get service principal for the app
$appSpn = Get-AzADServicePrincipal -Filter "AppId eq '$($app.AppId)'"
if (-not $appSpn) {
    Write-Host "❌ Could not find service principal for app" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔄 Removing Unnecessary Permissions..." -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

$removedCount = 0
$notFoundCount = 0

foreach ($permName in $permissionsToRemove) {
    # Find the permission ID in Microsoft Graph
    $permission = $graphSpn.AppRole | Where-Object { $_.Value -eq $permName }

    if ($permission) {
        Write-Host "  Removing: $permName" -ForegroundColor Yellow

        if (-not $WhatIf) {
            try {
                # Remove the permission
                Remove-AzADAppPermission -ObjectId $appSpn.Id -ResourceId $graphSpn.Id -AppRoleId $permission.Id -ErrorAction Stop
                Write-Host "    ✓ Removed" -ForegroundColor Green
                $removedCount++
            } catch {
                Write-Host "    ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
            }
        } else {
            Write-Host "    [WhatIf] Would remove" -ForegroundColor Gray
            $removedCount++
        }
    } else {
        Write-Host "  ⚠️  Not found (already removed?): $permName" -ForegroundColor Gray
        $notFoundCount++
    }
}

Write-Host ""
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "=========" -ForegroundColor Cyan
Write-Host "  Removed: $removedCount permissions" -ForegroundColor Green
Write-Host "  Not found: $notFoundCount permissions" -ForegroundColor Gray
Write-Host ""

if (-not $WhatIf) {
    Write-Host "✅ Permissions have been updated!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️  IMPORTANT: You may need to:" -ForegroundColor Yellow
    Write-Host "  1. Grant admin consent in Azure Portal (App Registration → API Permissions → Grant admin consent)" -ForegroundColor Yellow
    Write-Host "  2. Ask users to log out and back in" -ForegroundColor Yellow
    Write-Host "  3. Monitor logs for any errors" -ForegroundColor Yellow
} else {
    Write-Host "📝 This was a preview. No changes were made." -ForegroundColor Cyan
    Write-Host "To apply: .\reduce-azure-permissions.ps1 -AppName '$AppName' -WhatIf:\$false" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
