param([switch]$Full)
$ErrorActionPreference = 'Stop'
$stagingNames = @('STAGING_DB_URL', 'STAGING_SERVICE_ROLE_KEY', 'STAGING_PUBLISHABLE_KEY')
$stagingPrevious = @{}
foreach ($name in $stagingNames) { $stagingPrevious[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    if ([version]((node --version).TrimStart('v')) -lt [version]'22.23.4') { throw 'Node 22.23.4 or later is required.' }
    Write-Host 'Staging only: hiens-nha-staging / hitsdflorbqvoltsytxe. Never paste production credentials.'
    $stagingPassword = [System.Net.NetworkCredential]::new('', (Read-Host 'STAGING database password (hidden)' -AsSecureString)).Password
    $env:STAGING_DB_URL = 'postgresql://postgres.hitsdflorbqvoltsytxe:' + [Uri]::EscapeDataString($stagingPassword) + '@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
    $stagingPassword = $null
    $env:STAGING_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'STAGING legacy service_role key (hidden)' -AsSecureString)).Password
    $env:STAGING_PUBLISHABLE_KEY = Read-Host 'STAGING publishable key (sb_publishable_...)'
    if ($Full) { $stagingArgument = '--confirm-staging-full' } else { $stagingArgument = '--confirm-staging-ci' }
    node scripts/backend/staging-load.mjs $stagingArgument
    if ($LASTEXITCODE -ne 0) { throw 'Staging run failed. Keep the numeric report; do not retry blindly.' }
} finally {
    $stagingPassword = $null
    foreach ($name in $stagingNames) { [Environment]::SetEnvironmentVariable($name, $stagingPrevious[$name], 'Process') }
}
