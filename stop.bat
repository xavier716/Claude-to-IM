@echo off
REM 停止 Claude-to-IM 守护进程

echo.
echo ============================================
echo 停止 Claude-to-IM 守护进程
echo ============================================
echo.

echo [*] 正在停止所有 Node.js 进程...
taskkill /F /IM node.exe >nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo ✓ 守护进程已停止
) else (
    echo [!] 没有运行中的守护进程
)

echo.
pause
