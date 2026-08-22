param(
  [string]$BaseUrl = 'http://localhost:8080',
  [switch]$IncludeBrowserSmokeTest
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$baseUrl = $BaseUrl.TrimEnd('/')
Set-Location $projectRoot

& "$PSScriptRoot\check-encoding.ps1"

$modules = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'js') -Recurse -File -Filter '*.js' |
  Sort-Object FullName

if (-not $modules) {
  throw 'js 폴더에서 검사할 JavaScript 모듈을 찾지 못했습니다.'
}

foreach ($module in $modules) {
  node --check $module.FullName
  $relativePath = $module.FullName.Substring($projectRoot.Length + 1)
  Write-Host "OK  $relativePath"
}

$urls = @('/', '/js/bootstrap.js', '/js/app.js', '/style.css')
foreach ($path in $urls) {
  $response = Invoke-WebRequest -Uri ($baseUrl + $path) -UseBasicParsing -TimeoutSec 5
  if ($response.StatusCode -ne 200) { throw "Unexpected status for ${path}: $($response.StatusCode)" }
  Write-Host "HTTP 200  $path"
}

if ($IncludeBrowserSmokeTest) {
  & "$PSScriptRoot\smoke-test.ps1" -BaseUrl $baseUrl
  if ($LASTEXITCODE -ne 0) { throw 'Browser smoke test failed.' }
}

Write-Host 'Core checks completed successfully.' -ForegroundColor Green
