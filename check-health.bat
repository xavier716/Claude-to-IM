@echo off
REM Claude-to-IM 健康检查脚本

echo.
echo ============================================
echo Claude-to-IM 健康检查
echo ============================================
echo.

set "STATUS_FILE=C:\Users\DXJJ\.claude-to-im\runtime\status.json"
set "WEIXIN_ACCOUNTS=C:\Users\DXJJ\.claude-to-im\data\weixin-accounts.json"
set "AUDIT_LOG=C:\Users\DXJJ\.claude-to-im\data\audit.json"

REM 检查状态文件
echo [检查 1/4] 守护进程状态
if exist "%STATUS_FILE%" (
    powershell -Command "$status = Get-Content '%STATUS_FILE%' | ConvertFrom-Json; Write-Host '  状态:' $status.running; Write-Host '  PID:' $status.pid; Write-Host '  通道:' ($status.channels -join ', ') "
) else (
    echo   ✗ 状态文件不存在
)

REM 检查进程
echo.
echo [检查 2/4] Node.js 进程
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find "node.exe" >nul
if %ERRORLEVEL% EQU 0 (
    echo   ✓ Node.js 进程运行中
) else (
    echo   ✗ Node.js 进程未运行
)

REM 检查微信账户
echo.
echo [检查 3/4] 微信账户配置
if exist "%WEIXIN_ACCOUNTS%" (
    powershell -Command "$accounts = Get-Content '%WEIXIN_ACCOUNTS%' | ConvertFrom-Json; Write-Host '  账户数:' $accounts.Count; $accounts | ForEach-Object { Write-Host '  -' $_.accountId '(已启用:' $_.enabled ')' }"
) else (
    echo   ✗ 微信账户配置不存在
)

REM 检查消息记录
echo.
echo [检查 4/4] 消息处理记录
if exist "%AUDIT_LOG%" (
    powershell -Command "$audit = Get-Content '%AUDIT_LOG%' | ConvertFrom-Json; Write-Host '  总消息数:' $audit.Count; $feishu = ($audit | Where-Object { $_.channelType -eq 'feishu' }).Count; $weixin = ($audit | Where-Object { $_.channelType -eq 'weixin' }).Count; Write-Host '  飞书消息:' $feishu; Write-Host '  微信消息:' $weixin"
) else (
    echo   ✗ 消息记录不存在
)

echo.
echo ============================================
echo 健康检查完成
echo ============================================
echo.

pause
