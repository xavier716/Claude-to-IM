# Smart startup script that auto-detects Claude Code path
# This prevents version mismatch issues in the future

Write-Host "Claude-to-IM Smart Startup Script" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green
Write-Host ""

# Kill existing Node.js processes
Write-Host "Stopping existing Node.js processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Auto-detect Claude Code path from VSCode extensions
$claudeCodePath = $null
$vscodeExtensionsPath = "$env:USERPROFILE\.vscode\extensions"

if (Test-Path $vscodeExtensionsPath) {
  $claudeExtensions = Get-ChildItem $vscodeExtensionsPath -Directory | Where-Object { $_.Name -like 'anthropic.claude-code*' }
  if ($claudeExtensions) {
    # Get the latest version by sorting descending
    $latestExtension = $claudeExtensions | Sort-Object Name -Descending | Select-Object -First 1
    $claudeExePath = Join-Path $latestExtension.FullName "resources\native-binary\claude.exe"

    if (Test-Path $claudeExePath) {
      $claudeCodePath = $claudeExePath
      Write-Host "✓ Auto-detected Claude Code: $claudeCodePath" -ForegroundColor Green
    } else {
      Write-Host "✗ Claude Code extension found but exe not found at: $claudeExePath" -ForegroundColor Red
    }
  } else {
    Write-Host "✗ No Claude Code VSCode extension found" -ForegroundColor Red
  }
}

# Fallback to config file if auto-detection failed
if (-not $claudeCodePath) {
  Write-Host "Attempting to read from config file..." -ForegroundColor Yellow
  $configPath = "$env:USERPROFILE\.claude-to-im\config.env"
  if (Test-Path $configPath) {
    $configContent = Get-Content $configPath | Where-Object { $_ -match 'CTI_CLAUDE_CODE_EXECUTABLE=' }
    if ($configContent) {
      $claudeCodePath = ($configContent -split '=')[1].Trim()
      if (Test-Path $claudeCodePath) {
        Write-Host "✓ Using Claude Code from config: $claudeCodePath" -ForegroundColor Green
      } else {
        Write-Host "✗ Configured path does not exist: $claudeCodePath" -ForegroundColor Red
        $claudeCodePath = $null
      }
    }
  }
}

# Final fallback: PATH search
if (-not $claudeCodePath) {
  Write-Host "Searching for claude.exe in PATH..." -ForegroundColor Yellow
  $claudeInPath = Get-Command claude -ErrorAction SilentlyContinue
  if ($claudeInPath) {
    $claudeCodePath = $claudeInPath.Source
    Write-Host "✓ Found claude.exe in PATH: $claudeCodePath" -ForegroundColor Green
  }
}

# If still not found, error out
if (-not $claudeCodePath) {
  Write-Host ""
  Write-Host "ERROR: Claude Code executable not found!" -ForegroundColor Red
  Write-Host "Please install Claude Code: https://docs.anthropic.com/en/docs/claude-code" -ForegroundColor Red
  exit 1
}

# Set environment variables
$env:CTI_CLAUDE_CODE_EXECUTABLE = $claudeCodePath
$env:CLAUDE_CODE_GIT_BASH_PATH = "C:\Git\bin\bash.exe"

# Change to the script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host ""
Write-Host "Starting Claude-to-IM daemon..." -ForegroundColor Cyan
Write-Host "Using Claude Code: $env:CTI_CLAUDE_CODE_EXECUTABLE" -ForegroundColor Cyan
Write-Host "Using Git Bash: $env:CLAUDE_CODE_GIT_BASH_PATH" -ForegroundColor Cyan
Write-Host ""

# Start the daemon in background
$process = Start-Process -FilePath "node" -ArgumentList "dist\daemon.mjs" -WindowStyle Hidden -RedirectStandardOutput "daemon.log" -RedirectStandardError "daemon-error.log" -PassThru

Start-Sleep -Seconds 3

Write-Host "✓ Daemon started with PID: $($process.Id)" -ForegroundColor Green
Write-Host ""

# Show status
$statusPath = "C:\Users\DXJJ\.claude-to-im\runtime\status.json"
if (Test-Path $statusPath) {
  Write-Host "Status:" -ForegroundColor Cyan
  Get-Content $statusPath
} else {
  Write-Host "Status file not ready yet (this is normal on first start)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "To view logs in real-time:" -ForegroundColor Cyan
Write-Host "  Get-Content 'C:\Users\DXJJ\.claude-to-im\logs\bridge.log' -Tail 50 -Wait" -ForegroundColor White
Write-Host ""
Write-Host "To stop the daemon:" -ForegroundColor Cyan
Write-Host "  Stop-Process -Id $($process.Id) -Force" -ForegroundColor White
Write-Host ""
