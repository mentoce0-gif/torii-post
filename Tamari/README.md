# たまり v0

残り時間そのものが身体になる、待合の窓。

iOS 17+ / SwiftUI / ローカル単機。ネットワークもアカウントも使わない。
仕様は `SPEC.md`、作業規律は `CLAUDE.md` が正。

---

## この段階で入っているもの（最初のマイルストーン）

- Xcode プロジェクト `Tamari`（アプリターゲット一つだけ）
- 画面は `PlaceView` 一枚。起動すると即 `gaze`
- 端末時刻から昼/夜が決まる場
  - 濡れた床（映り込み・水膜）
  - 遠い街灯（ナトリウム）
  - 閉まった何か（シャッター）
  - 不明な構造物（`integrity` で輪郭が欠ける）
  - 風で止まった紙（一枚ごとに微小に位置が違う）
  - 遠くを横切る光（出ない一枚のほうが多い）
- 眺めが 3 秒を越え、かつ場が暇なときだけ、低確率で `待ってる？`
- 待ちを置くと抽象形（時間身体）が現れ、現実時間で減衰する
- 0 でダイアログ無しに消え、`gaze` に戻る
- 数字・タブ・ナビ・リスト・人型・送信ボタン・人数表示なし
- 同期は `LocalPlaceStore` のスタブ（擬似的な先客が数体、時間で入れ替わる）

まだ無いもの（SPEC の続き）: 発言、構造物へ焼べる、Live Activity / Dynamic Island、StandBy Widget、環境音。

---

## 必要なもの

- macOS + **Xcode 16 以降**
  （プロジェクトは同期フォルダグループを使う `objectVersion = 77` 形式）
- iOS 17 以上のシミュレータ

署名は不要。シミュレータでそのまま動く。

## シミュレータで起動する（Xcode）

1. `Tamari/Tamari.xcodeproj` を Xcode で開く
2. スキーム `Tamari`、実行先に iPhone のシミュレータ（例: iPhone 16）を選ぶ
3. `⌘R`

起動すると、ホームもタブも出ず、いきなり場が出る。1 秒以内に一枚目が見える。

## シミュレータで起動する（コマンドライン）

```sh
cd Tamari

xcodebuild \
  -project Tamari.xcodeproj \
  -scheme Tamari \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -derivedDataPath build \
  build

xcrun simctl boot 'iPhone 16' || true
open -a Simulator
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/Tamari.app
xcrun simctl launch booted app.tamari.Tamari
```

`iPhone 16` の部分は `xcrun simctl list devices available` に出る名前へ読み替える。

---

## 起動後の確認手順

### 1. 眺める
何もせずに 8 秒過ごせる。ボタンは一つも無い。
場は 5 秒ごとに別の一枚に切り替わる（紙の位置、粒子、横切る光）。ループ動画ではない。

### 2. `待ってる？`
`gaze` が 3 秒を越えると抽選が始まり、当たると薄く出る。**低確率なので出ない回のほうが多い**（仕様どおり）。
出たら触れると `waitInput` に入る。

### 3. 待ちを置く（`待ってる？` が出ないとき）
場のどこでも **0.9 秒の長押し** で `waitInput` が開く。常設ボタンを置かないための隠し口。

`waitInput` では:
- 固定語（電車 / 湯 / 洗濯 / 誰か / 終わるまで）から一つ触れる
  （下線の欄に 8 字までの短い語を入れると、そちらが優先される）
- 右へ行くほど長い**目盛**を触れると、その場で置かれる。送信ボタンは無い
  目盛は左から 5 分 / 10 分 / 20 分 / 40 分 / 1 時間。画面には数字を出さない
- 置いた瞬間に Taptic が一回「コッ」（シミュレータでは鳴らない）
- 場の外側を触るか、下へスワイプすると閉じる

### 4. 減衰を見る
手前に自分の塊が出る。残り時間は数字でもゲージでも出ない。
時間が減るほど、幅が先に痩せ、濃い塊 → 輪郭 → 細い形 → 線 → 点 → 無し と変わる。
0 になると何の通知も振動もダイアログも無く消え、`gaze` に戻る。

### 5. 消滅まで待たずに確かめる（DEBUG のみ）
5 分待たずに減衰と消滅を見るには、起動引数で時間を早送りできる。UI には出ない。

```sh
xcrun simctl launch booted app.tamari.Tamari -TamariTimeScale 60
```

Xcode から実行する場合は、スキームの Run → Arguments Passed On Launch に
`-TamariTimeScale` と `60` を足す。

`60` なら 5 分の待ちが 5 秒で消える。1〜600 に丸められ、Release ビルドでは無視される。

### 6. 昼/夜
場の色は端末時刻だけで決まる（位置情報も天気も使わない）。
夜は黒緑とナトリウム灯、昼は湿った灰。切り替わりは 4:30〜8:00 と 16:00〜20:00。
確かめるには Mac 側の時計を動かす（シミュレータは Mac の時刻を使う）。
`Daylight.value(hour:)` を直接呼べば、プレビューでも任意の時刻の場を見られる。

### 7. 出てはいけないもの
- 現在人数、残り mm:ss、Send ボタン、人型、タブ、スクロールする発言履歴
- 「参加しました」「在室中」などの文言

出ていたら不合格。消す。

---

## ファイル

```
Tamari/
  App/TamariApp.swift          起動。PlaceView 一枚だけ
  Place/PlaceView.swift        画面と時計ループ、「待ってる？」の抽選
  Place/PlaceRenderer.swift    場の描画（SwiftUI Canvas 一本）
  Place/TimeBodyView.swift     時間身体の描画（人型禁止）
  Place/StructureView.swift    不明な構造物
  Place/PlaceModel.swift       Phase / TimeBody / PlaceSnapshot ほか
  Place/LocalPlaceStore.swift  同期スタブ。差し替える境目はここだけ
  Place/Daylight.swift         端末時刻 → 昼/夜
  Session/SessionStore.swift   phase と自分の残り時間
  Wait/WaitInputOverlay.swift  何を / どれだけ
  Design/Tokens.swift          色と、場に出してよい語
```

## 実装メモ

- 描画は `Canvas` 一本。Sprite / Metal / RealityKit へ散らさない。
- 毎フレーム揺らさない。`PlaceSnapshot.cut`（5 秒ごと）が変わったときだけ、紙・粒子・形の揺れが別の値になる。
  減衰そのものは連続で、画面は `gaze` で 2 回/秒、`seated` で 5 回/秒だけ描き直す。
- 乱数は種から決定的に作る（`SeededRandom`）。同じ一枚は同じ絵になる。
- `LocalPlaceStore` の先客は擬似データで、人数として画面に出ない。密度が上がると
  個々の形のコントラストが下がる（希薄化）だけ。
- 時間の目盛に数字を書かないのは、SPEC の「確定後、数字を場に残さない」と
  「数字で場を説明しない」を、入力面にも通したため。値そのものは SPEC どおり
  5 / 10 / 20 / 40 / 60 分。
