$u = "https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz"
$o = "D:\MyProjects\GOAI\GoT_GUI\engines\katago\kata1-b18c384nbt.bin.gz"
$expected = 97898094
for ($i = 0; $i -lt 40; $i++) {
  $len = (Get-Item $o -ErrorAction SilentlyContinue).Length
  if ($len -ge $expected) { Write-Output "DONE $len"; exit 0 }
  Write-Output "attempt $i at $len"
  curl.exe -s -S --fail -C - --retry 5 --retry-delay 3 `
    -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0" `
    -e "https://katagotraining.org/networks/" `
    -o $o $u
  Start-Sleep -Seconds 2
}
$len = (Get-Item $o).Length
Write-Output "FINAL $len"
