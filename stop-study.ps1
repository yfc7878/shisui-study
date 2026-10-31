# 停止当前监听 8787 端口的拾穗 Study 服务，并结束对应的守护进程。
# 计划任务只在登录时触发，停止后不会在本次登录期间自动重启；
# 下次登录 Windows 或双击「启动拾穗」时恢复。

$ErrorActionPreference = 'Continue'
$port = 8787
$connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $connections) {
  Write-Host "端口 $port 当前没有监听进程。"
} else {
  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $pids) {
    try {
      $process = Get-Process -Id $processId -ErrorAction Stop
      Write-Host ("停止进程 {0}（{1}）" -f $process.ProcessName, $processId)
      Stop-Process -Id $processId -Force
    } catch {
      Write-Host "无法停止进程 $processId：$($_.Exception.Message)"
    }
  }
}

# 结束守护 supervisor（它会自动重启 node，所以要先结束守护脚本）。
$supervisors = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*start-study.ps1*' }
foreach ($supervisor in $supervisors) {
  try {
    Write-Host ("停止守护进程 PID {0}" -f $supervisor.ProcessId)
    Stop-Process -Id $supervisor.ProcessId -Force
  } catch { }
}

Write-Host '拾穗 Study 已停止。再次启动：双击「启动拾穗.bat」，或重新登录 Windows。'
