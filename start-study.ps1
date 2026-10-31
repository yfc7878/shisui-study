# 立即启动拾穗 Study（隐藏窗口）。若服务已在运行，只会继续监控，不会重复启动。
# 需要停止服务时运行 stop-study.ps1。

$Script = Join-Path $PSScriptRoot 'scripts\start-study.ps1'
if (-not (Test-Path -LiteralPath $Script)) {
  Write-Host '找不到 scripts\start-study.ps1，请确认项目目录完整。'
  exit 1
}
Start-Process -FilePath 'powershell.exe' `
  -ArgumentList ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $Script) `
  -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
Write-Host '拾穗 Study 已在后台启动，稍等几秒后访问：http://localhost:8787'
