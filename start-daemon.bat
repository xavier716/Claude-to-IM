@echo off
REM Kill existing daemons
taskkill /F /IM node.exe >nul 2>&1

REM Wait for processes to terminate
timeout /t 2 /nobreak >nul

REM Start daemon with Claude Code path and Git Bash path
cd /d "%~dp0"
echo Starting Claude-to-IM daemon...
echo Using Claude Code: C:\Users\DXJJ\.vscode\extensions\anthropic.claude-code-2.1.92-win32-x64\resources\native-binary\claude.exe
echo Using Git Bash: C:\Git\bin\bash.exe

REM Set environment variables for current session and pass to node
set "CTI_CLAUDE_CODE_EXECUTABLE=C:\Users\DXJJ\.vscode\extensions\anthropic.claude-code-2.1.92-win32-x64\resources\native-binary\claude.exe"
set "CLAUDE_CODE_GIT_BASH_PATH=C:\Git\bin\bash.exe"

REM Start node with environment variables (use cmd /c to ensure vars are inherited)
cmd /c "set CTI_CLAUDE_CODE_EXECUTABLE=%CTI_CLAUDE_CODE_EXECUTABLE% && set CLAUDE_CODE_GIT_BASH_PATH=%CLAUDE_CODE_GIT_BASH_PATH% && node dist\daemon.mjs 2>&1" >> daemon.log

timeout /t 3 /nobreak >nul
echo.
echo Daemon started. Check status:
type C:\Users\DXJJ\.claude-to-im\runtime\status.json 2>nul || echo Status file not ready yet
echo.
pause
