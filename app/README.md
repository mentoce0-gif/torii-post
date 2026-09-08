# 今日どうする？ — 90日PoC

> 他アプリを開かずに、知らない場所へ行くかを60秒以内に決める。
> 判断材料は評価点ではなく、装備・欠損・逃げ道。
> 行ったら耐久だけ残し、次の3件を少し良くする。

子育て情報ポータルではありません。休日の親が Google Maps・Instagram・おでかけサイト・
天気・口コミを個別に開いて頭の中でやっている合成作業を、一画面に畳む判定レイヤです。

検証するのは一つだけ: **「今日どうする？」を既存の検索行動より速く決められるか。**
北極星指標は `recommendations_shown` から `decision_*` までの **Time to Decision**（目標: 中央値60秒以内）。

---

## 起動方法

前提: Node.js 22.18 以上（`node:sqlite` と TypeScript の型ストリップを使うため）。

```bash
cd app
npm install          # devDependencies は typescript と @types/node だけ
cp .env.example .env # 任意。既定値のままでも動きます
npm run dev          # http://127.0.0.1:8787  デモデータ付き
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | フロントをビルドし、`SEED_PROFILE=demo` で `--watch` 起動 |
| `npm start` | フロントをビルドし、`SEED_PROFILE` の既定（`poc`）で起動 |
| `npm run build` | ブラウザ用 TypeScript を `public/build/` へ |
| `npm test` | `node:test` によるテスト（99件） |
| `npm run typecheck` | サーバ・ブラウザ両方の型チェック |
| `npm run metrics` | Time to Decision の簡易集計（`-- --json` でJSON） |
| `npm run icons` | PWAアイコンPNGの再生成 |

実行時依存パッケージはゼロです。HTTPサーバは `node:http`、DBは `node:sqlite`。
Cloudflareへ出す場合は `wrangler`（devDependency）を使いますが、
**アプリ自身の実行時依存は増えません**。

| コマンド | 内容 |
| --- | --- |
| `npm run cf:dev` | Workers + D1 をローカルで起動（ネットワーク不要） |
| `npm run cf:deploy` | Cloudflareへデプロイ |

### スマートフォンで開く

同じLANから見るには `HOST=0.0.0.0 npm start`。
ホーム画面追加（installable）を試す場合、Chrome / Safari は
`localhost` 以外では HTTPS を要求します。`ngrok` などでトンネルするか、
リバースプロキシで TLS を終端してください。

### データプロファイル

| `SEED_PROFILE` | 内容 |
| --- | --- |
| `poc`（既定） | 出典を確認済みの値だけを表示。未確認の設備はすべて `？` |
| `demo` | 加えて「デモ用の仮データ」を読み込み、UI全体を確認できる。画面には常時「デモデータ」バナーが出ます |

`demo` の値は事実ではありません。実運用は必ず `poc` で、
[`CURATION.md`](./CURATION.md) の手順で人が現地・公式情報を確認してから値を入れます。

---

## ディレクトリ構造

```text
app/
├─ src/
│  ├─ server/                  ブラウザへ配信されないコード
│  │  ├─ main.ts               起動
│  │  ├─ config.ts             環境変数
│  │  ├─ domain/               ★ 秘匿ロジック本体
│  │  │  ├─ types.ts           データモデル型と ○△×？
│  │  │  ├─ equipment.ts       ？ の意味論（○/× へ変換しない）
│  │  │  ├─ confidence.ts      情報確度の算出ルール
│  │  │  ├─ rules.ts           判定ルールと判断理由
│  │  │  ├─ fit.ts             相性スコアと重み
│  │  │  ├─ travel.ts          移動時間の推定
│  │  │  └─ recommend.ts       候補選定・3件の構成
│  │  ├─ data/
│  │  │  ├─ repository.ts      ★ 永続化の抽象（DB交換点）
│  │  │  ├─ sqliteRepository.ts
│  │  │  ├─ schema.ts
│  │  │  └─ seed/              手動キュレーションデータ
│  │  ├─ api/                  エンドポイントごとに1ファイル
│  │  ├─ http/                 ルータ・静的配信・レート制限・ヘッダ
│  │  └─ analytics/            ★ Analytics providerの抽象
│  └─ web/                     ブラウザへ配信されるコード
│     ├─ app.ts                起動・ルーティング
│     ├─ api.ts                fetchクライアント
│     ├─ decision.ts           行く/見送る/いつもの場
│     ├─ views/                Home / Detail / After / History / Settings / Map
│     ├─ components/           装備チップ・相性と確度・判断理由
│     └─ map/                  ★ Map providerの抽象
├─ public/                     PWAシェル（manifest / sw.js / icons / styles.css）
├─ tests/                      node:test
└─ tools/                      アイコン生成・メトリクスCLI
```

★ が付いた3つが「差し替え前提」の境界です（DB / 地図 / 計測）。

---

## API

クライアントは `入力 → API → 3候補` だけを行います。

| メソッド | パス | 責務 |
| --- | --- | --- |
| `POST` | `/api/recommend` | 条件から候補を最大3件返す。セッションを作り、Time to Decisionの計測を開始 |
| `GET` | `/api/places/:id` | 1件の詳細。`?sessionId=` があればその条件での判断材料を再計算 |
| `POST` | `/api/decisions` | 行く / 見送る / いつもの場 を記録。`go` なら事後ログ用の visit を作る |
| `POST` | `/api/feedback` | 事後ログ（反応・滞在・また行くか・付箋・設備訂正） |
| `GET` | `/api/history` | 判断と実行の履歴、未記録の visit |
| `GET` `PUT` `DELETE` | `/api/profile` | 世帯設定の取得・更新・完全削除 |
| `POST` | `/api/events` | 計測イベントの受け口（既知の名前だけ受理） |
| `POST` | `/api/subjective` | 「普段より早く決められましたか？」 |
| `GET` | `/api/metrics` | 開発者用の集計。トークン未設定時はループバック限定 |
| `GET` | `/api/config` | 有効なMap providerだけを返す |

`POST /api/recommend` の入力:

```json
{
  "childAgeMonths": 18,
  "remainingMinutes": 90,
  "mobility": "car",
  "weather": "cloudy",
  "origin": { "lat": 35.01, "lng": 135.96 }
}
```

`origin` は `{ "areaCode": "shiga-kusatsu" }` でも可。どちらも無く、世帯の起点エリアも
未設定なら `DEFAULT_AREA_CODE`（既定: `shiga-otsu`）から始めます。このとき応答の
`context.originSource` は `'default'` で、画面は「大津市（既定）」と表示します。
**現在地を推測しているのではなく、既定値だと明示したうえで動く**という区別です。
`DEFAULT_AREA_CODE` 自体が未知のエリアなら `400 origin_required` を返します
（設定ミスを黙って別の街で埋めないため）。

応答の各候補には `onSiteMinutes`（往復を引いた現地の滞在可能分）が入ります。
6項目すべてが `？` のカードでも、これだけは根拠のある数字です
（世帯自身の残り時間の引き算であって、施設についての主張ではないため）。

出力は候補3件のみ。**選定ロジック・重み・スコア・全スポットDBは一切返しません。**

---

## データモデル

```text
Household ─┬─ Parent[]                 role のみ。父に固定しない
           ├─ Child[]                  生まれ年・月だけ。氏名も生年月日も持たない
           ├─ MobilityProfile          移動手段と支度時間
           ├─ PreferenceHistory[]      カテゴリ別の耐久履歴
           └─ RecommendationSession[] ─┬─ Recommendation[]
                                       └─ Decision ── Visit ── VisitFeedback

