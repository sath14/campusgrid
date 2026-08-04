@echo off
cd /d "%~dp0"
echo Building Windows installer (needs internet first time)...
call npm install
if errorlevel 1 exit /b 1
call npm run dist
echo.
echo Done. Look in: clients\desktop\dist\
pause
