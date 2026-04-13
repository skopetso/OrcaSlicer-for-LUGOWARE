@echo off
title LUGOWARE PrintFarm Server
echo.
echo  ========================================
echo   LUGOWARE PrintFarm Server
echo  ========================================
echo.

:: Check if node exists in portable folder
if exist "%~dp0node\node.exe" (
    set "NODE=%~dp0node\node.exe"
    set "NPM=%~dp0node\npm.cmd"
    set "PATH=%~dp0node;%PATH%"
) else (
    where node >nul 2>&1
    if errorlevel 1 (
        echo  [ERROR] Node.js not found!
        echo  Please place node.exe in the 'node' folder.
        echo.
        pause
        exit /b 1
    )
    set "NODE=node"
)

:: Install dependencies if needed
if not exist "%~dp0server\node_modules" (
    echo  Installing dependencies...
    cd /d "%~dp0server"
    call "%NPM%" install --production 2>nul || call npm install --production
    cd /d "%~dp0"
    echo  Done!
    echo.
)

:: Check if .env exists, if not create default
if not exist "%~dp0server\.env" (
    echo JWT_SECRET=printfarm_%COMPUTERNAME%_secret> "%~dp0server\.env"
    echo PORT=46259>> "%~dp0server\.env"
)

:: Read port from .env
set "PORT=46259"
for /f "tokens=1,* delims==" %%a in (%~dp0server\.env) do (
    if "%%a"=="PORT" set "PORT=%%b"
)

echo  Starting server on port %PORT%...
echo  Open http://localhost:%PORT% in your browser
echo.
echo  Press Ctrl+C to stop the server
echo  ========================================
echo.

cd /d "%~dp0server"
"%NODE%" src/index.js

pause
