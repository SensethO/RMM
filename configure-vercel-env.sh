#!/bin/bash

# Frontend Environment Variables
FRONTEND_VARS=(
  "VITE_API_URL=https://backend-h5m9ggtt2-sensethos-projects.vercel.app"
  "VITE_AZURE_CLIENT_ID=5572b04e-78e5-440e-a36e-919f07ff8956"
  "VITE_AZURE_AUTHORITY=https://login.microsoftonline.com/56de879c-d3d0-4bb3-8230-35477d85a1f0"
  "VITE_SUPABASE_URL=https://ebgjazfgxsumzbsvyrna.supabase.co"
  "VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NzI0OTksImV4cCI6MjA5NDE0ODQ5OX0.7O2ydW1hQnDOvcGF30t0ywcGATqGWdDnc7NZhuXxLSs"
)

# Backend Environment Variables
BACKEND_VARS=(
  "NODE_ENV=production"
  "SUPABASE_URL=https://ebgjazfgxsumzbsvyrna.supabase.co"
  "SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NzI0OTksImV4cCI6MjA5NDE0ODQ5OX0.7O2ydW1hQnDOvcGF30t0ywcGATqGWdDnc7NZhuXxLSs"
  "SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ2phemZneHN1bXpic3Z5cm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU3MjQ5OSwiZXhwIjoyMDk0MTQ4NDk5fQ._6xb6xFxj9X_OUQRaGD-Qcb8KITvz0n1qr1O3OghZAc"
  "AZURE_TENANT_ID=56de879c-d3d0-4bb3-8230-35477d85a1f0"
  "AZURE_CLIENT_ID=5572b04e-78e5-440e-a36e-919f07ff8956"
  "AZURE_CLIENT_SECRET=10c28ec2-c026-40fd-853c-f4116d1f2575"
  "JWT_SECRET=rmm-production-jwt-secret-2024-change-this"
  "FRONTEND_URL=https://frontend-xi-one-36.vercel.app"
)

echo "📋 Configuring Frontend Environment Variables..."
cd frontend
for var in "${FRONTEND_VARS[@]}"; do
  echo "  Adding: $var"
  vercel env add ${var%%=*} <<< "${var#*=}" 2>/dev/null || true
done
echo "✅ Frontend env vars configured"

echo ""
echo "📋 Configuring Backend Environment Variables..."
cd ../backend
for var in "${BACKEND_VARS[@]}"; do
  echo "  Adding: $var"
  vercel env add ${var%%=*} <<< "${var#*=}" 2>/dev/null || true
done
echo "✅ Backend env vars configured"

echo ""
echo "✅ All environment variables configured!"
echo "📝 Now redeploying both projects..."
echo ""

cd ../frontend
echo "🚀 Redeploying frontend..."
vercel deploy --prod > /dev/null 2>&1 &
FE_PID=$!

cd ../backend
echo "🚀 Redeploying backend..."
vercel deploy --prod > /dev/null 2>&1 &
BE_PID=$!

wait $FE_PID $BE_PID
echo "✅ Deployments complete!"

