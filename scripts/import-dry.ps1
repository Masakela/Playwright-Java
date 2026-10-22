# Preview (dry-run) what would be pushed to Jira/Xray - no credentials needed.
# Run `mvn test` first so there are JUnit reports to read.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$reports = "target/surefire-reports"
if (-not (Test-Path $reports)) {
  Write-Error "No JUnit reports at $reports - run 'mvn test' first."
  exit 1
}
node scripts/import-results.js xray --junit $reports --dry-run
