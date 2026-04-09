@echo off
REM Uninstall Claude-to-IM auto-start

setlocal enabledelayedexpansion

set "TASK_NAME=Claude-to-IM-Daemon"

echo ============================================
echo Claude-to-IM Auto-start Uninstall
echo ============================================
echo.

REM Check admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Admin privileges required
    echo [*] Right-click this file and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

REM Remove scheduled task
echo [*] Removing scheduled task...
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

if %errorLevel% EQU 0 (
    echo [OK] Scheduled task removed
) else (
    echo [!] Task does not exist or removal failed
)

echo.
pause
