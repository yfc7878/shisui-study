# 拾穗 Study 守护启动脚本
# 由「登录时自动启动」计划任务调用，也可手动运行。
# 作用：固定使用 8787 端口启动生产服务；进程退出后自动重启；避免重复启动。

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Port = 8787
$LogDir = Join-Path $ProjectRoot 'logs'
$LogFile = Join-Path $LogDir 'server.log'
$StdoutLog = Join-Path $LogDir 'stdout.log'
$StderrLog = Join-Path $LogDir 'stderr.log'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Test-AppHealth {
  try {
    $response = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/health" -f $Port) -TimeoutSec 3
    return ($response.name -eq '拾穗 Study')
  } catch {
    return $false
  }
}

function Test-PortOpen {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect('127.0.0.1', $Port)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Get-NodePath {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $candidates = @(
    'C:\Program Files\nodejs\node.exe',
    'C:\Program Files (x86)\nodejs\node.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

function Get-NpmPath {
  $command = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $node = Get-NodePath
  if ($node) {
    $candidate = Join-Path (Split-Path -Parent $node) 'npm.cmd'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

# 同一时间只允许一个守护进程；避免计划任务重复触发导致端口冲突。
$mutex = New-Object System.Threading.Mutex($false, 'Local\ShisuiStudyServerSupervisor')
if (-not $mutex.WaitOne(0)) {
  Write-Log '已有守护进程在运行，本次启动退出。'
  exit 0
}

try {
  Set-Location -LiteralPath $ProjectRoot

  $initialPortOpen = Test-PortOpen
  $initialHealthy = Test-AppHealth
  if ($initialPortOpen -and -not $initialHealthy) {
    Write-Log ("端口 {0} 被其他程序占用，未启动。请检查端口占用。" -f $Port)
    exit 2
  }

  $node = Get-NodePath
  if (-not $node) {
    Write-Log '找不到 node.exe，无法启动。请安装 Node.js 24+ 或把 Node 加入 PATH。'
    exit 1
  }

  # 前端构建产物不存在时自动构建一次（正常使用无需每次构建）。
  if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'client\dist\index.html'))) {
    $npm = Get-NpmPath
    if ($npm) {
      Write-Log '未找到 client/dist，正在执行一次前端构建…'
      try {
        & $npm run build *>> $LogFile
        Write-Log '前端构建完成。'
      } catch {
        Write-Log ("前端构建失败：{0}" -f $_.Exception.Message)
      }
    }
  }

  $env:NODE_ENV = 'production'
  $env:PORT = [string]$Port
  $env:HOST = '0.0.0.0'

  if ($initialHealthy) {
    Write-Log ("服务已在 127.0.0.1:{0} 运行，守护进程继续监控。" -f $Port)
  } else {
    Write-Log ("准备启动拾穗 Study，端口 {0}，Node：{1}" -f $Port, $node)
  }

  $process = $null
  while ($true) {
    if ($process -and -not $process.HasExited) {
      Start-Sleep -Seconds 5
      continue
    }

    if ($process -and $process.HasExited) {
      Write-Log ("服务进程退出，退出码 {0}，3 秒后重启。" -f $process.ExitCode)
      Start-Sleep -Seconds 3
      $process = $null
    }

    $healthy = Test-AppHealth
    if ($healthy) {
      Start-Sleep -Seconds 5
      continue
    }

    $portOpen = Test-PortOpen
    if ($portOpen) {
      # 端口仍被旧进程占用，等待其释放，避免刷屏式重启。
      Start-Sleep -Seconds 4
      continue
    }

    Write-Log ("启动服务：{0} server/src/index.js" -f $node)
    try {
      $process = Start-Process -FilePath $node -ArgumentList 'server/src/index.js' `
        -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog
      Start-Sleep -Seconds 3
      if (Test-AppHealth) {
        Write-Log ("服务已就绪：http://localhost:{0}" -f $Port)
      } else {
        Write-Log '服务启动中，继续等待…'
      }
    } catch {
      Write-Log ("启动失败：{0}，5 秒后重试。" -f $_.Exception.Message)
      $process = $null
      Start-Sleep -Seconds 5
    }
  }
} finally {
  try { $mutex.ReleaseMutex() } catch { }
  $mutex.Dispose()
}
