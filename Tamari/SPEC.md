# たまり MVP SPEC（Claude Code 着手用）

## 0. 一言
残り時間そのものが身体になる、待合の窓。

英語: A waiting place whose bodies are leftover time.

## 1. プロダクト境界

### これである
- 現実の待ち時間を在席として置く
- 時間切れで身体が消える
- 発言すると自分の残り時間を消費する
- 人数が増えると密度は上がらず希薄になる
- 広場は在席者の時間でわずかに維持される
- 眺める人は身体を持たず、明るさになる
- 履歴・フィード・過去ログなし
- 視覚は動画ループではなく静止画の系列
- 一瞥で完結。FOMO を作らない

### これでない
SNS / チャットルーム / メタバース / アバター広場 / ゲーム

## 2. MVP 範囲

### 入れる（v0）
- 単一の広場（ワールド選択なし）
- 眺め
- 待ちを置いて在席
- 抽象形状の時間身体（自分のみ描画を強調しすぎない）
- 減衰と時間切れ消滅
- 短文を場に置く（誰の発言か結ばない）
- 構造物へ時間を焼べる
- Lock Screen Live Activity（形と明るさだけ）
- ローカル時刻に合わせた昼/夜の場

### 入れない（v0）
- アカウント
- サーバー同期の本番実装（プロトコルだけ空ける）
- 複数広場
- 通知で呼び戻す
- 音声チャット
- AR / 3D カメラ移動
- ショップ、装飾、色選択

### 同期スタブ
`PlaceSnapshot` をローカルで擬似更新する。
後で実サーバーに差し替える境目だけ作る。

## 3. 情報設計（状態は3つだけ）

```
gaze        眺め。デフォルト。身体なし
waitInput   何を待つ／どれだけ、の短い重ね
seated      在席。時間身体あり。減衰する
```

アプリ起動 = ただちに `gaze` の場。ホーム画面なし。

## 4. データモデル（最小）

```swift
enum Phase { case gaze, waitInput, seated }

struct WaitSeed {
    var subject: WaitSubject   // train, bath, laundry, someone, untilDone, custom(String)
    var duration: TimeInterval // 現実の待ち。UIに常時数字を出さない
}

struct TimeBody {
    var id: UUID               // 内部用。画面に出さない
    var remaining: TimeInterval
    var initial: TimeInterval
    var isLocalUser: Bool
}

struct Utterance {
    var text: String           // 短い
    var appearedAt: Date
    var lifetime: TimeInterval // 数秒〜十数秒
    var anchor: SIMD2<Float>   // 場の正規化座標。発言者IDを持たない
}

struct Structure {
    var integrity: Double      // 0...1 崩れ
}

struct PlaceSnapshot {
    var generatedAt: Date
    var daylight: Double       // 0 night ... 1 day（端末時刻から）
    var brightness: Double     // 眺め人数の抽象。人数数字は持たないでも可だが画面に出さない
    var bodies: [TimeBody]
    var utterances: [Utterance]
    var structure: Structure
    var paperOffset: CGPoint   // 静止画系列用の微小差
}
```

禁止フィールドを画面に出さない: username, avatarURL, unread, memberCount label.

## 5. 時間ルール

### 在席
- `remaining` は現実時間で減る
- 0 でその身体は削除。コピーなし。`gaze` へ戻る（自分の場合）

### 発言の課税
打鍵課金禁止（日本語IMEが壊れる）。

1. 在席中は常に現実減衰
2. 入力面を開いている間、減衰係数をわずかに上げる（言語非依存）
3. 確定時のみ追加税 = 場に出る `String.count`（表示書記素）× 2〜4秒
4. 未確定ローマ字・変換中は非課税
5. 確定前削除は追加税なし
6. 送信ボタンなし。入力面を閉じたら確定。空文字なら確定しない

### 焼べる
長押し中:
- 自分の remaining を毎秒一定量減らす
- structure.integrity をごく小さく戻す
- 指を離したら停止
- 貢献ログを残さない
- remaining が線相当（例: 初期の 8% 未満）なら焼べ不可

### 希薄化
bodies が多いほど:
- 個々の形のコントラストを下げる
- 発言が重なると欠ける（新しい発言が古い欄に整列しない）
人数ラベルは出さない。

## 6. 視覚

### 場
夜の駅前 / 港の待合 / 古い公共施設 / 深夜SA / 雨上がり広場の中間。
具体施設名を描かない。

必須モチーフ（抽象）:
- 濡れた床
- 遠い街灯
- 閉まった何か
- 風で止まった紙
- 遠くを横切る光（常時アニメにしない。フレーム差で出す）
- 不明な構造物が一つ

### 身体
人型禁止。顔・服・色選択・エモート禁止。
remaining / initial で:
- 大きさ
- 輪郭の曖昧さ
- 透明度
- 重さ（にじみ）
- 揺れ（静止画差。毎フレームゆらすな）

