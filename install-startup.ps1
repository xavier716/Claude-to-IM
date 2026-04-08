$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Claude-to-IM.lnk")
$Shortcut.TargetPath = "C:\Users\DXJJ\.claude\skills\Claude-to-IM\start.bat"
$Shortcut.WorkingDirectory = "C:\Users\DXJJ\.claude\skills\Claude-to-IM"
$Shortcut.Description = "Claude-to-IM Daemon"
$Shortcut.Save()

Write-Host "============================================"
Write-Host "开机自动启动已安装！"
Write-Host "============================================"
Write-Host ""
Write-Host "快捷方式已创建到启动文件夹"
Write-Host "位置: $env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Claude-to-IM.lnk"
Write-Host ""
Write-Host "每次登录时将自动启动守护进程"
Write-Host ""
Write-Host "如需卸载，删除启动文件夹中的快捷方式即可"
Write-Host "============================================"
