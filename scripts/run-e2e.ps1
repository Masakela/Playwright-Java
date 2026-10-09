# Start the reference agent, run the Java live suite against it, then stop it.
# Requires: Node (for the agent), JDK 17+ & Maven, and (first run) Playwright browsers.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$port = if ($env:PORT) { $env:PORT } else { "8787" }
$base = "http://localhost:$port"
$env:AGENT_BASE_URL = $base
$env:PORT = $port

# Corporate-proxy guard: make the local agent bypass any HTTP(S)_PROXY (which
# otherwise intercepts localhost and answers 403). Merge, don't clobber.
$locals = "localhost,127.0.0.1,::1"
$env:NO_PROXY = if ($env:NO_PROXY) { "$($env:NO_PROXY),$locals" } else { $locals }
$env:no_proxy = $env:NO_PROXY

Write-Host "Starting reference agent on $base ..."
$agent = Start-Process -FilePath "node" -ArgumentList "agent-server/server.js" -PassThru -NoNewWindow
try {
    for ($i = 0; $i -lt 30; $i++) {
        try { Invoke-RestMethod "$base/health" -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 }
    }
    Write-Host "== Java suite (UI + offline + live) =="
    mvn -q clean test "-Dsurefire.suiteXmlFiles=testng-ci.xml" "-Dagent.base.url=$base"
    node scripts/kpi-report.js --junit target/surefire-reports --out kpis-out
    Write-Host "Done. KPI dashboard: kpis-out/index.html"
}
finally {
    if ($agent -and -not $agent.HasExited) { Stop-Process -Id $agent.Id -Force }
}