他人の形をヒットテストしない。選択操作を実装しない。

### 静止画系列
3〜8秒のループ動画にしない。
`PlaceSnapshot.generatedAt` と `paperOffset` が変わるたび、別の一枚。
StandBy / Lock Screen も同様に数分でカット切替。

## 7. 画面仕様

### PlaceView
全画面。セーフエリアにコントロールバーを置かない。
下端に常設ボタンを置かない。

`待ってる？` は:
- gaze が 3 秒以上
- かつ場が「暇」（bodies が少ない）ときだけ低確率で出す
- 出せない日を許容

### waitInput
場を背景に残す薄い重ね。
`何を？` + 固定語（電車 / 湯 / 洗濯 / 誰か / 終わるまで）+ 任意のごく短い語（上限 8 字）
時間はホイールか短いプリセット（5 / 10 / 20 / 40 / 60 分）。
確定後、数字を場に残さない。Taptic 一回「コッ」。

### 発言
自分の身体を長押しでのみ入力面。
プレースホルダなし。Send なし。
確定後、場の街灯付近などに `Utterance` を描く。発言者線を引かない。

### 焼べ
構造物の長押しでのみ。Taptic は柔らかい連続。報酬パターンにしない。

### 消滅
濃い塊 → 輪郭 → 細い形 → 線 → 点 → 無し
最後の数秒だけ Spatial / 環境音を遠ざける。
「時間になりました」禁止。振動で終了通知しない。

## 8. iOS 各面

| 面 | v0 |
|---|---|
| App 本体 | PlaceView のみ |
| Live Activity | 形の減衰 + 場の明るさ。数字・文言ステータス禁止 |
| Dynamic Island | seated のみ。細い形 |
| Lock Screen / Always-On | 今夜の一枚。文字なし |
| StandBy Widget | 数分ごとに別静止画 |
| Push | 初期オフ。呼び戻しに使うな |

Taptic を使ってよいイベント:
- 在席開始: 一回コッ
- 焼べ中: 柔らかい連続
- （将来）誰かから時間が回った: 一脈
使ってはいけない: 消滅、新着、いいね相当

## 9. ファイル骨格（推奨）

```
Tamari/
  App/TamariApp.swift
  Place/PlaceView.swift
  Place/PlaceRenderer.swift      // 場の描画。Sprite/Canvas/Metalどれか一つに固定
  Place/TimeBodyView.swift
  Place/StructureView.swift
  Place/UtteranceLayer.swift
  Session/SessionStore.swift     // phase, local remaining
  Place/LocalPlaceStore.swift    // snapshot stub
  Wait/WaitInputOverlay.swift
  Speak/SpeakOverlay.swift
  Activity/TamariActivity.swift
  Widget/TamariStandByWidget.swift
  Audio/PlaceAmbience.swift
  Design/Tokens.swift
```

描画は最初 `SwiftUI Canvas` でよい。Unity / RealityKit に逃げるな（3D酔い・メタバース化）。

## 10. デザイントークン

- 色: 低彩度。黒緑・湿った灰・遠いナトリウム灯
- 文字: 場に出す発言のみ。UIコピーは最小（待ってる？ / 何を？）
- 禁止コピー: 参加しました / 入室 / 在席中 / 現在n人 / また来てね / 投稿する
- アニメ: 長時間ループ禁止。カットと減衰だけ

## 11. Claude Code への最初のプロンプト（このまま投げてよい）

```
SPEC.md と CLAUDE.md に従い、iOS 17+ SwiftUI で「たまり」v0 を作れ。

最初のマイルストーン:
- 新規 Xcode プロジェクト Tamari
- PlaceView 一枚で起動
- 端末時刻で昼/夜が変わる場（濡れた床、街灯、構造物、紙）
- 3秒後に低確率で「待ってる？」
- 待ち時間を置くと抽象形が現れ、リアルタイム減衰
- 0 で消滅し gaze に戻る
- 数字・タブ・リストを出すな
- ローカル単機。ネットワーク不要

実装後、シミュレータで起動確認手順を README に書け。
```

## 12. 受け入れテスト（v0）

合格:
- [ ] 起動して 1 秒以内に場が見える
- [ ] ホームやタブが無い
- [ ] 眺めだけで 8 秒過ごして終われる
- [ ] 在席すると塊があり、分表示が無い
- [ ] 時間切れでダイアログ無く消える
- [ ] 他人の形をタップしても何も選ばれない
- [ ] 発言が吹き出しログにならない
- [ ] Live Activity に残り mm:ss が出ない

不合格（出たら削除）:
- 現在人数
- Send ボタン
- 人型
- 「参加」
- スクロールできる発言履歴
