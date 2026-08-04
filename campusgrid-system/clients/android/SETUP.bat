@echo off
cd /d "%~dp0"
echo CampusGrid Android shell — build requires JDK 25 + Android SDK
echo.
echo Installing Android shell dependencies...
call npm install
if errorlevel 1 exit /b 1
echo.
echo Adding Android platform (first time only)...
if not exist android (
  call npx cap add android
)
call npx cap sync android
echo.
echo Cleartext HTTP is preconfigured in the committed android/ project.
echo Prefer BUILD-APK.sh on Linux/macOS with JAVA_HOME pointing at JDK 25.
echo On Windows with Android Studio: open the android/ folder, set Gradle JDK to 25,
echo then Build ^> Build Bundle(s) / APK(s) ^> Build APK(s)
echo See PACKAGING.md for full steps.
pause
