# 「今日どうする？」を Cloudflare Workers + D1 に配置する（Windows / PowerShell 版）。
#
#   cd torii-post\app
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-cloudflare.ps1
#
# 何度実行しても壊れません（済んだ工程は飛ばします）。
# 途中でブラウザが開いたら Cloudflare にログインして「Allow」を押してください。

$ErrorActionPreference = 'Stop'

function Say  ($m) { Write-Host "`n▶ $m" -ForegroundColor Cyan }
function Die  ($m) { Write-Host "`n✘ $m" -ForegroundColor Red; exit 1 }
function Note ($m) { Write-Host "  $m" }

# app/ ディレクトリ基準で動かす（scripts/ の1つ上）。
Set-Location (Split-Path $PSScriptRoot -Parent)

# --- 1. 前提の確認 ----------------------------------------------------------
Say "環境を確認しています"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Die "Node.js が見つかりません。https://nodejs.org/ から 22.18 以上を入れて、PowerShell を開き直してください。"
}

$nodeVersion = (node --version).TrimStart('v')
$parts = $nodeVersion.Split('.')
$major = [int]$parts[0]
$minor = [int]$parts[1]
if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 18)) {
  Die "Node $nodeVersion は古すぎます。22.18 以上が要ります。"
}
Note "Node $nodeVersion OK"

if (-not (Test-Path node_modules)) {
  Say "依存関係を入れています（初回のみ・1〜2分）"
  npm ci
  if ($LASTEXITCODE -ne 0) { Die "npm ci が失敗しました。" }
}

# --- 2. Cloudflare へのログイン ---------------------------------------------
$who = (npx wrangler whoami 2>&1 | Out-String)
if ($who -match 'not authenticated') {
  Say "Cloudflare にログインします（ブラウザが開きます）"
  Note "開いたページで「Allow」を押してください。"
  npx wrangler login
  if ($LASTEXITCODE -ne 0) { Die "ログインが完了しませんでした。" }
} else {
  Say "Cloudflare には既にログイン済みです"
}

# --- 3. D1 データベース ------------------------------------------------------
$placeholder = 'REPLACE_WITH_D1_DATABASE_ID'
$config = 'wrangler.jsonc'
$uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

if ((Get-Content $config -Raw) -match $placeholder) {
  Say "D1 データベースを作成しています"

  # 既に作成済みなら作成は失敗する。その場合も次の d1 info で id を拾えるので止めない。
  $created = (npx wrangler d1 create kyou-dousuru 2>&1 | Out-String)
  Write-Host $created

  $dbId = $null
  if ($created -match $uuidPattern) { $dbId = $Matches[0] }

  if (-not $dbId) {
    Note "作成出力から id を拾えませんでした。既存の一覧から探します。"
    $info = (npx wrangler d1 info kyou-dousuru 2>&1 | Out-String)
    if ($info -match $uuidPattern) { $dbId = $Matches[0] }
  }

  if (-not $dbId) {
    Die "D1 の database_id を取得できませんでした。'npx wrangler d1 list' の出力を貼って相談してください。"
  }

  # 手でコピペする工程がいちばん間違えやすいので、ここで書き込む。
  # 読み書きは UTF-8（BOM無し）で行う。BOM が付くと wrangler が設定を読めない。
  $text = [System.IO.File]::ReadAllText((Resolve-Path $config))
  $text = $text.Replace($placeholder, $dbId)
  [System.IO.File]::WriteAllText((Resolve-Path $config), $text, (New-Object System.Text.UTF8Encoding($false)))

  Note "wrangler.jsonc に database_id を書き込みました: $dbId"
} else {
  Say "D1 は設定済みです（wrangler.jsonc に database_id があります）"
}

# --- 4. METRICS_TOKEN --------------------------------------------------------
# 未設定でも公開はできますが、指標が読めません。
$secrets = (npx wrangler secret list 2>&1 | Out-String)
if ($secrets -match 'METRICS_TOKEN') {
  Say "METRICS_TOKEN は設定済みです"
} else {
  Say "METRICS_TOKEN を作って登録します"
  $token = (node -e "console.log(require('crypto').randomBytes(24).toString('hex'))").Trim()
  Write-Host ""
  Write-Host "  控えておいてください（後から読み出せません）:" -ForegroundColor Yellow
  Write-Host "    $token" -ForegroundColor Yellow
  Write-Host ""
  $token | npx wrangler secret put METRICS_TOKEN
}

# --- 5. デプロイ -------------------------------------------------------------
Say "ブラウザ用のJSをビルドしてデプロイします"
npm run build
if ($LASTEXITCODE -ne 0) { Die "ビルドが失敗しました。" }

$deploy = (npx wrangler deploy 2>&1 | Out-String)
Write-Host $deploy

$url = $null
if ($deploy -match 'https://[a-zA-Z0-9.\-]+\.workers\.dev') { $url = $Matches[0] }

# --- 6. 動作確認 -------------------------------------------------------------
if ($url) {
  Say "公開URL: $url"
  Note "応答を確認しています（初回はスキーマ投入とシードで少し待ちます）"
  Start-Sleep -Seconds 5

  try {
    $shell = Invoke-WebRequest -Uri "$url/" -UseBasicParsing -TimeoutSec 30
    Note "トップ画面: HTTP $($shell.StatusCode)"
  } catch {
    Note "トップ画面: 取得できませんでした（$($_.Exception.Message)）"
  }

  try {
    $body = '{"childAgeMonths":18,"remainingMinutes":90,"mobility":"car","weather":"cloudy","origin":{}}'
    $rec = Invoke-WebRequest -Uri "$url/api/recommend" -Method Post -Body $body -ContentType 'application/json' -UseBasicParsing -TimeoutSec 30
    Note "候補API: HTTP $($rec.StatusCode)"
    Write-Host ("  " + $rec.Content.Substring(0, [Math]::Min(300, $rec.Content.Length)))
  } catch {
    Note "候補API: $($_.Exception.Message)"
  }

  # トークン無しなら 401 が正常。
  try {
    Invoke-WebRequest -Uri "$url/api/metrics" -UseBasicParsing -TimeoutSec 30 | Out-Null
    Note "/api/metrics: 200 — 想定外です（トークン無しで開いています）"
  } catch {
    $code = 'unknown'
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    Note "/api/metrics（トークン無し・401が正常）: $code"
  }

  Say "完了しました"
  Note "スマホでこのURLを開き、ホーム画面に追加してください。"
} else {
  Say "デプロイは終わりましたがURLを拾えませんでした"
  Note "上の出力を貼って相談してください。"
}
