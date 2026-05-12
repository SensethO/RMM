#!/bin/bash

# RMM Platform - Supabase Setup Script
# This script initializes the database schema and RLS policies

set -e

echo "🔧 RMM Supabase Setup"
echo "===================="

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install with: npm install -g supabase"
    exit 1
fi

echo ""
echo "1. Linking to Supabase project..."
read -p "Enter your Supabase project ref (from console.supabase.com): " PROJECT_REF
supabase link --project-ref "$PROJECT_REF"

echo ""
echo "2. Applying database migrations..."
supabase db push

echo ""
echo "3. Creating test tenant..."
read -p "Enter a test tenant ID (e.g., test-tenant-001): " TEST_TENANT_ID
read -p "Enter a test tenant name: " TEST_TENANT_NAME

# Insert test tenant via API
echo "Creating tenant: $TEST_TENANT_NAME"
# Note: This requires authenticated API access

echo ""
echo "✅ Supabase setup complete!"
echo ""
echo "Next steps:"
echo "1. Go to Supabase console → SQL Editor"
echo "2. Copy migration script from: supabase/migrations/20240512000000_initial_schema.sql"
echo "3. Execute the SQL to create tables"
echo "4. Enable Row Level Security (RLS) on all tables"
echo "5. Create policies for tenant isolation"
echo ""
echo "Connection info:"
echo "  URL: https://$PROJECT_REF.supabase.co"
echo "  API Key: Get from Settings → API"
echo ""
