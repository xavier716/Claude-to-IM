@echo off
REM 安装 Claude-to-IM 开机自动启动

setlocal enabledelayedexpansion

set "SCRIPT_PATH=C:\Users\DXJJ\.claude\skills\Claude-to-IM\autostart-daemon.bat"
set "TASK_NAME=Claude-to-IM-Daemon"

echo ============================================
echo Claude-to-IM 开机自动启动安装
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

REM 删除旧的任务（如果存在）
echo [*] 删除旧的任务计划...
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

REM 创建新的任务计划
echo [*] 创建任务计划...
schtasks /Create /TN "%TASK_NAME%" /TR "%SCRIPT_PATH%" /SC ONLOGON /RL HIGHEST /F >nul 2>&1

if %errorLevel% EQU 0 (
    echo [✓] 任务计划创建成功
    echo.
    echo ============================================
    echo 已配置开机自动启动！
    echo ============================================
    echo.
    echo 任务名称: %TASK_NAME%
    echo 触发方式: 用户登录时
    echo 运行权限: 最高权限
    echo.
    echo [*] 手动测试启动:
    echo     autostart-daemon.bat
    echo.
    echo [*] 查看任务计划:
    echo     schtasks /Query /TN "%TASK_NAME%"
    echo.
) else (
    echo [✗] 任务计划创建失败
    echo [*] 错误代码: %errorLevel%
    echo.
)

pause
