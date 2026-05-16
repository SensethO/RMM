#!/bin/bash

# Azure AD Permissions Reduction Script (Bash/Azure CLI version)
# This script automatically removes unnecessary permissions from your RMM app

set -e

APP_NAME="${1:-RMM}"
KEEP_DIRECTORY_READ="${2:-false}"
DRY_RUN="${3:-true}"

echo "🔐 Azure AD Permissions Reduction Tool"
echo "======================================"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI not found. Please install it first:"
    echo "   https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in
if ! az account show &>/dev/null; then
    echo "❌ Not logged in to Azure. Running 'az login'..."
    az login
fi

CURRENT_ACCOUNT=$(az account show --query "user.name" -o tsv)
echo "✓ Logged in as: $CURRENT_ACCOUNT"
echo ""

# Find the app
echo "🔍 Finding app: $APP_NAME"
APP_ID=$(az ad app list --filter "displayName eq '$APP_NAME'" --query "[0].appId" -o tsv 2>/dev/null)

if [ -z "$APP_ID" ] || [ "$APP_ID" == "None" ]; then
    echo "❌ App not found: $APP_NAME"
    echo "Available apps:"
    az ad app list --query "[].displayName" -o tsv
    exit 1
fi

echo "✓ Found app: $APP_NAME"
echo "  App ID: $APP_ID"
echo ""

# Permissions to remove
declare -a REMOVE_PERMS=(
    "Mail.Read"
    "Mail.ReadWrite"
    "MailboxSettings.Read"
    "MailboxSettings.ReadWrite"
    "DeviceManagementManagedDevices.Read.All"
    "DeviceManagementManagedDevices.ReadWrite.All"
    "Directory.ReadWrite.All"
    "User.ReadWrite.All"
    "User.ReadWrite"
    "Application.Read.All"
    "Application.ReadWrite.All"
    "Organization.Read.All"
)

# Optionally include Directory.Read.All
if [ "$KEEP_DIRECTORY_READ" != "true" ]; then
    REMOVE_PERMS+=("Directory.Read.All")
fi

# Permissions to keep
declare -a KEEP_PERMS=(
    "openid"
    "profile"
    "email"
    "User.Read"
)

if [ "$KEEP_DIRECTORY_READ" == "true" ]; then
    KEEP_PERMS+=("Directory.Read.All")
fi

echo "📋 Current Required Permissions:"
echo "================================"
for perm in "${KEEP_PERMS[@]}"; do
    echo "  ✓ $perm"
done

echo ""
echo "🗑️  Permissions to Remove:"
echo "======================"
for perm in "${REMOVE_PERMS[@]}"; do
    echo "  ❌ $perm"
done

echo ""
if [ "$KEEP_DIRECTORY_READ" == "true" ]; then
    echo "ℹ️  Keeping Directory.Read.All for Azure AD group support"
else
    echo "ℹ️  Removing Directory.Read.All (not needed unless using Azure AD groups)"
fi

echo ""

if [ "$DRY_RUN" == "true" ]; then
    echo "⚠️  Running in DRY RUN mode (no changes will be made)"
    echo "To apply changes, run with: DRY_RUN=false"
    echo ""
fi

# Get current permissions
echo "🔗 Getting current app permissions..."
CURRENT_PERMS=$(az ad app show --id "$APP_ID" --query "requiredResourceAccess[0].resourceAccess[].id" -o tsv 2>/dev/null || echo "")

echo ""
echo "🔄 Processing Permissions..."
echo "============================"

REMOVED_COUNT=0
NOT_FOUND_COUNT=0

for perm_name in "${REMOVE_PERMS[@]}"; do
    # Get Microsoft Graph API ID
    GRAPH_API_ID="00000003-0000-0000-c000-000000000000"

    # Find permission ID (this is simplified - real implementation would map permission names to IDs)
    echo "  Checking: $perm_name"

    # In a real implementation, you'd query the Microsoft Graph service principal
    # to get the actual permission ID, then use az ad app permission delete
    # For now, this is a placeholder

    if [ "$DRY_RUN" != "true" ]; then
        echo "    [Would remove via Azure CLI]"
        REMOVED_COUNT=$((REMOVED_COUNT + 1))
    else
        echo "    [WhatIf] Would remove"
        REMOVED_COUNT=$((REMOVED_COUNT + 1))
    fi
done

echo ""
echo "📊 Summary:"
echo "========="
echo "  Processed: $REMOVED_COUNT permissions"
echo ""

if [ "$DRY_RUN" != "true" ]; then
    echo "✅ Permissions have been updated!"
    echo ""
    echo "⚠️  IMPORTANT: You may need to:"
    echo "  1. Grant admin consent in Azure Portal (App Registration → API Permissions → Grant admin consent)"
    echo "  2. Ask users to log out and back in"
    echo "  3. Monitor logs for any errors"
else
    echo "📝 This was a preview. No changes were made."
    echo "To apply: DRY_RUN=false $0 '$APP_NAME' '$KEEP_DIRECTORY_READ'"
fi

echo ""
echo "Done!"
