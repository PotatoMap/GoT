$ErrorActionPreference = 'Stop'
$root = "D:\MyProjects\GOAI\GoT_GUI"
$p = Start-Process -FilePath 'python' -ArgumentList @('-m','http.server','4180','--bind','127.0.0.1') -PassThru -NoNewWindow -WorkingDirectory $root -RedirectStandardOutput "$root\tests\http_stdout.log" -RedirectStandardError "$root\tests\http_stderr.log"
Start-Sleep 2
$assets = @('index.html','styles.css','js/goengine.js','js/ai-worker.js','js/gtp.js','js/board.js','js/app.js','favicon.svg','manifest.webmanifest','sw.js')
$failed = 0
foreach ($a in $assets) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:4180/$a" -UseBasicParsing -TimeoutSec 8
    if ($r.StatusCode -eq 200) { Write-Host "PASS 200 $a" } else { Write-Host "FAIL $($r.StatusCode) $a"; $failed++ }
  } catch { Write-Host "FAIL $a : $_"; $failed++ }
}
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
if ($failed -gt 0) { exit 1 } else { Write-Host 'ALL ASSETS SERVED OK' }
