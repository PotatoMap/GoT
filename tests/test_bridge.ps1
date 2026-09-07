# End-to-end test: ai_bridge.py + engines/mock_gtp.py  (all files under D:\MyProjects\GOAI)
$ErrorActionPreference = 'Stop'
$root = "D:\MyProjects\GOAI\GoT_GUI"
$log = Join-Path $root "tests\bridge_stdout.log"
$errlog = Join-Path $root "tests\bridge_stderr.log"
if (Test-Path $log) { Remove-Item $log }
if (Test-Path $errlog) { Remove-Item $errlog }

$proc = Start-Process -FilePath "python" -ArgumentList @('ai_bridge.py','--engine-cmd','"python engines/mock_gtp.py"','--port','8799') -PassThru -NoNewWindow -WorkingDirectory $root -RedirectStandardOutput $log -RedirectStandardError $errlog
Start-Sleep -Seconds 4

$failed = 0
function Check($cond, $name) { if ($cond) { Write-Host "PASS: $name" } else { Write-Host "FAIL: $name"; $script:failed++ } }

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8799/health" -Method Get -TimeoutSec 10
  Check ($health.ok -eq $true) "health ok"
  Check ($health.engine.name -eq 'GoT-Mock') "engine name (got $($health.engine.name))"
  Check ($health.engine.kataAnalyze -eq $true) "kata-analyze detected"

  # raw gtp passthrough
  $g = Invoke-RestMethod -Uri "http://127.0.0.1:8799/gtp" -Method Post -Body (@{command='name'} | ConvertTo-Json) -ContentType 'application/json' -TimeoutSec 10
  Check ($g.ok -and $g.response -match 'GoT-Mock') "raw gtp: $($g.response)"

  # analyze empty board
  $req = @{ size=9; komi=7.5; toMove=1; seconds=1.0; topN=5; moves=@() }
  $a = Invoke-RestMethod -Uri "http://127.0.0.1:8799/analyze" -Method Post -Body ($req | ConvertTo-Json) -ContentType 'application/json' -TimeoutSec 20
  Check ($a.ok -eq $true) "analyze ok"
  Check ($a.bestMove -and $a.bestMove.x -ge 0) "bestMove present ($($a.bestMove | ConvertTo-Json -Compress))"
  Check ($a.candidates.Count -ge 3) "candidates: $($a.candidates.Count)"
  Check ($a.candidates[0].visits -gt 0) "visits>0"
  Check ($null -ne $a.candidates[0].winrate) "winrate present"
  Check ($a.candidates[0].pv.Count -ge 1) "pv present"

  # analyze after moves (SGF-style strings mixed with objects)
  $req2 = @{ size=9; komi=7.5; toMove=2; seconds=1.0; topN=5; ownership=$true; moves=@('cc','ge', @{x=2;y=6;color=1}) }
  $b = Invoke-RestMethod -Uri "http://127.0.0.1:8799/analyze" -Method Post -Body ($req2 | ConvertTo-Json -Depth 5) -ContentType 'application/json' -TimeoutSec 20
  Check ($b.ok -eq $true) "analyze with moves ok"
  Check ($null -ne $b.ownership -and $b.ownership.Count -eq 81) "ownership 81 floats"
  Check ($b.candidates[0].pv.Count -ge 1) "pv after moves"
  Write-Host "best after 3 moves: $($b.bestMove | ConvertTo-Json -Compress), top visits: $($b.candidates[0].visits)"
} catch {
  Write-Host "FAIL: exception - $_"
  $failed++
} finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
Write-Host "---- bridge stdout ----"
Get-Content $log -ErrorAction SilentlyContinue | Select-Object -First 12
Write-Host "---- bridge stderr ----"
Get-Content $errlog -ErrorAction SilentlyContinue | Select-Object -First 12
if ($failed -gt 0) { exit 1 } else { Write-Host "ALL BRIDGE TESTS PASSED" }
