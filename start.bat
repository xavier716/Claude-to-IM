@echo off
REM 快速启动 Claude-to-IM 守护进程

echo.
echo ============================================
echo Claude-to-IM 快速启动
echo ============================================
echo.

REM 停止现有进程
echo [1/3] 停止现有进程...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM 启动守护进程
echo [2/3] 启动守护进程...
cd /d "C:\Users\DXJJ\.claude\skills\Claude-to-IM"

REM 直接设置环境变量
set "CTI_CLAUDE_CODE_EXECUTABLE=C:\Users\DXJJ\.vscode\extensions\anthropic.claude-code-2.1.94-win32-x64\resources\native-binary\claude.exe"
set "CLAUDE_CODE_GIT_BASH_PATH=C:\Git\bin\bash.exe"

REM 启动守护进程
start /B node dist\daemon.mjs >> daemon.log 2>&1

REM 等待并验证
echo [3/3] 验证启动...
timeout /t 5 /nobreak >nul

tasklist /FI "IMAGENAME eq node.exe" | find "node.exe" >nul
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo ✓ 守护进程启动成功！
    echo ============================================
    echo.
    echo 通道: 飞书, 微信
    echo.
    echo [*] 现在您可以在飞书或微信中发送消息
    echo [*] 日志文件: daemon.log
    echo.
) else (
    echo.
    echo [!] 启动失败，请检查 daemon.log
    echo.
)

pause
