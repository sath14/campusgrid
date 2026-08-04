@echo off
cd /d "%~dp0"
echo Installing desktop app dependencies...
call npm install
if errorlevel 1 exit /b 1
echo.
echo Starting CampusGrid desktop (dev)...
call npm start
