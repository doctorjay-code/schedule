const fs = require('fs');

// Write batch file in CP949 (ANSI Korean encoding) - Windows CMD requires this
const batContent = `@echo off
set PORT=8080
set SERVER_DIR=C:\\Users\\hyo02\\Downloads\\GitHub\\Schedule

set FOUND_PID=
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do set FOUND_PID=%%a

if defined FOUND_PID (
    echo [OFF] Stopping Schedule Server...
    taskkill /F /PID %FOUND_PID% > nul 2>&1
    echo Server Stopped!
    timeout /t 2 > nul
) else (
    echo [ON] Starting Schedule Server...
    cd /d "%SERVER_DIR%"
    start /min "ScheduleServer" cmd /c "npx http-server . -p 8080 -c-1"
    timeout /t 2 > nul
    start http://localhost:8080
    echo Server Running at http://localhost:8080
    timeout /t 3 > nul
)
`;

// Write as CP949 (Windows Korean ANSI)
const iconv = null;
// Use Buffer with cp949-safe ASCII-only content
const batPath = 'C:\\Users\\hyo02\\Desktop\\ScheduleServerToggle.bat';
fs.writeFileSync(batPath, batContent, 'ascii');
console.log('Created:', batPath);
