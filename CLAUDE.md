# 今日どうする？ PoC — 作業メモ

独立したリポジトリです。以前は `torii-post`（Japan買い物ガイドのEleventyブログ）の
`app/` に同居していましたが、無関係なプロジェクトが1つのリポジトリに入っていて
読みにくかったため、`git subtree split` で履歴ごと切り出しました。
そちらに残っている `app/` は、この分離より前の状態です。

公開URL: https://kyou-dousuru.mentoce0.workers.dev

## これは何か

子育て情報ポータルではありません。

> 他アプリを開かずに、知らない場所へ行くかを60秒以内に決める。
> 判断材料は評価点ではなく、装備・欠損・逃げ道。
> 行ったら耐久だけ残し、次の3件を少し良くする。

北極星指標は Time to Decision（`recommendations_shown` → `decision_*`、目標: 中央値60秒以内）。

**実装判断に迷ったら「これは60秒以内の意思決定を速くするか？」で決める。NOなら実装しない。**

詳しい設計は `README.md`、施設データの扱いは `CURATION.md` にあります。
どちらも読んでから手を入れてください。

## 壊してはいけない不変条件

どれもテストで固定してあります。テストを緩める形で通さないでください。

1. **`？` を `○` にも `×` にも変換しない。**
   `？` は「まだ誰も確認していない」であって「無い」ではありません。
   装備スコアは確認済み項目だけで計算し、`？` が多いだけで候補から外しません。
   → `tests/unknown.test.ts`

2. **選定ロジック・重み・情報確度の計算式・全スポットDBをブラウザへ配信しない。**
   クライアントに渡すのは3件のカードと、そこに書かれた文だけです。
   全件を返すエンドポイントは作らないでください。
   → `tests/api.test.ts` の "the client never receives the recommender"

3. **相性と情報確度は別軸。** 確度を相性スコアに混ぜないでください
   （混ぜると `？` が順位のペナルティに戻ります）。
   表示グレードにだけ上限があります（`fit.ts` の `gradeFor`）:
   確度0%なら `◎` を出さず `○` に留める。`△` までは下げない。

4. **推測で埋めない。** 営業時間が不明なら「営業中」ではなく「利用可能時間 未確認」。
   出典なしの設備値は `validateSeed` が起動時に例外で落とします（仕様です）。

5. **プライバシー**: 子どもの氏名・生年月日・写真は持ちません（生まれ年と月だけ）。
   GPSは受信時点で小数第2位に丸め、保存するのはエリアコードのみ。
   → `tests/privacy.test.ts`

## 作らないもの

SNS / 掲示板 / みんなに聞く / アバター / ポイント / 家族アルバム / 年末動画 /
クーポン一覧 / 全国スポットDB / AIランキング / AIによる施設情報推測 / 長文レビュー /
写真投稿前提のUX / 無限スクロール / 周辺施設を大量表示するマップ。

提案するのは構いませんが、今回の実装には入れないでください。

## 起動と検証

```bash
npm install     # devDependencies は typescript と @types/node だけ
npm run dev     # → http://127.0.0.1:8787（デモデータ + --watch）
npm start       # SEED_PROFILE の既定（poc = 正直なデータ）で起動
npm test        # node:test
npm run typecheck
npm run metrics # Time to Decision の集計
```

**Node 22.18以上が必須**です。`node:sqlite` とTypeScriptの型ストリップを標準機能として
使っているため、Node 20では起動しません。実行時依存パッケージはゼロ。

サーバのTypeScriptはビルドせず直接実行します。ビルドするのはブラウザ用JSだけ
（`tsc -p tsconfig.web.json` → `public/build/`）。**サーバのコードは
`erasableSyntaxOnly` の制約下にあります** — コンストラクタのパラメータプロパティや
`enum` は使えません（フィールド宣言 + 代入で書いてください）。

## データプロファイル

| `SEED_PROFILE` | 内容 |
| --- | --- |
| `poc`（既定） | 出典を確認済みの値だけ。未確認の設備はすべて `？` |
| `demo`（`npm run dev`） | 加えて未検証の仮データを読み、画面に「デモデータ」バナーを常時表示 |

`demoObservations.ts` の値は**事実ではありません**。`places.ts` に昇格させず、
`CURATION.md` の手順で調べ直してください。

## 差し替え前提の境界

| 対象 | 抽象 | 既定 |
| --- | --- | --- |
| DB | `src/server/data/driver.ts` | `NodeSqliteDriver` / `D1Driver` |
| 地図 | `src/web/map/adapter.ts` | `SchematicMapProvider`（現在地＋候補3件のみ、タイル無し） |
| 計測 | `src/server/analytics/provider.ts` | `SqliteAnalyticsProvider` |

地図は意図的に「周辺を探せない」実装です。マップを先に見せると
「他にも良い場所ないかな」という探索が始まり、このPoCが削ろうとしている
比較コストが復活するため。差し替えてもAdapterに渡るのは常にピン3本だけにしてください。

## 現状

- 4画面（Home / Detail / Decision / After）+ 履歴 + 設定 + 地図 が通しで動作
- テスト102件pass、サーバ・ブラウザ・Workerの3つとも型チェックpass
- PWA: manifest / service worker（**シェルのみキャッシュ、`/api/*` はネットワーク限定**）/
  アイコン / safe-area / タップ領域48px以上 / ダークモード / コントラストAA実測済み

### 次にやること（優先順）

