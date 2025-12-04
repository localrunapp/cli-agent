# LocalRun Agent - Windows Installer

$ErrorActionPreference = "Stop"
$Repo = "localrunapp/localrun"
$InstallDir = Join-Path $env:LOCALAPPDATA "localrun"
$BinPath = Join-Path $InstallDir "bin\localrun.cmd"

Write-Host "📦 Installing LocalRun Agent..." -ForegroundColor Cyan

# 1. Download Release
$Url = "https://github.com/$Repo/releases/latest/download/localrun-win32-x64.tar.gz"
$TempFile = Join-Path $env:TEMP "localrun-agent.tar.gz"

Write-Host "Downloading from $Url..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $Url -OutFile $TempFile
} catch {
    Write-Error "Failed to download agent. Please check your internet connection."
    exit 1
}

# 2. Extract
Write-Host "Extracting..." -ForegroundColor Yellow
if (Test-Path $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force
}
New-Item -ItemType Directory -Path $InstallDir | Out-Null

# Use tar to extract (available in Windows 10+)
tar -xzf $TempFile -C $InstallDir --strip-components=1

# 3. Setup Persistence (Scheduled Task)
Write-Host "Setting up Auto-Start (AtLogon)..." -ForegroundColor Yellow
$TaskName = "LocalRunAgent"
$ConfigDir = Join-Path $HOME ".localrun"
if (-not (Test-Path $ConfigDir)) { New-Item -ItemType Directory -Path $ConfigDir | Out-Null }

$LogFile = Join-Path $ConfigDir "agent.log"
$StartupScript = Join-Path $ConfigDir "start-agent.ps1"

# Create a wrapper script to run the agent
$ScriptContent = @"
`$env:PATH = "$($env:PATH);$InstallDir\bin"
& "$BinPath" serve > "$LogFile" 2>&1
"@
Set-Content -Path $StartupScript -Value $ScriptContent

# Register Task
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -File `"$StartupScript`""
$Trigger = New-ScheduledTaskTrigger -AtLogon
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings | Out-Null

# 4. Cleanup
Remove-Item $TempFile -ErrorAction SilentlyContinue

Write-Host "✓ Installation complete!" -ForegroundColor Green
Write-Host "The agent will start automatically when you log in."
Write-Host "To start it now, run: powershell -File `"$StartupScript`""
