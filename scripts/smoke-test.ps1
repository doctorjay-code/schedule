param(
  [string]$BaseUrl = 'http://localhost:8080',
  [int]$VirtualTimeBudgetMs = 15000
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $PSScriptRoot 'smoke-test.log'
$baseUrl = $BaseUrl.TrimEnd('/')
$probeUrl = "$baseUrl/scripts/smoke-test-probe.html?run=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"

$edgeCandidates = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
)
$edgePath = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $edgePath) {
  throw 'Microsoft Edge 실행 파일을 찾지 못했습니다. Edge 설치 경로를 확인해주세요.'
}

function Write-SmokeLog {
  param([string]$Status, [object]$Payload)

  $entry = [PSCustomObject]@{
    timestamp = (Get-Date).ToString('o')
    status = $Status
    result = $Payload
  } | ConvertTo-Json -Depth 8 -Compress
  Add-Content -LiteralPath $logPath -Value $entry -Encoding utf8
}

try {
  $response = Invoke-WebRequest -Uri "$baseUrl/" -UseBasicParsing -TimeoutSec 5
  if ($response.StatusCode -ne 200) {
    throw "로컬 서버 응답이 정상적이지 않습니다: HTTP $($response.StatusCode)"
  }
} catch {
  throw "로컬 서버($baseUrl)에 연결할 수 없습니다. 먼저 서버를 실행한 뒤 다시 시도해주세요. 상세: $($_.Exception.Message)"
}

$tempProfile = Join-Path ([System.IO.Path]::GetTempPath()) ("schedule-smoke-edge-" + [guid]::NewGuid().ToString('N'))
$stdoutPath = Join-Path ([System.IO.Path]::GetTempPath()) ("schedule-smoke-edge-" + [guid]::NewGuid().ToString('N') + '.stdout.html')
$stderrPath = Join-Path ([System.IO.Path]::GetTempPath()) ("schedule-smoke-edge-" + [guid]::NewGuid().ToString('N') + '.stderr.log')
$dump = ''
try {
  $edgeArguments = @(
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    "--user-data-dir=$tempProfile",
    "--virtual-time-budget=$VirtualTimeBudgetMs",
    '--dump-dom',
    $probeUrl
  )
  $edgeProcess = Start-Process -FilePath $edgePath -ArgumentList $edgeArguments -PassThru -Wait -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  $dump = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { '' }
  if ($edgeProcess.ExitCode -ne 0) {
    $edgeErrors = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
    throw "헤드리스 Edge가 비정상 종료되었습니다. $edgeErrors"
  }

  $match = [regex]::Match($dump, '<pre id="smoke-test-result">(?<json>.*?)</pre>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $match.Success) {
    $detail = '브라우저 결과 JSON을 찾지 못했습니다. smoke-test-probe.html 로드 또는 실행이 완료되지 않았습니다.'
    Write-SmokeLog -Status 'FAIL' -Payload @{ passed = $false; errors = @($detail) }
    throw $detail
  }

  $json = [System.Net.WebUtility]::HtmlDecode($match.Groups['json'].Value)
  $result = $json | ConvertFrom-Json
  foreach ($property in $result.steps.psobject.Properties) {
    $label = if ($property.Value.passed) { 'PASS' } else { 'FAIL' }
    Write-Host "$label  $($property.Name)"
  }

  if (-not $result.passed) {
    $errors = @($result.errors) -join ' | '
    Write-SmokeLog -Status 'FAIL' -Payload $result
    throw "브라우저 스모크 테스트 실패: $errors"
  }

  Write-SmokeLog -Status 'PASS' -Payload $result
  Write-Host 'Browser smoke test completed successfully.' -ForegroundColor Green
} catch {
  if (-not $dump) {
    Write-SmokeLog -Status 'FAIL' -Payload @{ passed = $false; errors = @($_.Exception.Message) }
  }
  Write-Error $_.Exception.Message
  exit 1
} finally {
  if (Test-Path -LiteralPath $tempProfile) {
    Remove-Item -LiteralPath $tempProfile -Recurse -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $stdoutPath) {
    Remove-Item -LiteralPath $stdoutPath -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $stderrPath) {
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
  }
}
