@echo off
setlocal enabledelayedexpansion

set "PROJECT_DIR=C:\Users\DXJJ\.claude\skills\Claude-to-IM"
set "STATUS_FILE=C:\Users\DXJJ\.claude-to-im\runtime\status.json"

echo ============================================
echo Claude-to-IM Health Check
echo ============================================
echo.

REM Check if status file exists
if not exist "%STATUS_FILE%" (
    echo [!] Status file not found - daemon not running
    goto :end
)

REM Parse status file
for /f "tokens=1,2 delims=:, " %%a in ('type "%STATUS_FILE%" ^| find "running"') do set "RUNNING=%%b"
for /f "tokens=2 delims=, " %%a in ('type "%STATUS_FILE%" ^| find "pid"') do set "DAEMON_PID=%%b"
for /f "tokens=2 delims=," %%a in ('type "%STATUS_FILE%" ^| find "startedAt"') do set "START_TIME=%%b"

echo [1/5] Daemon Status: %RUNNING%
echo [2/5] Process ID: %DAEMON_PID%

REM Check if process exists
tasklist /FI "PID eq %DAEMON_PID%" 2>nul | find "%DAEMON_PID%" >nul
if %ERRORLEVEL% EQU 0 (
    echo [3/5] Process Check: OK
) else (
    echo [3/5] Process Check: FAILED - Process not found
    goto :end
)

REM Check channels
echo [4/5] Enabled Channels:
type "%STATUS_FILE%" | find "channels" >nul
if %ERRORLEVEL% EQU 0 (
    type "%STATUS_FILE%" | find "feishu" >nul && echo     - Feishu: OK
    type "%STATUS_FILE%" | find "weixin" >nul && echo     - WeChat: OK
)

REM Check WeChat account
set "WEIXIN_ACCOUNTS=C:\Users\DXJJ\.claude-to-im\data\weixin-accounts.json"
if exist "%WEIXIN_ACCOUNTS%" (
    echo [5/5] WeChat Account: Configured
) else (
    echo [5/5] WeChat Account: NOT FOUND
)

echo.
echo ============================================
echo Health Check Complete
echo ============================================

:end
pause
