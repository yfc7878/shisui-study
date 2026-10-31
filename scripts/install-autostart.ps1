# 安装「登录 Windows 时自动启动拾穗 Study」的计划任务。
# 不需要管理员权限；任务在用户登录后启动，固定使用 8787 端口。
#
# 注意：为了不闪烁 PowerShell 窗口，计划任务调用 wscript.exe 运行隐藏的 VBS 启动器，
# 由启动器在后台启动守护脚本。没有每 10 分钟重复触发的任务。

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Launcher = Join-Path $PSScriptRoot 'launch-hidden.vbs'
$StartScript = Join-Path $PSScriptRoot 'start-study.ps1'
$TaskName = 'Shisui Study Server'
$OldWatchdogName = 'Shisui Study Watchdog'
$LogDir = Join-Path $ProjectRoot 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$InstallLog = Join-Path $LogDir 'install-autostart.log'

function Write-InstallLog([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $InstallLog -Value $line -Encoding UTF8
  Write-Host $Message
}

if (-not (Test-Path -LiteralPath $StartScript)) {
  throw "找不到启动脚本：$StartScript"
}
if (-not (Test-Path -LiteralPath $Launcher)) {
  throw "找不到隐藏启动器：$Launcher"
}

# 清理上一版可能留下的每 10 分钟 PowerShell 任务（它会弹窗）。
try {
  Unregister-ScheduledTask -TaskName $OldWatchdogName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
  Write-InstallLog "已清理旧的守护任务：$OldWatchdogName"
} catch { }

# 计划任务本身不运行 powershell，而是运行无窗口的 wscript。
$action = New-ScheduledTaskAction `
  -Execute 'wscript.exe' `
  -Argument ('//B //Nologo "{0}"' -f $Launcher) `
  -WorkingDirectory $ProjectRoot

# 不设置 RestartCount：服务进程由 start-study.ps1 的守护循环自动重启；
# 计划任务只在登录时启动一次，避免停止服务后被任务计划程序重新拉起。
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

$taskInstalled = $false
try {
  $logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $logonTrigger `
    -Settings $settings -Description '拾穗 Study 学习工作台（端口 8787）' `
    -RunLevel Limited -Force | Out-Null
  Write-InstallLog "已创建登录自启任务：$TaskName（无窗口）"
  $taskInstalled = $true
} catch {
  Write-InstallLog ("计划任务创建失败：{0}" -f $_.Exception.Message)
}

# 若计划任务不可用，退回启动文件夹；仍然通过无窗口 VBS 启动。
if (-not $taskInstalled) {
  $startup = [Environment]::GetFolderPath('Startup')
  $shortcutPath = Join-Path $startup 'Shisui Study.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = 'wscript.exe'
  $shortcut.Arguments = ('//B //Nologo "{0}"' -f $Launcher)
  $shortcut.WorkingDirectory = $ProjectRoot
  $shortcut.WindowStyle = 7
  $shortcut.Description = '拾穗 Study 学习工作台（端口 8787）'
  $shortcut.Save()
  Write-InstallLog "已退回到启动文件夹：$shortcutPath"
}

# 立即启动一次。已运行则 task 会忽略；未运行则通过计划任务在后台启动。
try {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($task -and $task.State -ne 'Running') {
    Start-ScheduledTask -TaskName $TaskName
    Write-InstallLog '已通过计划任务在后台启动服务。'
  } else {
    Write-InstallLog '服务或守护进程已在运行，无需重复启动。'
  }
} catch {
  # 计划任务不可用时直接调用 VBS 启动器。
  Start-Process -FilePath 'wscript.exe' -ArgumentList ('//B //Nologo "{0}"' -f $Launcher) -WindowStyle Hidden
  Write-InstallLog '已通过隐藏启动器启动服务。'
}

Write-InstallLog '开机自启安装完成。当前用户登录 Windows 后将自动运行在 8787 端口。'
Write-InstallLog ('日志目录：{0}' -f $LogDir)
