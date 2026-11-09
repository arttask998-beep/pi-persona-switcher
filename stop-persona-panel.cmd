@echo off
cd /d "%~dp0"
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 30142 -State Listen -ErrorAction SilentlyContinue; if (-not $c) { Write-Host '面板没有在运行（30142 未监听）'; exit 0 }; $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force; Write-Host ('已停止 Pi Persona Panel (PID ' + $p.Id + ')') } else { Write-Host ('30142 被其他进程占用: ' + $p.ProcessName + ' PID ' + $c.OwningProcess + '，未自动结束') }"
pause
