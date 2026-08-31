param(
    [ValidateRange(1, 65535)]
    [int]$FrontendPort = 80
)

$ErrorActionPreference = "Stop"
$repoDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoDir ".env"
$templateFile = Join-Path $repoDir "env_example.txt"

if (-not (Test-Path $templateFile)) {
    throw "env_example.txt was not found."
}

if (Test-Path $envFile) {
    $content = [System.IO.File]::ReadAllText($envFile)
    $existingKeys = @{}
    foreach ($line in ($content -split "`r?`n")) {
        if ($line -match '^\s+[A-Za-z_][A-Za-z0-9_]*\s*=' -or $line -match '^[A-Za-z_][A-Za-z0-9_]*\s+=') {
            throw ".env keys must not contain leading or trailing whitespace around the key name or '='."
        }
        if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=') {
            $key = $Matches[1]
            if ($existingKeys.ContainsKey($key)) {
                throw ".env contains duplicate key '$key'. Keep exactly one value."
            }
            $existingKeys[$key] = $true
        }
    }

    if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) {
        [System.IO.File]::AppendAllText($envFile, [Environment]::NewLine)
    }

    foreach ($line in [System.IO.File]::ReadAllLines($templateFile)) {
        if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=') {
            $key = $Matches[1]
            if (-not $existingKeys.ContainsKey($key)) {
                [System.IO.File]::AppendAllText($envFile, $line + [Environment]::NewLine)
                $existingKeys[$key] = $true
                Write-Host "--> Added missing $key to .env (template default)."
            }
        }
    }
    Write-Host "--> Existing .env validated and updated without replacing values."
    exit 0
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
$credentialsSource = "generated"

# Match the Unix recovery behaviour: if the API container is still running,
# reuse its credentials instead of disconnecting an existing PostgreSQL volume.
if (Get-Command docker -ErrorAction SilentlyContinue) {
    $projectName = if ($env:COMPOSE_PROJECT_NAME) { $env:COMPOSE_PROJECT_NAME } else { Split-Path $repoDir -Leaf }
    try {
        $apiContainer = docker ps `
            --filter "label=com.docker.compose.project=$projectName" `
            --filter "label=com.docker.compose.service=api-core" `
            --format '{{.ID}}' 2>$null | Select-Object -First 1
        if ($apiContainer) {
            $runtimeEnvironment = docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $apiContainer 2>$null
            $connection = $runtimeEnvironment | Where-Object { $_ -like 'ConnectionStrings__DefaultConnection=*' } | Select-Object -First 1
            $runtimeJwt = $runtimeEnvironment | Where-Object { $_ -like 'JwtSettings__Secret=*' } | Select-Object -First 1
            if ($connection -match '(?:^|;)Password=([^;]+)' -and $runtimeJwt) {
                $dbPassword = $Matches[1]
                $candidateJwt = $runtimeJwt.Substring('JwtSettings__Secret='.Length)
                if ($candidateJwt.Length -ge 32) {
                    $jwtSecret = $candidateJwt
                    $credentialsSource = "running containers"
                }
            }
        }
    }
    catch {
        # Docker is optional during .env creation; generated credentials remain.
    }
}
$content = Get-Content -Raw -Path $templateFile
$content = $content -replace '(?m)^DB_PASSWORD=.*$', "DB_PASSWORD=$dbPassword"
$content = $content -replace '(?m)^JWT_SECRET=.*$', "JWT_SECRET=$jwtSecret"
$content = $content -replace '(?m)^FRONTEND_PORT=.*$', "FRONTEND_PORT=$FrontendPort"

[System.IO.File]::WriteAllText($envFile, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "--> Created .env with DB and JWT secrets (source: $credentialsSource)."
Write-Host "--> Optional LLM keys and MIN_COHORT_SIZE remain unset until approved values are provided."
