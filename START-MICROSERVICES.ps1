# Nexus Microservices Startup Script
Write-Host "🚀 Starting Nexus Microservices locally..." -ForegroundColor Cyan

# 1. Cleanup CRM ports if in use
Write-Host "🧹 Checking for conflicting processes on ports 4000 & 5173..." -ForegroundColor Yellow
$crmPorts = @(4000, 5173)
foreach ($p in $crmPorts) {
    $conn = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
    if ($conn) {
        $pids = $conn | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $pids) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}

# 2. Launch Monolithic Backend Server
Write-Host "📦 Launching Unified Monolithic CRM Server (4000)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node server/server.js" -WindowStyle Normal

# 3. Wait for services to initialize
Write-Host "⏳ Waiting for backend to initialize and sync schema..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# 4. Launch Vite Client
Write-Host "📦 Launching Vite Client (5173)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd client; npm run dev" -WindowStyle Normal

Write-Host "`n✅ All services and the client launched successfully!" -ForegroundColor Green
Write-Host "📍 Access your CRM at: http://localhost:5173" -ForegroundColor Blue
