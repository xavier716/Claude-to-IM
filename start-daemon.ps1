# PowerShell script to start Claude-to-IM daemon with correct environment variables

# Kill existing Node.js processes
Write-Host "Stopping existing Node.js processes..."
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Set environment variables
$env:CTI_CLAUDE_CODE_EXECUTABLE = "C:\Users\DXJJ\.vscode\extensions\anthropic.claude-code-2.1.96-win32-x64\resources\native-binary\claude.exe"
$env:CLAUDE_CODE_GIT_BASH_PATH = "C:\Git\bin\bash.exe"

# Change to the script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "Starting Claude-to-IM daemon..."
Write-Host "Using Claude Code: $env:CTI_CLAUDE_CODE_EXECUTABLE"
Write-Host "Using Git Bash: $env:CLAUDE_CODE_GIT_BASH_PATH"

# Start the daemon in background
$process = Start-Process -FilePath "node" -ArgumentList "dist\daemon.mjs" -WindowStyle Hidden -RedirectStandardOutput "daemon.log" -RedirectStandardError "daemon-error.log" -PassThru

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "Daemon started with PID: $($process.Id)"
Write-Host ""

# Show status
if (Test-Path "C:\Users\DXJJ\.claude-to-im\runtime\status.json") {
    Get-Content "C:\Users\DXJJ\.claude-to-im\runtime\status.json"
} else {
    Write-Host "Status file not ready yet"
}

Write-Host ""
Write-Host "To view logs: Get-Content 'C:\Users\DXJJ\.claude-to-im\logs\bridge.log' -Tail 50 -Wait"
