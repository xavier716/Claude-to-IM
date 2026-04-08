@echo off
echo Stopping all Claude-to-IM daemons...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo All daemons stopped.
pause
