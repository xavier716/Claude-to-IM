@echo off
REM Claude-to-IM 自动启动脚本
REM 此脚本用于开机时自动启动守护进程

setlocal enabledelayedexpansion

REM 设置项目目录
set "PROJECT_DIR=C:\Users\DXJJ\.claude\skills\Claude-to-IM"
set "LOG_FILE=%PROJECT_DIR%\daemon.log"

REM 设置环境变量
set "CTI_CLAUDE_CODE_EXECUTABLE=C:\Users\DXJJ\.vscode\extensions\anthropic.claude-code-2.1.94-win32-x64\resources\native-binary\claude.exe"
set "CLAUDE_CODE_GIT_BASH_PATH=C:\Git\bin\bash.exe"

REM 切换到项目目录
cd /d "%PROJECT_DIR%"

REM 记录启动时间
echo ============================================ >> "%LOG_FILE%"
echo [%DATE% %TIME%] Starting Claude-to-IM daemon... >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"

REM 等待网络和系统就绪
timeout /t 10 /nobreak >nul

REM 启动守护进程（后台运行）
REM 直接设置环境变量并启动，不通过 cmd /c
set "CTI_CLAUDE_CODE_EXECUTABLE=%CTI_CLAUDE_CODE_EXECUTABLE%"
set "CLAUDE_CODE_GIT_BASH_PATH=%CLAUDE_CODE_GIT_BASH_PATH%"
start /B node dist\daemon.mjs >> "%LOG_FILE%" 2>&1

REM 等待启动完成
timeout /t 5 /nobreak >nul

REM 验证启动状态
tasklist /FI "IMAGENAME eq node.exe" | find "node.exe" >nul
if %ERRORLEVEL% EQU 0 (
    echo [%DATE% %TIME%] Daemon started successfully >> "%LOG_FILE%"
) else (
    echo [%DATE% %TIME%] ERROR: Daemon failed to start >> "%LOG_FILE%"
)

endlocal
