param(
    [ValidateRange(1, 65535)]
    [int]$FrontendPort = 80
)

$ErrorActionPreference = "Stop"
$repoDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoDir ".env"
$templateFile = Join-Path $repoDir "env_example.txt"

if (Test-Path $envFile) {
    Write-Host "--> Existing .env file found; nothing changed."
    exit 0
}

if (-not (Test-Path $templateFile)) {
    throw "env_example.txt was not found."
}

function New-HexSecret([int]$ByteCount) {
    $bytes = New-Object byte[] $ByteCount
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }
    return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

$dbPassword = New-HexSecret 32
$jwtSecret = New-HexSecret 48
$content = Get-Content -Raw -Path $templateFile
$content = $content -replace '(?m)^DB_PASSWORD=.*$', "DB_PASSWORD=$dbPassword"
$content = $content -replace '(?m)^JWT_SECRET=.*$', "JWT_SECRET=$jwtSecret"
$content = $content -replace '(?m)^FRONTEND_PORT=.*$', "FRONTEND_PORT=$FrontendPort"

[System.IO.File]::WriteAllText($envFile, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "--> Created .env with generated DB and JWT secrets."
Write-Host "--> Optional LLM keys and MIN_COHORT_SIZE remain unset until approved values are provided."
