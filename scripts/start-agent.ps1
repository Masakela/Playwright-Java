# Just start the reference agent in the foreground.
Set-Location (Join-Path $PSScriptRoot "..")
if (-not $env:PORT) { $env:PORT = "8080" }
node agent-server/server.js
