@echo off
REM 卸载 Claude-to-IM 开机自动启动

setlocal enabledelayedexpansion

set "TASK_NAME=Claude-to-IM-Daemon"

echo ============================================
echo Claude-to-IM 开机自动启动卸载
echo ============================================
echo.

REM 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] 需要管理员权限
    echo [*] 请右键点击此文件，选择"以管理员身份运行"
    echo.
    pause
    exit /b 1
)

REM 删除任务计划
echo [*] 删除任务计划...
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

if %errorLevel% EQU 0 (
    echo [✓] 任务计划已删除
) else (
    echo [!] 任务计划不存在或删除失败
)

echo.
pause
