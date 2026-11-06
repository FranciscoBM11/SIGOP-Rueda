@echo off
chcp 65001 >nul
setlocal EnableExtensions
rem ===========================================================================
rem  SIGOP-Rueda - Detener la feria: cierra el servidor Node de este proyecto
rem  (iniciado por iniciar-feria.bat) y el túnel de cloudflared.
rem ===========================================================================
title SIGOP-Rueda - Detener
cd /d "%~dp0"
set "PUERTO=3000"
set "RAIZ=%CD%"

echo.
echo  Deteniendo SIGOP-Rueda...
echo.

rem Servidor: el node que ejecuta src\server.js de ESTA carpeta, o el node que
rem escucha en el puerto %PUERTO% ejecutando src/server.js (p. ej. iniciado a mano).
rem Túnel: solo el cloudflared que apunta a localhost:%PUERTO%.
powershell -NoProfile -Command "$srv = ($env:RAIZ + '\src\server.js').ToLower(); $url = 'localhost:' + $env:PUERTO; $enPuerto = @(Get-NetTCPConnection -LocalPort ([int]$env:PUERTO) -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess }); $p = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ( ($_.Name -eq 'node.exe' -and ($_.CommandLine.ToLower().Contains($srv) -or ($enPuerto -contains $_.ProcessId -and $_.CommandLine -match 'src[\\/]server\.js'))) -or ($_.Name -eq 'cloudflared.exe' -and $_.CommandLine.Contains($url)) ) }); $n = @($p | Where-Object Name -eq 'node.exe').Count; $c = @($p | Where-Object Name -eq 'cloudflared.exe').Count; foreach ($x in $p) { Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue }; Write-Host ('  Servidor Node cerrado: ' + $n + ' proceso(s).'); Write-Host ('  Túnel cloudflared cerrado: ' + $c + ' proceso(s).')"

rem Cierra las ventanas que abrió iniciar-feria.bat (si siguen abiertas).
taskkill /FI "WINDOWTITLE eq SIGOP - Servidor*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq SIGOP - Tunel*" /T /F >nul 2>&1
timeout /t 1 /nobreak >nul

rem Confirmación: nada debe seguir corriendo.
powershell -NoProfile -Command "$srv = ($env:RAIZ + '\src\server.js').ToLower(); $url = 'localhost:' + $env:PUERTO; $quedan = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ( ($_.Name -eq 'node.exe' -and $_.CommandLine.ToLower().Contains($srv)) -or ($_.Name -eq 'cloudflared.exe' -and $_.CommandLine.Contains($url)) ) }).Count; $responde = $false; try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri ('http://' + $url + '/api/v1/salud'); $responde = $true } catch {}; if ($quedan -eq 0 -and -not $responde) { exit 0 }; if ($responde) { Write-Host ('  [AVISO] Algo sigue respondiendo en el puerto ' + $env:PUERTO + ' (otro servidor, p. ej. npm run dev). Ciérralo a mano.') -ForegroundColor Yellow }; if ($quedan -gt 0) { Write-Host ('  [AVISO] Quedan ' + $quedan + ' proceso(s) abiertos.') -ForegroundColor Yellow }; exit 1"
if errorlevel 1 goto :aviso

echo.
echo  Listo: el servidor y el túnel están cerrados.
echo  La dirección trycloudflare.com anterior ya no funciona.
echo.
pause
exit /b 0

:aviso
echo.
pause
exit /b 1
