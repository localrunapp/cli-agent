# LocalRun Agent - Windows Installer

Write-Host "📦 Installing LocalRun Agent for Windows..." -ForegroundColor Cyan

# Check for Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not installed. Please install Node.js first: https://nodejs.org/"
    exit 1
}

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$AgentDir = Join-Path $ScriptDir "agent"

# Navigate to agent directory
Set-Location $AgentDir

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

# Build project
Write-Host "Building project..." -ForegroundColor Yellow
npm run build

# Create config directory
$ConfigDir = Join-Path $HOME ".localrun"
if (-not (Test-Path $ConfigDir)) {
    New-Item -ItemType Directory -Path $ConfigDir | Out-Null
}

# Create startup script
$StartupScript = Join-Path $ConfigDir "start-agent.ps1"
$LogFile = Join-Path $ConfigDir "agent.log"
$NodePath = (Get-Command node).Source
$AgentBin = Join-Path $AgentDir "bin\run.js"

$ScriptContent = @"
`$env:PATH = "$($env:PATH)"
& "$NodePath" "$AgentBin" serve --port 47777 > "$LogFile" 2>&1
"@

Set-Content -Path $StartupScript -Value $ScriptContent

# Create Scheduled Task
Write-Host "Setting up Scheduled Task..." -ForegroundColor Yellow
$TaskName = "LocalRunAgent"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -File `"$StartupScript`""
$Trigger = New-ScheduledTaskTrigger -AtLogon
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings | Out-Null

Write-Host "✓ Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To start the agent manually:"
Write-Host "  powershell -File `"$StartupScript`""
Write-Host ""
Write-Host "The agent will start automatically on next login."
