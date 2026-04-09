@echo off
REM Quick start Claude-to-IM daemon

echo.
echo ============================================
echo Claude-to-IM Quick Start
echo ============================================
echo.

REM Stop existing processes
echo [1/3] Stopping existing processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM Start daemon
echo [2/3] Starting daemon...
cd /d "C:\Users\DXJJ\.claude\skills\Claude-to-IM"

REM Set environment variables
set "CTI_CLAUDE_CODE_EXECUTABLE=C:\Users\DXJJ\.vscode\extensions\anthropic.claude-code-2.1.94-win32-x64\resources\native-binary\claude.exe"
set "CLAUDE_CODE_GIT_BASH_PATH=C:\Git\bin\bash.exe"

REM Start daemon
start /B node dist\daemon.mjs >> daemon.log 2>&1

REM Wait and verify
echo [3/3] Verifying startup...
timeout /t 5 /nobreak >nul

tasklist /FI "IMAGENAME eq node.exe" | find "node.exe" >nul
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo [OK] Daemon started successfully!
    echo ============================================
    echo.
    echo Channels: Feishu, WeChat
    echo.
    echo [*] Send messages in Feishu or WeChat
    echo [*] Log file: daemon.log
    echo.
) else (
    echo.
    echo [!] Startup failed, check daemon.log
    echo.
)

pause
