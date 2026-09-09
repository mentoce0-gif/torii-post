#!/usr/bin/env bash
#
# 「今日どうする？」を Cloudflare Workers + D1 に配置する。
#
# 手順書どおりに打つ代わりのもの。何度実行しても壊れないように書いてあります
# （2回目以降は既にできているものを飛ばします）。
#
#   cd kyou-dousuru && bash scripts/deploy-cloudflare.sh
#
# 途中でブラウザが開いたら Cloudflare にログインして許可してください。
set -euo pipefail

cd "$(dirname "$0")/.."

say() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
die() { printf '\n\033[31m✘ %s\033[0m\n' "$1" >&2; exit 1; }

# --- 1. 前提の確認 ----------------------------------------------------------
say "環境を確認しています"

command -v node >/dev/null || die "Node.js が見つかりません。https://nodejs.org/ から 22.18 以上を入れてください。"

node -e '
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 18)) {
  console.error(`Node ${process.versions.node} は古すぎます。22.18 以上が要ります。`);
  process.exit(1);
}
console.log(`  Node ${process.versions.node} OK`);
' || die "Node のバージョンが足りません。"

if [ ! -d node_modules ]; then
  say "依存関係を入れています（初回のみ・1〜2分）"
  npm ci
fi

# --- 2. Cloudflare へのログイン ---------------------------------------------
if npx wrangler whoami 2>&1 | grep -q "not authenticated"; then
  say "Cloudflare にログインします（ブラウザが開きます）"
  echo "  開いたページで「Allow」を押してください。"
  npx wrangler login
else
  say "Cloudflare には既にログイン済みです"
fi

npx wrangler whoami 2>&1 | grep -iE "account|email" | head -3 || true

# --- 3. D1 データベース ------------------------------------------------------
PLACEHOLDER="REPLACE_WITH_D1_DATABASE_ID"

if grep -q "$PLACEHOLDER" wrangler.jsonc; then
  say "D1 データベースを作成しています"

  # 作成済みなら作成は失敗する。その場合も後段の id 取得で拾えるので止めない。
  npx wrangler d1 create kyou-dousuru 2>&1 | tee /tmp/d1-create.log || true

  # 作成直後の出力からでも、既存一覧からでも id を取れるようにする。
  DB_ID="$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' /tmp/d1-create.log | head -1 || true)"

  if [ -z "$DB_ID" ]; then
    echo "  作成出力から id を拾えませんでした。既存の一覧から探します。"
    DB_ID="$(npx wrangler d1 info kyou-dousuru --json 2>/dev/null \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).uuid??"")}catch{console.log("")}})' || true)"
  fi

  [ -n "$DB_ID" ] || die "D1 の database_id を取得できませんでした。'npx wrangler d1 list' の出力を貼って相談してください。"

  # 手でコピペする工程がいちばん間違えやすいので、ここで書き込む。
  node -e '
    const fs = require("fs");
    const file = "wrangler.jsonc";
    const before = fs.readFileSync(file, "utf8");
    const after = before.replace(process.argv[1], process.argv[2]);
    if (before === after) { console.error("置換できませんでした"); process.exit(1); }
    fs.writeFileSync(file, after);
  ' "$PLACEHOLDER" "$DB_ID"

  echo "  wrangler.jsonc に database_id を書き込みました: $DB_ID"
else
  say "D1 は設定済みです（wrangler.jsonc に database_id があります）"
fi

# --- 4. METRICS_TOKEN --------------------------------------------------------
# 未設定なら /api/metrics はこのランタイムでは到達不能のまま（ループバックが無いため）。
# 公開してよい状態ではあるが、指標が読めないので必ず入れておく。
if npx wrangler secret list 2>/dev/null | grep -q METRICS_TOKEN; then
  say "METRICS_TOKEN は設定済みです"
else
  say "METRICS_TOKEN を作って登録します"
  TOKEN="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
  echo "  生成しました。この値は控えておいてください（後から読み出せません）:"
  echo
  echo "    $TOKEN"
  echo
  printf '%s' "$TOKEN" | npx wrangler secret put METRICS_TOKEN
fi

# --- 5. デプロイ -------------------------------------------------------------
say "ブラウザ用のJSをビルドしてデプロイします"
npm run build
npx wrangler deploy 2>&1 | tee /tmp/cf-deploy.log

URL="$(grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' /tmp/cf-deploy.log | head -1 || true)"

# --- 6. 動作確認 -------------------------------------------------------------
if [ -n "$URL" ]; then
  say "公開URL: $URL"
  echo "  応答を確認しています（初回はスキーマ投入とシードで少し待ちます）"
  sleep 5

  CODE="$(curl -s -o /dev/null -w '%{http_code}' "$URL/" || echo 000)"
  echo "  トップ画面: HTTP $CODE"

  echo "  候補API:"
  curl -s -X POST "$URL/api/recommend" \
    -H 'Content-Type: application/json' \
    -d '{"childAgeMonths":18,"remainingMinutes":90,"mobility":"car","weather":"cloudy","origin":{}}' \
    | head -c 300
  echo

  # 未設定でも設定済みでも 401 が正しい（トークン無しのアクセスだから）。
  M="$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/metrics" || echo 000)"
  echo "  /api/metrics（トークン無し・401が正常）: HTTP $M"

  say "完了しました"
  echo "  スマホでこのURLを開き、ホーム画面に追加してください。"
  echo "  指標: curl -H 'Authorization: Bearer <控えたトークン>' $URL/api/metrics"
else
  say "デプロイは終わりましたがURLを拾えませんでした"
  echo "  /tmp/cf-deploy.log を確認してください。"
fi
