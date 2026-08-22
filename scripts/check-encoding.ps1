param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
$extensions = @('.html', '.js', '.css', '.json', '.md', '.ps1')
$files = Get-ChildItem -Path $projectRoot -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
  $extensions -contains $_.Extension.ToLowerInvariant() -and
  $_.FullName -notmatch '\\\.git\\|\\node_modules\\|\\backups?\\|\\\.baseline|\\\.backup'
}
$problems = New-Object System.Collections.Generic.List[string]
# Authentication files are protected modules. Validate their UTF-8 bytes, but do not block on legacy display text.
$legacyDisplayTextExclusions = @('bootstrap.js', 'auth.js', 'auth-config.js')
foreach ($file in $files) {
  try {
    $text = $strictUtf8.GetString([System.IO.File]::ReadAllBytes($file.FullName))
  } catch {
    $problems.Add("Invalid UTF-8 bytes: $($file.FullName)")
    continue
  }
  if ($text.IndexOf([char]0xFFFD) -ge 0) {
    $problems.Add("Replacement character found: $($file.FullName)")
  }
  if ($legacyDisplayTextExclusions -notcontains $file.Name) {
    if ([regex]::IsMatch($text, '\?[\uAC00-\uD7A3]')) {
      $problems.Add("Possible Korean mojibake found: $($file.FullName)")
    }
    if ([regex]::IsMatch($text, '[\u4E00-\u9FFF]')) {
      $problems.Add("Unexpected CJK mojibake character found: $($file.FullName)")
    }
  }
}
if ($problems.Count -gt 0) {
  $problems | ForEach-Object { Write-Error $_ }
  throw "Encoding guard failed with $($problems.Count) issue(s)."
}
Write-Host "OK  UTF-8 encoding guard ($($files.Count) files)"