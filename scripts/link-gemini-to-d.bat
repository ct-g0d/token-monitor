@echo off
setlocal enabledelayedexpansion

:: 0. Auto-elevate to Administrator if not already elevated
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Requesting Administrator privileges...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

title Antigravity (.gemini) C: to D: Junction Migrator
echo ======================================================================
echo           Antigravity (.gemini) C: to D: Junction Migrator
echo ======================================================================
echo.

:: 1. Force-terminate all applications and background watchers touching .gemini
echo [1/4] Stopping all apps and watchers locking C:\Users\user2\.gemini...
echo      - Antigravity IDE and language_server daemon
echo      - Token Monitor and tokscale background watchers
echo      - T3 Code and t3-resource-monitor
powershell -NoProfile -Command "Stop-Process -Name 'Antigravity', 'language_server', 'Token Monitor', 'tokscale', 'T3 Code (Nightly)', 't3-resource-monitor' -Force -ErrorAction SilentlyContinue"
timeout /t 3 /nobreak >nul
echo      All candidate processes stopped.

:: 2. Verify destination on D:
if not exist "D:\AppData\user2\.gemini" (
    echo [ERROR] Destination "D:\AppData\user2\.gemini" does not exist!
    pause
    exit /b 1
)

:: 3. Final incremental sync from C: to D:
echo [2/4] Running final sync from C:\Users\user2\.gemini to D:\AppData\user2\.gemini...
robocopy "C:\Users\user2\.gemini" "D:\AppData\user2\.gemini" /E /XO /R:2 /W:1 /XF *.db-shm *.db-wal /NFL /NDL /NJH /NJS
echo      Sync completed.

:: 4. Rename original folder with retry loop (allowing Windows handle release)
echo [3/4] Renaming original C:\Users\user2\.gemini to C:\Users\user2\.gemini.backup...
if exist "C:\Users\user2\.gemini.backup" (
    rmdir /S /Q "C:\Users\user2\.gemini.backup" >nul 2>&1
)

powershell -NoProfile -Command "$s='C:\Users\user2\.gemini'; $b='C:\Users\user2\.gemini.backup'; for ($i=1; $i -le 6; $i++) { try { Rename-Item -LiteralPath $s -NewName '.gemini.backup' -ErrorAction Stop; exit 0 } catch { if ($i -eq 6) { Write-Host 'Final Rename Error:' $_.Exception.Message; exit 1 }; Start-Sleep -Milliseconds 1000 } }"
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to rename C:\Users\user2\.gemini after 6 retries.
    echo Checking remaining file locks...
    powershell -NoProfile -Command "Get-Process | Where-Object { $_.ProcessName -match 'Antigravity|language_server|Token Monitor|tokscale|T3 Code' } | Select-Object Id, ProcessName"
    pause
    exit /b 1
)
echo      Original folder renamed to .gemini.backup successfully.

:: 5. Create the NTFS Junction
echo [4/4] Creating NTFS Directory Junction:
echo      C:\Users\user2\.gemini -^> D:\AppData\user2\.gemini
mklink /J "C:\Users\user2\.gemini" "D:\AppData\user2\.gemini"
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to create junction!
    echo Rolling back: restoring C:\Users\user2\.gemini...
    powershell -NoProfile -Command "Rename-Item -LiteralPath 'C:\Users\user2\.gemini.backup' -NewName '.gemini'"
    pause
    exit /b 1
)

echo.
echo ======================================================================
echo [SUCCESS] NTFS Junction created successfully!
echo.
echo C:\Users\user2\.gemini now points directly to D:\AppData\user2\.gemini.
echo All future Antigravity sessions and files will physically write to D:.
echo.
echo You can now reopen Antigravity and Token Monitor.
echo.
echo [OPTIONAL TO RECLAIM 1.83 GB ON C: DRIVE]:
echo Once you confirm Antigravity works normally, delete:
echo   C:\Users\user2\.gemini.backup
echo ======================================================================
echo.
pause
