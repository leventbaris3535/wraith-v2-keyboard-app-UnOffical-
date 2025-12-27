@echo off
chcp 65001 >nul
title WraithApp Builder

:: Admin check
net session >nul 2>&1 || (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ========================================
echo   WRAITH APP BUILD STARTED
echo ========================================

:: 1) Clean
echo [1/5] Cleaning previous build...
if exist dist rmdir /s /q dist
if exist chromium rmdir /s /q chromium

:: 2) npm install
echo [2/5] Installing dependencies...
call npm.cmd install
if %ERRORLEVEL% neq 0 goto error

:: 3) Download Chromium
echo [3/5] Downloading Chromium (Puppeteer)...
call npx puppeteer browsers install chrome
if %ERRORLEVEL% neq 0 goto error

:: 4) Copy Chromium to local ./chromium
echo [4/5] Preparing Chromium for packaging...

set PUPPETEER_CACHE=%USERPROFILE%\.cache\puppeteer\chrome

for /d %%D in ("%PUPPETEER_CACHE%\win64-*") do (
    set CHROME_DIR=%%D
)

if not defined CHROME_DIR (
    echo Chromium directory not found!
    goto error
)

xcopy "%CHROME_DIR%\chrome-win64" "%cd%\chromium" /E /I /H /Y
if %ERRORLEVEL% neq 0 goto error

:: 5) Build exe
echo [5/5] Building application...
call npm.cmd run dist
if %ERRORLEVEL% neq 0 goto error

echo.
echo ========================================
echo   BUILD SUCCESSFUL
echo ========================================
echo.
echo Output files:
dir /b dist\*.exe
echo.
pause
exit /b 0

:error
echo.
echo ========================================
echo   BUILD FAILED
echo ========================================
pause
exit /b 1
