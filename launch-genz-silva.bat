@echo off
setlocal
set PATH=%PATH%;C:\Users\Silva\.cargo\bin;%AppData%\npm;%ProgramFiles%\nodejs
cd /d "C:\Users\Silva\WorkSpace\GENZLOCAL\genz-silva-os"

echo ==========================================
echo    genz...Silva OS - Launch Diagnostics
echo ==========================================

:: Check for Local AI Server
echo [1/3] Checking for Local AI Server...
netstat -ano | findstr :8080 > nul
set LLAMA_RUNNING=%errorlevel%
netstat -ano | findstr :1337 > nul
set JAN_RUNNING=%errorlevel%

:: Also check if llama-server.exe exists in the local bin folder
if exist "src-tauri\bin\llama-server.exe" (
    echo [OK] Built-in AI binary found in src-tauri\bin.
    set LLAMA_BIN_FOUND=1
) else (
    set LLAMA_BIN_FOUND=0
)

if %LLAMA_RUNNING% neq 0 if %JAN_RUNNING% neq 0 if %LLAMA_BIN_FOUND% equ 0 (
    echo [!] WARNING: No local AI server detected and no built-in binary found.
    echo [!] To fix this:
    echo     1. Download llama-server.exe and place it in 'src-tauri\bin\'
    echo     2. Or start an external server (llama-server or Jan.ai)
    echo.
) else (
    echo [OK] Local AI infrastructure ready.
)

:: Check for Dev Server (Vite)
echo [2/3] Checking for Frontend Dev Server (localhost:1420)...
netstat -ano | findstr :1420 > nul
if %errorlevel% neq 0 (
    echo [!] Vite Dev Server is NOT running. 
    echo [!] Starting dev mode with compilation...
    npm run tauri dev
) else (
    echo [OK] Dev Server is running.
    echo [3/3] Launching App...
    :: Use the correct underscore name for the binary
    if exist "src-tauri\target\debug\genz_silva_os.exe" (
        start "" "src-tauri\target\debug\genz_silva_os.exe"
    ) else (
        echo [!] Binary not found. Running 'npm run tauri dev' to build and run...
        npm run tauri dev
    )
)

endlocal
