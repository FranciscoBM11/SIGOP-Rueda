@echo off
chcp 65001 >nul
setlocal EnableExtensions
rem ===========================================================================
rem  SIGOP-Rueda - Inicio para la feria (plan B: laptop + túnel de Cloudflare)
rem  1. Comprueba SQL Server  2. Busca cloudflared  3. Inicia el servidor
rem  4. Verifica /api/v1/salud  5. Abre el túnel  6. Muestra la dirección pública
rem  Para cerrar todo: detener-feria.bat
rem ===========================================================================
title SIGOP-Rueda - Feria
cd /d "%~dp0"
set "PUERTO=3000"
set "LOCAL=http://localhost:%PUERTO%"
set "SERVICIO_SQL=MSSQL$SQLEXPRESS"

echo.
echo  =========================================
echo    SIGOP-Rueda - Inicio para la feria
echo  =========================================
echo.

rem ---- 1. SQL Server ---------------------------------------------------------
echo [1/6] Comprobando SQL Server (%SERVICIO_SQL%)...
powershell -NoProfile -Command "$s = Get-Service -Name $env:SERVICIO_SQL -ErrorAction SilentlyContinue; if (-not $s) { exit 2 }; if ($s.Status -ne 'Running') { exit 1 }; exit 0"
if errorlevel 2 goto :sql_no_existe
if errorlevel 1 goto :sql_detenido
echo       OK: SQL Server está corriendo.

rem ---- 2. cloudflared y Node -------------------------------------------------
echo [2/6] Buscando cloudflared...
set "CF="
where cloudflared >nul 2>&1 && set "CF=cloudflared"
if not defined CF if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" set "CF=C:\Program Files (x86)\cloudflared\cloudflared.exe"
if not defined CF goto :cf_no_existe
echo       OK: %CF%

where node >nul 2>&1 || goto :node_no_existe
if not exist "node_modules\" goto :sin_dependencias

rem ¿Ya hay algo corriendo? Evita dos servidores o dos túneles a la vez.
call :salud
if not errorlevel 1 goto :ya_corriendo
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter 'Name=''cloudflared.exe''' | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('localhost:' + $env:PUERTO) }) { exit 1 }; exit 0"
if errorlevel 1 goto :ya_corriendo

rem ---- 3. Servidor -----------------------------------------------------------
echo [3/6] Iniciando el servidor en una ventana propia...
start "SIGOP - Servidor (no cerrar)" cmd /k node "%~dp0src\server.js"

rem ---- 4. Verificar /api/v1/salud --------------------------------------------
echo [4/6] Esperando a que responda %LOCAL%/api/v1/salud ...
set /a INTENTOS=0
:esperar_servidor
set /a INTENTOS+=1
timeout /t 1 /nobreak >nul
call :salud
if not errorlevel 1 goto :servidor_ok
if %INTENTOS% lss 20 goto :esperar_servidor
echo.
echo  [ERROR] El servidor no respondió en 20 segundos.
echo          Revisa la ventana "SIGOP - Servidor" para ver el error
echo          (por ejemplo, falta el archivo .env o el puerto %PUERTO% está ocupado).
goto :fin_error
:servidor_ok
echo       OK: el servidor responde (salud = ok).
start "" "%LOCAL%"

rem ---- 5. Túnel --------------------------------------------------------------
echo [5/6] Abriendo el túnel de Cloudflare (salida en tunel.log)...
if exist "tunel.log" del /q "tunel.log"
start "SIGOP - Tunel (no cerrar)" /min cmd /k ""%CF%" tunnel --url %LOCAL% > tunel.log 2>&1"

rem ---- 6. Dirección pública --------------------------------------------------
echo [6/6] Esperando la dirección pública (hasta 45 segundos)...
set /a INTENTOS=0
:esperar_tunel
set /a INTENTOS+=1
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "$m = Select-String -Path 'tunel.log' -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches -ErrorAction SilentlyContinue | ForEach-Object { $_.Matches } | Where-Object { $_.Value -notmatch '//api\.' } | Select-Object -First 1; if (-not $m) { exit 1 }; $u = $m.Value; Set-Clipboard -Value $u; $linea = '#' * ($u.Length + 12); Write-Host ''; Write-Host $linea -ForegroundColor Green; Write-Host '#' -ForegroundColor Green; Write-Host ('#     ' + $u) -ForegroundColor Yellow; Write-Host '#' -ForegroundColor Green; Write-Host $linea -ForegroundColor Green; Write-Host ''; Write-Host ('  Dirección pública: ' + $u) -ForegroundColor White -BackgroundColor DarkGreen; Write-Host ''; Write-Host '  Ya está copiada al portapapeles (Ctrl+V).' ; Write-Host '  Esta es la dirección para el código QR.' -ForegroundColor Cyan; Write-Host '  OJO: cambia cada vez que se enciende el túnel; genera el QR de nuevo.' -ForegroundColor Cyan; exit 0"
if not errorlevel 1 goto :tunel_ok
if %INTENTOS% lss 45 goto :esperar_tunel
echo.
echo  [ERROR] No apareció la dirección del túnel en tunel.log.
echo          Revisa tunel.log y la conexión a Internet. El servidor local sigue
echo          funcionando en %LOCAL% (por Wi-Fi).
goto :fin_error

:tunel_ok
echo.
echo  Local: %LOCAL%
echo  No cierres las ventanas "SIGOP - Servidor" ni "SIGOP - Tunel".
echo  Para apagar todo: detener-feria.bat
echo.
pause
exit /b 0

rem ===========================================================================
:salud
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri ($env:LOCAL + '/api/v1/salud'); if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
exit /b %errorlevel%

:sql_no_existe
echo.
echo  [ERROR] No se encontró el servicio %SERVICIO_SQL% en esta computadora.
echo          Instala SQL Server Express o revisa el nombre de la instancia.
goto :fin_error

:sql_detenido
echo.
echo  [ERROR] SQL Server (%SERVICIO_SQL%) está detenido.
echo          Inícialo y vuelve a ejecutar este archivo:
echo            Win+R, escribe services.msc, busca "SQL Server (SQLEXPRESS)" y pulsa Iniciar
echo            (o desde "SQL Server Configuration Manager"; puede pedir permisos).
goto :fin_error

:cf_no_existe
echo.
echo  [ERROR] No se encontró cloudflared.
echo          Instálalo con este comando y vuelve a ejecutar este archivo:
echo            winget install --id Cloudflare.cloudflared
goto :fin_error

:node_no_existe
echo.
echo  [ERROR] No se encontró Node.js (comando "node"). Instala Node.js LTS.
goto :fin_error

:sin_dependencias
echo.
echo  [ERROR] Falta la carpeta node_modules. Ejecuta primero:  npm install
goto :fin_error

:ya_corriendo
echo.
echo  [AVISO] Ya hay un servidor en el puerto %PUERTO% o un túnel abierto.
echo          Ejecuta detener-feria.bat y luego vuelve a ejecutar este archivo.
goto :fin_error

:fin_error
echo.
pause
exit /b 1
