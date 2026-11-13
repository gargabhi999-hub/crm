# Nexus Microservices Startup Script
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
Set-Location $root

Write-Host "Starting CRM services locally..." -ForegroundColor Cyan

# 1. Cleanup CRM ports if in use
Write-Host "Checking for conflicting processes on ports 4000 and 5173..." -ForegroundColor Yellow
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
Write-Host "Launching Unified CRM Backend Server on port 4000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; node server/server.js" -WorkingDirectory $root -WindowStyle Normal

# 3. Wait for services to initialize
Write-Host "Waiting for backend to initialize and connect to database..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# 4. Launch Vite Client
Write-Host "Launching Vite Frontend Client on port 5173..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\client'; npm run dev" -WorkingDirectory "$root\client" -WindowStyle Normal

Write-Host "All services and the client launched successfully!" -ForegroundColor Green
Write-Host "Access your CRM at: http://localhost:5173" -ForegroundColor Cyan
