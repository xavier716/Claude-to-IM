@echo off
REM Claude-to-IM Daemon Manager
REM Automatically starts and monitors the daemon

setlocal enabledelayedexpansion

set "PROJECT_DIR=C:\Users\DXJJ\.claude\skills\Claude-to-IM"
set "CTI_CLAUDE_CODE_EXECUTABLE=C:\Users\DXJJ\.vscode\extensions\anthropic.claude-code-2.1.94-win32-x64\resources\native-binary\claude.exe"
set "CLAUDE_CODE_GIT_BASH_PATH=C:\Git\bin\bash.exe"

cd /d "%PROJECT_DIR%"

echo ============================================
echo Claude-to-IM Daemon Manager
echo ============================================
echo.

REM Kill existing processes
echo [1/4] Stopping existing processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM Clean up old logs
echo [2/4] Cleaning up old logs...
if exist daemon.log (
    move /Y daemon.log daemon-old.log >nul 2>&1
)

REM Start daemon
echo [3/4] Starting daemon...
start /B cmd /c "set CTI_CLAUDE_CODE_EXECUTABLE=%CTI_CLAUDE_CODE_EXECUTABLE% && set CLAUDE_CODE_GIT_BASH_PATH=%CLAUDE_CODE_GIT_BASH_PATH% && node dist\daemon.mjs 2>&1" >> daemon.log

REM Wait and verify
echo [4/4] Verifying startup...
timeout /t 5 /nobreak >nul

tasklist /FI "IMAGENAME eq node.exe" | find "node.exe" >nul
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo Daemon Started Successfully!
    echo ============================================
    echo.
    echo Channels: Feishu, WeChat
    echo PID:
    tasklist /FI "IMAGENAME eq node.exe" | find "node.exe"
    echo.
    echo Log file: daemon.log
    echo.
    echo Press Ctrl+C to stop monitoring
    echo ============================================

    REM Monitor loop
    :monitor
    timeout /t 30 /nobreak >nul
    tasklist /FI "IMAGENAME eq node.exe" | find "node.exe" >nul
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [!] Daemon stopped, restarting...
        goto :start
    )
    goto :monitor
) else (
    echo [!] Failed to start daemon
    echo Check daemon.log for errors
)

pause
