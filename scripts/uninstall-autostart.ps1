# 移除「拾穗 Study」的开机自启任务和启动文件夹快捷方式。
# 默认只移除自启项，不结束正在运行的服务；如需停止服务请再执行 stop-study.ps1。

$ErrorActionPreference = 'Continue'
$TaskNames = @('Shisui Study Server', 'Shisui Study Watchdog')
foreach ($name in $TaskNames) {
  try {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction Stop
    Write-Host "已移除计划任务：$name"
  } catch {
    Write-Host "计划任务不存在或无法移除：$name"
  }
}

$startup = [Environment]::GetFolderPath('Startup')
$launcher = Join-Path $startup 'Shisui Study.lnk'
if (Test-Path -LiteralPath $launcher) {
  Remove-Item -LiteralPath $launcher -Force
  Write-Host "已移除启动文件夹快捷方式：$launcher"
}

Write-Host '开机自启已移除。'
