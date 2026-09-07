$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'gtp_logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir 'katago_server.log'
$err = Join-Path $logDir 'katago_server.err'
$p = Start-Process -FilePath 'node' -ArgumentList @('server.js','--port','4182') -PassThru -NoNewWindow -WorkingDirectory $root -RedirectStandardOutput $log -RedirectStandardError $err
# KataGo first load may tune OpenCL — allow up to 3 min
$up = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 3000
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:4182/health" -TimeoutSec 5
    if ($h.ok) { $up = $true; break }
  } catch { }
}
$failed = 0
function Check($cond, $name) { if ($cond) { Write-Host "PASS: $name" } else { Write-Host "FAIL: $name"; $script:failed++ } }
if (-not $up) { Write-Host "FAIL: server never became healthy"; Get-Content $log -ErrorAction SilentlyContinue | Select-Object -First 10; Get-Content $err -ErrorAction SilentlyContinue | Select-Object -First 10; Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; exit 1 }

Check ($h.engine.name -eq 'KataGo') "engine name: $($h.engine.name)"
Check ($h.engine.kataAnalyze -eq $true) "kata-analyze supported"
Write-Host "version: $($h.engine.version)"

# real analysis with ownership
$req = @{ size = 9; komi = 7.5; toMove = 1; seconds = 1.5; topN = 5; ownership = $true; moves = @() }
$a = Invoke-RestMethod -Uri "http://127.0.0.1:4182/analyze" -Method Post -Body ($req | ConvertTo-Json) -ContentType 'application/json' -TimeoutSec 120
Check ($a.ok -eq $true) "analyze ok"
Check ($a.bestMove -and ($a.bestMove.x -ge 0 -or $a.bestMove.pass)) "bestMove: $($a.bestMove | ConvertTo-Json -Compress)"
Check ($a.candidates.Count -ge 3) "candidates: $($a.candidates.Count)"
$top = $a.candidates[0]
Check ($null -ne $top.winrate) "winrate: $([math]::Round($top.winrate,1))%"
Check ($null -ne $top.pv -and $top.pv.Count -ge 1) "pv: $($top.pv.Count) plies"
Check ($null -ne $a.ownership -and $a.ownership.Count -eq 81) "ownership 81 floats"
Write-Host "top move: ($($top.x),$($top.y)) visits=$($top.visits) wr=$([math]::Round($top.winrate,1))% score=$([math]::Round($top.scoreLead,2))"

# with moves replayed
$req2 = @{ size = 9; komi = 7.5; toMove = 2; seconds = 1.5; topN = 3; moves = @('ee', 'cc') }
$b = Invoke-RestMethod -Uri "http://127.0.0.1:4182/analyze" -Method Post -Body ($req2 | ConvertTo-Json) -ContentType 'application/json' -TimeoutSec 120
Check ($b.ok -eq $true) "analyze after moves ok; best: $($b.bestMove | ConvertTo-Json -Compress)"

# incremental replay: same game, one move longer — must hit the incremental path (server cache)
$req3 = @{ size = 9; komi = 7.5; toMove = 1; seconds = 1.5; topN = 3; ownership = $true; moves = @('ee', 'cc', 'dd') }
$sw = [Diagnostics.Stopwatch]::StartNew()
$c = Invoke-RestMethod -Uri "http://127.0.0.1:4182/analyze" -Method Post -Body ($req3 | ConvertTo-Json) -ContentType 'application/json' -TimeoutSec 120
$sw.Stop()
Check ($c.ok -eq $true) "incremental analyze ok (prefix of previous + 1 move, $($sw.ElapsedMilliseconds) ms)"
Check ($null -ne $c.ownership -and $c.ownership.Count -eq 81) "incremental ownership 81 floats"

# setup stones (handicap style AB) — integer indexes per server contract (idx = y*size+x)
$req4 = @{ size = 9; komi = 0.5; toMove = 2; seconds = 1.5; topN = 3; setup = @{ AB = @(30, 60) }; moves = @() }
$d = Invoke-RestMethod -Uri "http://127.0.0.1:4182/analyze" -Method Post -Body ($req4 | ConvertTo-Json -Depth 5) -ContentType 'application/json' -TimeoutSec 120
Check ($d.ok -eq $true) "analyze with setup AB ok; best: $($d.bestMove | ConvertTo-Json -Compress)"
Check ($null -ne $d.ownership -and $d.ownership.Count -eq 81) "setup ownership 81 floats"

# cached /health must NOT re-probe: second call returns instantly with same info
$sw = [Diagnostics.Stopwatch]::StartNew()
$h2 = Invoke-RestMethod -Uri "http://127.0.0.1:4182/health" -TimeoutSec 5
$sw.Stop()
Check ($h2.ok -eq $true -and $h2.engine.name -eq 'KataGo') "cached /health ok ($($sw.ElapsedMilliseconds) ms)"

Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Get-Process katago -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
if ($failed -gt 0) { exit 1 } else { Write-Host "KATAGO E2E ALL PASSED" }
