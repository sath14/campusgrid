@echo off
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"

echo === Starting CampusGrid SYSTEM (server + agent) ===
if not exist node_modules\express call npm.cmd install
if not exist data mkdir data
if not exist data\faces mkdir data\faces

echo Opening agent in a new window...
start "CampusGrid Agent" cmd /k "cd /d "%~dp0edge\agent" && python edge_agent.py"

echo Starting combined server in THIS window...
echo   App:  http://127.0.0.1:3000
echo   Edge: http://127.0.0.1:3000/edge
echo.
call npm.cmd start
pause
