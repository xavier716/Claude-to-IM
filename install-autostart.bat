@echo off
REM Install Claude-to-IM auto-start on Windows boot

setlocal enabledelayedexpansion

set "SCRIPT_PATH=C:\Users\DXJJ\.claude\skills\Claude-to-IM\autostart-daemon.bat"
set "TASK_NAME=Claude-to-IM-Daemon"

echo ============================================
echo Claude-to-IM Auto-start Installation
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

REM Remove old task (if exists)
echo [*] Removing old task...
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

REM Create new scheduled task
echo [*] Creating scheduled task...
schtasks /Create /TN "%TASK_NAME%" /TR "%SCRIPT_PATH%" /SC ONLOGON /RL HIGHEST /F >nul 2>&1

if %errorLevel% EQU 0 (
    echo [OK] Scheduled task created successfully
    echo.
    echo ============================================
    echo Auto-start configured!
    echo ============================================
    echo.
    echo Task name: %TASK_NAME%
    echo Trigger: User logon
    echo Privilege: Highest
    echo.
    echo [*] Manual test:
    echo     autostart-daemon.bat
    echo.
    echo [*] View task:
    echo     schtasks /Query /TN "%TASK_NAME%"
    echo.
) else (
    echo [ERROR] Failed to create scheduled task
    echo [*] Error code: %errorLevel%
    echo.
)

pause
