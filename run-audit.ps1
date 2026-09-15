Write-Host '=== Step 1: Building production bundle ===' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host 'BUILD FAILED!' -ForegroundColor Red; exit 1 }

Write-Host '=== Step 2: Starting preview server ===' -ForegroundColor Cyan
$srv = Start-Process -FilePath 'npx' -ArgumentList 'vite','preview','--host','0.0.0.0','--port','5173' -PassThru -NoNewWindow

Write-Host 'Waiting for server to be ready...'
$ready = $false
$tries = 0
while ($tries -lt 20) {
  Start-Sleep 2
  try {
    $status = (Invoke-WebRequest 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 2).StatusCode
    if ($status -eq 200) { $ready = $true; break }
  } catch {}
  $tries++
}

if (-not $ready) {
  Write-Host 'Server not ready!' -ForegroundColor Red
  Stop-Process -Id $srv.Id -ErrorAction SilentlyContinue
  exit 1
}
Write-Host 'Server ready! Status 200 confirmed.' -ForegroundColor Green

Write-Host '=== Step 3: Running k6 load test ===' -ForegroundColor Cyan
Remove-Item -Force -ErrorAction SilentlyContinue .\k6-summary.txt
& 'C:\k6\k6-v0.48.0-windows-amd64\k6.exe' run .\performance\load-test.js > .\k6-summary.txt 2>&1
$k6code = $LASTEXITCODE
Write-Host ('k6 exit code: ' + $k6code)

Write-Host '=== Step 4: Running Lighthouse audit ===' -ForegroundColor Cyan
npm run perf:lighthouse
$lhcode = $LASTEXITCODE

Write-Host '=== ALL DONE ===' -ForegroundColor Green
Write-Host ('k6: ' + $k6code + ' | Lighthouse: ' + $lhcode)
Stop-Process -Id $srv.Id -ErrorAction SilentlyContinue