Place ─┬─ PlaceEquipment[]   1設備1行。value / source / verified_at / confidence
       └─ PlaceSource[]      出典と確認日

EquipmentReport   世帯からの訂正報告。キュレーション値を上書きしない別テーブル
AnalyticsEvent    計測イベント
SubjectiveRating  主観評価
```

`Place` と `PlaceEquipment` を分けているので、公園の記録全体に触れずに
「水道だけ確認できた」を更新できます。設備1行ごとに出典と確認日を持ちます。

---

## 判定ルール

LLMは使いません。ルールベースです。

評価する入力: `travel_time` `remaining_time` `weather_fit` `child_age_fit`
`equipment_fit` `escape_route` `previous_endurance` `information_confidence`

主なルール（すべて**理由の提示**であり、強制的な「見送り」にはしません）:

| 条件 | 提示する理由 |
| --- | --- |
| 往復が残り時間の50%以上 | 「往復◯分。遊べる時間は約◯分と短めです」 |
| 往復で残り時間を使い切る | 「残り◯分では往復◯分で終わります」 |
| 猛暑 + 日陰 `×` | 「猛暑。日陰がないため暑さ条件が弱いです」 |
| 猛暑 + 日陰 `？` | 「猛暑ですが、日陰は未確認です」 |
| 砂場 `○` + 水道 `×` | 「砂場ありで水道なし。汚れ対策が必要です」 |
| 砂場 `○` + 水道 `？` | 「砂場はありますが水道が未確認です。着替えがあると安心です」 |
| トイレ `×` + 長時間 | 「トイレがないため長居には不向きです」 |
| 雨/雪 + 屋根 `×` | 「屋根のある逃げ場がありません」 |
| 前回同カテゴリが15分未満 | 「前回このタイプは平均◯分でした」 |
| 未確認が3項目以上 | 「未確認が◯項目あります」 |
| 営業情報なし | 「利用可能時間 未確認」（営業中とは推測しない） |

### `？` の扱い

`？` は悪評価ではありません。「まだ誰も確認していない」という意味です。

- `？` を `○` として扱わない（設備をでっち上げない）
- `？` を `×` として扱わない（無いことにしない）
- `？` が多いだけで候補から外さない
- 装備スコアは**確認済みの項目だけ**で計算する
- 情報確度（何割が確認済みか）は相性とは別軸で表示する

これは `tests/unknown.test.ts` で明示的にテストしています。

### 相性と情報確度は別物

- **今日の相性** `◎ ○ △` — 今日の条件に合うか
- **情報確度** `0〜100%` — このカードに書いてあることの何割が確認済みか

情報確度は相性**スコア**に入りません。並び順の同点処理にだけ10%の重みで効きます
（`fit.ts` の `rankingScore`）。「誰も調べていない公園」が「悪い公園」に
なってしまわないための設計です。

ただし**表示するグレードには上限**があります（`fit.ts` の `gradeFor`）。

> 情報確度 0%（1項目も確認できていない）なら `◎` は出さず、`○` に留める。

`◎` は「今日の条件に特によく合う」という断定です。何も裏付けが無い状態で
断定はできません。上限が `○` で止まり `△` まで下げないのは意図的で、
未確認の場所は「6項目すべて無いと確認済みの場所」より悪くはないためです。
ここで下げてしまうと、二軸に分けた意味が消えて `？` がペナルティに戻ります。

スコア自体は変えないので、**候補の選定順・件数には一切影響しません**。
カードが知っている以上のことを言わないようにするだけの表示ルールです。

### 3件の構成

1. まだ行っていない場所 最大2件
2. 世帯が設定した「いつもの場」（設定時のみ）
3. 家・室内

条件に合う場所が足りなければ **3件に水増しせず**、
「今日の条件で成立する候補が少ないため、無理に3件にしていません」と表示します。

---

## PWA対応

- `manifest.webmanifest`（standalone / portrait / 192・512・maskable アイコン）
- `sw.js` は**アプリシェルだけ**をキャッシュ。`/api/*` は常にネットワーク
  （古い施設情報を「最新」として見せないため）
- `viewport-fit=cover` + `env(safe-area-inset-*)`
- タップ領域は最小48px、主要CTAは親指の届く固定バー
- `prefers-color-scheme` 対応、`prefers-reduced-motion` 対応
- 本文17px / 高コントラスト（WCAG AA以上を意識した配色トークン）

---

## 計測

`app_open` `recommendations_shown` `place_detail_open` `map_open`
`decision_go` `decision_skip` `decision_usual` `external_app_open`
`visit_feedback_started` `visit_feedback_completed` `return_2w` `return_4w`

各イベントに `session_id` / `household_id` / `place_id` / `recommendation_rank` /
`timestamp` を付けます。個人を特定する情報は持ちません。
`return_2w` `return_4w` は世帯の初回登録からの経過でサーバ側が判定します。

### Time to Decision

`recommendations_shown` を返した時刻をサーバがセッションに記録し、
`decision_*` の到着時刻との差を保存します。
クライアント側の `performance.now()` による計測も併せて保存しますが、
**指標にはサーバ側の値を使います**（クライアントが指標を書き換えられないため）。

```bash
npm run metrics
```

---

## セキュリティとIP

- 候補選定ルール・重み・情報確度ロジック・キュレーションデータ本体は
  `src/server/` の外に出ません。ブラウザには3件のカードだけが渡ります
  （`tests/api.test.ts` の "the client never receives the recommender" で検証）
- 全スポットを返すエンドポイントは存在しません
- CSPは `default-src 'self'`。外部スクリプト・外部ビーコン・タイルサーバへの
  リクエストはありません
- APIキーはコードにありません。秘密は `.env`（gitignore済み）にのみ
- 固定窓レートリミット。書き込みは `RATE_LIMIT_PER_MIN`、読み取りは
  `RATE_LIMIT_READ_PER_MIN`。**読み取りは以前は無制限でした** — 認証の無い無償公開で
  GET だけ数え忘れると、アカウント不要で一番安く落とせる口になります
- `X-Forwarded-For` は `TRUST_PROXY=true` のときだけ信用します。直に公開された
  ポートではこのヘッダは発信者の自己申告なので、既定で信用するとリクエストごとに
  別人を名乗れてしまい、レートリミットが飾りになります。逆にTLS終端の裏では
  全員が同じソケットから来るので、これを立てないと1人の濫用で全員が止まります
- `/api/metrics` のループバック判定は**ソケットのアドレスを直接**見ます。ここを
  プロキシ対応のヘルパに変えると `X-Forwarded-For: 127.0.0.1` で計測が公開されます
  （`tests/security.test.ts` で固定）
- HSTS / `Permissions-Policy`（geolocation以外は全部拒否）/ `X-Frame-Options: DENY`
- `/api/metrics` は `METRICS_TOKEN` 未設定ならループバックのみ
- エラーの詳細はログにだけ出し、クライアントには一般化したメッセージを返します

## プライバシー

- 子どもの氏名も生年月日も保存しません（**生まれ年と月だけ**）
- 写真・顔画像を扱う機能はありません
- 自宅住所を保存しません。起点は市区町村レベルのエリアコードのみ
- GPSはセッション利用。受け取った緯度経度は**受信時点で小数第2位に丸め**、
  保存するのはエリアコードだけです（`tests/privacy.test.ts` で検証）
- 医療相談・発達相談・虐待相談のUIは作りません
- 設定画面に「このアプリが持つ情報」を明示しています。持つもの／持たないものを
  親が読める場所に置くのが目的で、以前はこのREADMEにしか書いてありませんでした
- 設定画面から世帯データを完全削除できます（子ども・判断・訪問・記録・計測イベント）
- 世帯IDは匿名の不透明なUUID。認証方式は後から差し替えられます

---

## 交換可能な境界

| 対象 | 抽象 | 既定 |
| --- | --- | --- |
| DB | `src/server/data/driver.ts` | `NodeSqliteDriver` / `D1Driver` |
| 地図 | `src/web/map/adapter.ts` | `SchematicMapProvider`（現在地＋候補3件のみ、タイル無し） |
| 計測 | `src/server/analytics/provider.ts` | `SqliteAnalyticsProvider` |

地図は意図的に「周辺を探せない」実装です。マップを先に見せると
「他にも良い場所ないかな」という探索が始まり、このPoCが削ろうとしている
比較コストが復活するためです。Leaflet や Google Maps に差し替えても、
Adapterに渡るのは常にピン3本だけです。

---

## デプロイ

2通りの配置ができます。**同じコードが両方で動きます** — 判定ロジックも
`Repository` も共通で、違うのは「HTTPの入口」と「DBのドライバ」だけです。

### A. Cloudflare Workers + D1（推奨・無償枠）

**前提**: Cloudflareアカウント（無料・クレジットカード不要）と Node 22.18以上。
**この作業は開発マシンのターミナルで行います**（CIやコンテナからではなく）。

```bash
git clone https://github.com/mentoce0-gif/torii-post.git
cd torii-post/app
bash scripts/deploy-cloudflare.sh    # ログイン〜デプロイ〜疎通確認まで
```

スクリプトは何度実行しても壊れません（済んだ工程は飛ばします）。
`database_id` の貼り替えも自動で行うので、手でコピペする必要はありません。
中で何が起きているかを知りたい場合は、以下が同じ手順を手で追ったものです。

```bash
git clone https://github.com/mentoce0-gif/torii-post.git
cd torii-post/app
npm ci

npx wrangler login          # ブラウザが開く。Cloudflareにログインして許可
npm run cf:db:create        # → 出力された database_id を wrangler.jsonc に貼る
npm run cf:secret           # METRICS_TOKEN を貼り付け（公開前に必須）
npm run cf:deploy           # → https://kyou-dousuru.<account>.workers.dev
```

`cf:db:create` は次のような出力を返します。`database_id` の値を
`wrangler.jsonc` の `"REPLACE_WITH_D1_DATABASE_ID"` と差し替えてください。

```
[[d1_databases]]
binding = "DB"
database_name = "kyou-dousuru"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   ← これ
```

`METRICS_TOKEN` の値は次で作れます:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

デプロイ前に手元で本番と同じ経路を確認したい場合は `npm run cf:dev`
（ローカルD1。Cloudflareへの接続もログインも不要です）。

- **TLSと独自ドメインが付いてきます。** PWAのホーム画面追加にはHTTPSが要るので、
  ここが自前運用との一番の差です
- スキーマ投入とシードは**最初のリクエストで1回だけ**走ります。どちらも冪等で、
  シードは世帯データに触れません
- 静的ファイルは Workers Assets がWorkerを起こさずに配ります
- `wrangler dev` はネットワーク無しでも動きます（ローカルD1）。
  `npm run cf:dev` で本番と同じ経路を手元で確認できます

**なぜD1なのか（データを外に出さないため）**

D1には**公開エンドポイントがありません**。ホスト名もポートも接続文字列も存在せず、
バインドされたWorkerからしか到達できません。つまり「溜まったデータを外から抜けない」が
**プラットフォームの性質**として成立します。マネージドPostgresなら
接続情報という漏れうる秘密を守り続ける話になりますが、D1にはその秘密自体がありません。

バックアップは `npm run cf:db:export`（アカウント認証が要ります）。

### B. 単一プロセス（Node + SQLiteファイル）

```bash
npm ci && npm run build
NODE_ENV=production DB_PATH=/var/lib/kns/poc.sqlite HOST=0.0.0.0 PORT=8787 node src/server/main.ts
```

- TLS終端とHTTPリダイレクトはリバースプロキシ側で（PWAのinstall要件）。
  そのプロキシを立てたら `TRUST_PROXY=true` も一緒に設定してください。
  立てていないうちは `false` のままにします（ヘッダを偽装されるため）
- `METRICS_TOKEN` を設定してから公開してください
- SQLiteファイルをバックアップ対象に含めてください

### レートリミットについて（両方に共通）

プロセス内メモリの固定窓です。Workersでは**アイソレートごと**に持つので、
これは保険であって主たる防御ではありません。無償公開の実際の制御点は
**Cloudflare側のWAFレートリミットルール**（無償枠に1ルール）です。
全リクエストを見る層で先に落とすのが正解で、Worker内の制限はその後ろの二重化です。

## テスト

```bash
npm test
```

`recommend` API / 情報確度 / 判定理由 / Decision保存 / Feedback保存 /
Time to Decision計測 / プライバシー / シードの出典検証 をカバーしています。
とくに **`？` を `○` としても `×` としても扱わない**ことを明示的にテストしています。

シード側（`tests/seed.test.ts`）が固定しているのは、値そのものではなく**裏付けの有無**です。

- `poc` プロファイルにデモ値もデモバナーも出ない
- `demoObservations.ts` の値が `places.ts` へ昇格していない
- まだ誰も読んでいない候補URL（`checkedAt: null`）を根拠に値を書いていない

「全項目が `？` であること」はテストしていません。それを固定すると、
`CURATION.md` の手順どおりに出典付きで値を埋めた瞬間にテストが落ち、
キュレーション作業そのものが妨げられるためです。
