@echo off
REM Auto-start Claude-to-IM daemon on system boot

setlocal enabledelayedexpansion

REM Set project directory
set "PROJECT_DIR=C:\Users\DXJJ\.claude\skills\Claude-to-IM"
set "LOG_FILE=%PROJECT_DIR%\daemon-autostart.log"

REM Set environment variables
set "CTI_CLAUDE_CODE_EXECUTABLE=C:\Users\DXJJ\.vscode\extensions\anthropic.claude-code-2.1.94-win32-x64\resources\native-binary\claude.exe"
set "CLAUDE_CODE_GIT_BASH_PATH=C:\Git\bin\bash.exe"

REM Switch to project directory
cd /d "%PROJECT_DIR%"

REM Log startup time
echo ============================================ >> "%LOG_FILE%"
echo [%DATE% %TIME%] Starting Claude-to-IM daemon... >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

REM Wait for network and system ready
timeout /t 10 /nobreak >nul

REM Start daemon (background)
start /B node dist\daemon.mjs >> "%LOG_FILE%" 2>&1

REM Wait for startup
timeout /t 5 /nobreak >nul

REM Verify status
tasklist /FI "IMAGENAME eq node.exe" | find "node.exe" >nul
if %ERRORLEVEL% EQU 0 (
    echo [%DATE% %TIME%] Daemon started successfully >> "%LOG_FILE%"
) else (
    echo [%DATE% %TIME%] ERROR: Daemon failed to start >> "%LOG_FILE%"
)

endlocal