1. **`CURATION.md` のチェックリスト。** 12件72項目のうち確定しているのは3項目だけで、
   残りは `？` のままです。この環境から出典を読めないためです。
   PoC開始前に人が確認する必要があります。

   **再挑戦する前に:** ネットワークは検証済みで、`*.lg.jp` だけの問題ではありません。
   `curl` も `WebFetch` も `google.com` を含む全ホストが egressプロキシに `403` で
   止められます。通るのは検索ツールだけで、返るのは要約であってページ本文ではない。
   一次情報を読む手段がないので、**ここは環境を変えない限り埋まりません。**
   検索要約から値を書くのは禁止です（要約は設備の存在を推測しますし、
   第1／第2なぎさ公園のような隣接施設を混同します。実例は `CURATION_LEADS.md`）。

   下ごしらえは済んでいます:
   - 全件に「読むべきページ」の候補URLが `checkedAt: null`＝未確認で入っています
     （30件。設備が載っていそうな下層ページと各市の「赤ちゃんの駅」一覧を含む）。
     設備値は解錠しません。探す手間を省くだけです。
   - `CURATION_LEADS.md` に「どのページに6項目のどれが載っていそうか」と
     検索要約の罠をまとめてあります。**あちらは証拠ではありません。**
   - チェックリストの目視2項目は `tests/seed.test.ts` に移しました。
   - シードのテストは「値がゼロであること」ではなく「裏付けがあること」を見ています。
     **出典付きで値を埋めればテストは通ります。** 緩める必要はありません。
2. `METRICS_TOKEN` を設定してから公開（未設定だと `/api/metrics` はループバック限定）。
3. TLS終端（スマホのホーム画面追加には HTTPS が要ります）。
   **立てたら `TRUST_PROXY=true` も設定**してください。TLS終端の裏では全員が同じ
   ソケットから来るので、これが false のままだと1人の濫用で全世帯が429になります。
   逆に、プロキシが無いのに true にすると `X-Forwarded-For` を偽装され放題です。
4. ~~Cloudflareへの初回デプロイ~~ **完了（2026-09-08）**。
   公開URL: https://kyou-dousuru.mentoce0.workers.dev
   D1 `kyou-dousuru`（APAC）/ `SEED_PROFILE=poc` / `METRICS_TOKEN` 設定済み。
   トップ200・候補API201・`/api/metrics` はトークン無しで401を確認。
   以後の更新は `npm run cf:deploy`（`wrangler.jsonc` の `database_id` は
   コミット済みなので、2回目以降はこれだけです）。

## 2つのランタイム

同じコードが Node と Cloudflare Workers の両方で動きます。

| | Node | Workers |
| --- | --- | --- |
| 入口 | `src/server/http/server.ts` | `src/worker/index.ts` |
| DB | `NodeSqliteDriver`（`node:sqlite`） | `D1Driver`（D1バインディング） |
| 静的配信 | `http/static.ts` | Workers Assets |
| 起点IP | `remoteAddress` / `TRUST_PROXY` 時のみ XFF | `CF-Connecting-IP`（偽装不可） |
| `/api/metrics` | ループバックか トークン | **トークンのみ**（ループバックが無いため） |

共通なのは `domain/`（判定ロジック）、`api/`（ルート）、`SqlRepository`。
**リポジトリ実装は1つだけ**です。2つ書くとSQLが少しずつ食い違い、
その差はずっと後になって「間違ったデータ」としてしか現れないためです。

`src/server/data/sqlRepository.ts` が本体、`sqliteRepository.ts` はNode専用の
薄い派生（`node:sqlite` をWorkerのバンドルに引き込まないための分離）。

### D1で踏んだこと

- **`PRAGMA` は `SQLITE_AUTH` で拒否されます。** 最初のリクエストでWorkerごと落ちました。
  `schema.ts` の2つ（`journal_mode`・`foreign_keys`）はどちらもローカルファイル用の
  設定なので、`d1Driver.ts` の `splitStatements` が落としています（テストで固定）。
- D1は非同期です。そのために `Repository` 全体を `Promise` 化しました。

### 起点は大津

`DEFAULT_AREA_CODE=shiga-otsu`。現在地が取れず世帯も未設定なら大津から始めます。
以前はここで `400 origin_required` を返して止めていましたが、位置情報を許可しない
利用者（大半）が初回に壁に当たるため、既定値から動くようにしました。
**推測ではありません**: 応答は `originSource: 'default'`、画面は「大津市（既定）」。
`tests/api.test.ts` が、既定は既定と名乗ること・選択は `chosen` と名乗ること・
`DEFAULT_AREA_CODE` が不正なら400のままであることを固定しています。

### 公開後にやること

1. **WAFレートリミットルール**を1本入れる（無償枠に1つ）。Worker内のリミッタは
   アイソレートごとなので保険であって主たる制御点ではありません。
2. **データ。** 確定しているのは3値だけです（皇子が丘=砂場・トイレ、なぎさ=トイレ）。
   残りは `？` のまま。`CURATION_LEADS.md` を参照。
3. スマホでホーム画面に追加して、PWAとして動くか実機確認。

### 保留中の選択肢

`◎` に「最低でも半数（3/6）の確認」を要求するかどうか。
現状は確度0%のときだけ `◎` を抑えています（ユーザーの指示範囲）。
17%（6項目中1つ確認）ではまだ `◎` が出ます。

## 単一プロセス構成

`src/server/main.ts` が設定読み込み → SQLite接続とスキーマ適用 → シード投入 →
Analytics provider選択 → `node:http` で listen まで行います。
静的ファイルも同じプロセスが配信するので、nginx等は不要です。
状態はSQLiteファイル1つで、レートリミッタもプロセス内メモリ。
水平スケールさせるならこの2点が最初に当たります。
