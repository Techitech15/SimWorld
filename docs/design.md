<!--
  The original design document, as given at the start of the project.

  It is kept here verbatim - no corrections, no notes, no updates - because it
  is the thing the rest of the repository argues with. README cites its chapter
  numbers in 28 places; every one of those is now checkable against the source
  rather than against a memory of it.

  Where the implementation departs from this document, the departure and its
  reason are recorded in README (「設計ドキュメントからの差分」and the phase
  table), never by editing this file. A specification that is quietly edited to
  match the code stops being a specification.
-->

# SimWorld 設計方針
> RimWorld風2Dブラウザ入植地シミュレーション。本ドキュメントは壁打ちで確定済みの方針をもとに、実装レベルの設計を定める。
## 目次
1. 概要と設計原則
2. 技術スタックと採用理由
3. アーキテクチャ
4. データモデル
5. 時間モデル
6. ジョブシステム詳細
7. 経路探索
8. セーブ／ロード
9. MVP機能リスト
10. 実装順序
11. フェーズ2以降のロードマップ
12. ドット絵アセット仕様
---
## 1. 概要と設計原則
SimWorldは、ファンタジー世界観の入植地シミュレーションである。プレイヤーは3人の入植者を管理し、伐採・採掘・農作・建築・運搬の生産チェーンを回して生存を続けさせる。将来的にはマナ結晶を燃料とする魔力インフラが自動化・防衛の土台になるが、それはフェーズ2以降の話であり、MVPには一切含めない。
守るべき設計原則は3つ。
1. **データとロジックを分離する。** エンティティ（入植者・建築・アイテム・ジョブ）は振る舞いを持たないプレーンなデータとし、ロジックはすべて外部関数に置く。理由: これを守らないとセーブがJSON化だけで完結しなくなり、後から矯正するコストが破滅的に高い。
2. **シミュレーションとUIの再描画を分離する。** ゲーム状態ストアを唯一の真実源とし、PixiJSとReactはどちらもそれをsubscribeするだけで、互いのループに干渉しない。理由: Reactの再レンダリングがゲームループのfpsを揺らす設計は、入植者が増えた瞬間に破綻する。
3. **MVPの範囲を増やさない。** 最適化パズル（生産チェーン）が気持ちよく回ることを最優先し、物語生成・防衛は後回しにする。理由: 土台が壊れている状態で機能を積み増しても、後で土台からやり直すことになる。
## 2. 技術スタックと採用理由
| 採用 | 理由（却下した代替とその理由） |
| --- | --- |
| **Vite** | 開発サーバの起動・HMRが速く、TypeScriptをネイティブに扱える。Webpackは同等のことをするのに設定コストが高いため却下。 |
| **TypeScript** | データモデルを型で強制できる。純粋データ設計（4章）はJSでは実行時まで壊れに気づけないため必須。 |
| **PixiJS** | WebGL経由のスプライトバッチ描画が得意で、60×60タイル＋複数エンティティの2D描画に十分な性能を持つ。生のCanvas API直書きはスプライト数が増えると即座に重くなるため却下。Phaser等の統合ゲームエンジンは、シーン管理・入力・UIまで自前で抱え込む設計思想がReactとの責務分離（3章）と衝突するため却下。 |
| **React** | RimWorld系はUIがゲームの半分を占める（入植者タブ・仕事優先度表・資源一覧・健康画面）。宣言的UIと豊富なコンポーネント資産で複雑な表形式UIを素早く組める。Vue/Svelteも技術的には十分だが、この種の管理UIでの採用実績・知見の蓄積はReactが厚いため優先。 |
| **状態ストア（zustand想定）** | サブスクライブ粒度を選べる軽量ストアで、PixiJS側もReact側も同じストアを購読できる。Reduxはボイラープレートがこの規模のMVPに対して過剰なため却下。自前Pub/Subの完全自作は車輪の再発明でバグの温床になるため却下。 |
## 3. アーキテクチャ
4層に分離し、依存の向きを一方向に固定する。
```
[Simulation層] --tick書き込み--> [State Store (GameState)] <--購読のみ-- [Rendering層 (PixiJS)]
                                        ^
                                        |--アクション書き込み（優先度変更・建築指定など）
                                        |
                                [UI層 (React)] --購読のみ（表示用）--> (Storeから読む)
```
- **State Store**: `GameState`（4章）を保持する唯一の真実源。PixiJSもReactもここ以外からゲームの状態を読まない。ストアへの書き込みは (1) Simulation層のtick処理、(2) UI層が呼び出す「アクション関数」（例: `setJobPriority(colonistId, jobType, priority)`、`placeBuildingBlueprint(...)`）の2経路に限定する。UI層のアクション関数はSimulation層を経由せずStoreへ直接書き込むが、その結果（例: 新しいブループリント）は次のtickでJobGenerator（6章）が拾って処理する。理由: 書き込み経路をこの2つに絞らないと、PixiJS側とReact側で状態が二重管理されズレる。
- **Simulation層**: 固定tickでGameStateを次の状態に進める純粋関数群（5章・6章・7章）。DOMにもPixiにも依存しない。理由: ロジックを描画から切り離すことで、将来ヘッドレステスト（画面なしでシミュレーションだけ検証）が可能になる。
- **Rendering層（PixiJS）**: `requestAnimationFrame`ループで動き、ストアをsubscribeしてスプライトの位置・テクスチャを同期する。ストアへは一切書き込まない（クリック等の入力はUI層/入力ハンドラを経由してアクション関数を呼ぶ）。
- **UI層（React）**: `useSyncExternalStore`相当のフックでストアの必要な部分だけをselector購読する（例: 入植者パネルは選択中の1人分のみ購読）。理由: GameState全体をpropsで渡すと、ticks更新のたびに無関係なコンポーネントまで再レンダリングされる。
**Reactの再レンダリングとゲームループの分離方針**: Simulation層のtickは描画フレームレートと非同期に進む（5章）。PixiJSはRAFで毎フレーム描画するが、Reactはストアの変更通知があったコンポーネントのみ、かつ変更のあったselectorの値が実際に変わったときのみ再レンダリングする。ゲームループがReactのcommitフェーズを待つことは一切ない。
## 4. データモデル
全型はプレーンなデータであり、メソッドを持たない。クラスは使わない。相互参照はオブジェクト参照ではなくID（`string`）で行う。理由: ID参照ならJSON化しても壊れないが、オブジェクト参照は循環構造を生みJSON.stringifyできない。
```typescript
type TileId = string;       // `${x},${y}`
type ColonistId = string;
type BuildingId = string;
type ItemId = string;
type JobId = string;
type ZoneId = string;
type Vector2 = { x: number; y: number };
type TerrainType = 'grass' | 'forest' | 'stone';
interface Tile {
  id: TileId;
  x: number;
  y: number;
  terrain: TerrainType;
  walkable: boolean;        // stoneは採掘前walkable=false等、地形変更で更新される
  buildingId: BuildingId | null;
  itemIds: ItemId[];        // 地面に落ちているアイテム
}
type ResourceType = 'wood' | 'stone' | 'food';
interface Item {
  id: ItemId;
  type: ResourceType;
  quantity: number;
  position: Vector2;        // マップ上の座標。ストレージゾーン内でも実座標を持つ
  reservedByJobId: JobId | null;
}
type NeedType = 'hunger' | 'sleep';
interface ColonistNeeds {
  hunger: number;   // 0(満腹)〜100(餓死寸前) の直線減衰値
  sleep: number;     // 0(覚醒)〜100(限界) の直線減衰値
}
interface Colonist {
  id: ColonistId;
  name: string;
  position: Vector2;
  path: Vector2[] | null;        // 経路キャッシュ（7章）
  pathTargetTileId: TileId | null;
  needs: ColonistNeeds;
  currentJobId: JobId | null;
}
type BuildingType = 'wall' | 'floor' | 'door' | 'bed' | 'farmPlot' | 'storageZoneMarker';
interface Building {
  id: BuildingId;
  type: BuildingType;
  tileId: TileId;
  isBlueprint: boolean;          // 建築予定（未完成）か完成物か
  hpCurrent: number;
  hpMax: number;
  requiredResources: { type: ResourceType; quantity: number }[];  // isBlueprint時に必要な残り資材
}
type JobType = 'chop' | 'mine' | 'farm' | 'build' | 'haul';
type JobState = 'pending' | 'reserved' | 'active' | 'completed' | 'failed' | 'cancelled';
interface Job {
  id: JobId;
  type: JobType;
  priority: number;              // 1(最高)〜3(最低)。詳細は6章
  targetTileId: TileId | null;
  targetEntityId: string | null; // BuildingId | ItemId。ジョブ種別により意味が変わる
  state: JobState;
  reservedBy: ColonistId | null;
  createdAtTick: number;
  retryCount: number;
  cooldownUntilTick: number | null;
}
interface Zone {
  id: ZoneId;
  type: 'storage';
  tileIds: TileId[];
}
interface GameState {
  tick: number;
  speed: 0 | 1 | 3;               // 停止/1倍/3倍
  tiles: Record<TileId, Tile>;
  colonists: Record<ColonistId, Colonist>;
  buildings: Record<BuildingId, Building>;
  items: Record<ItemId, Item>;
  jobs: Record<JobId, Job>;
  zones: Record<ZoneId, Zone>;
}
```
補足: 経路（`path`）や予約状態（`reservedBy`）もGameStateの一部として保存対象に含める。理由: セーブ後にロードした瞬間、全員が経路探索をやり直すのは無駄が大きく、予約が消えると2人が同じ木に向かう事故（6章）が再発する可能性があるため、状態ごと保存する。
## 5. 時間モデル
- **tick長**: 1 tick = 200ms（5 tick/秒）を基準周波数とする。理由: A*やジョブ候補フィルタを毎フレーム（60fps）ではなくtick単位で走らせることで、経路探索コスト（7章）を安全な頻度に抑えられる。
- **1日の長さ**: 1日 = 3,000 tick。1倍速では 3,000 tick ÷ 5 tick/秒 = 600秒（10分）で1日が経過する。
- **速度倍率**:
  - 停止（0倍）: tickカウンタを進めない。GameStateへの書き込みは一切発生しない。
  - 1倍: 1フレーム相当の実時間ごとに1 tick処理。
  - 3倍: 同じ実時間内に3 tick処理（tick長そのものは変えず、処理回数を増やす）。理由: tick長を可変にすると経路キャッシュや予約のタイムアウト計算（6章）がずれるため、tick長固定・処理回数可変の方式を採る。
- **pause時の扱い**: Simulation層のtickループを完全停止する。PixiJSのRAF描画ループ自体は止めない（カメラ操作のため）が、GameStateが変化しないのでスプライトは静止する。Reactの操作（優先度変更や建築指定）はpause中も受け付け、次にtickが進んだ瞬間に反映される。
**RimWorld準拠の簡略化**: RimWorld wiki「Needs」によると、Food（Saturation）とRestは人間・動物に共通する基本ニーズで、しきい値マーカーを持たず燃料計のように直線的に減少する（Recreation・Beauty・Comfort等の人間専用ニーズは閾値でmood thoughtを発生させるが、Food/Restにはその仕組みがない）。本作のMVPでは、この「空腹」「睡眠」の2ニーズのみを実装し、RimWorld同様に直線減衰＋しきい値到達で自動的に食事・睡眠行動へ遷移させる。mood計算・thought生成は行わない（フェーズ3で導入、11章）。
## 6. ジョブシステム詳細
素朴な実装（各Colonistが毎tick「一番近い未処理の木」を探して直接向かう）は、2人が同じ木に向かって片方が無駄足になる、運搬したアイテムをまた別のColonistが運び出す無限ループ、といった事故を起こす。原因は「候補を選ぶ」と「実際に確保する」の間に競合防止がないことなので、**予約（reservation）を最初からジョブのライフサイクルに組み込む**。
### RimWorld準拠の簡略化
RimWorld wiki「Work」によると、実際の優先度システムは次の通り。
- 標準モードでは「割り当て済み/未割り当て」のみで、Work Menu上で左にある仕事ほど優先。マニュアルモードでは各仕事タイプに1〜4の優先度を手動設定できる。
- **「同一優先度の仕事は、次の優先度に移る前に全て終わらせる」**。距離やマップ上の位置は一切考慮しない（真横の木より地図の反対側の木を先に処理することもある）。
本作ではこれを次のように簡略化する。
- 優先度は**1〜3の3段階**（RimWorldの1〜4より単純化。5仕事×3人規模のMVPでは4段階の解像度は過剰）。
- 同一優先度内の候補選択は**距離最短のジョブを優先**する（RimWorldの「効率無視」方式は採用しない）。理由: MVPは3人・60×60という小規模マップであり、非効率な移動が目立ちやすい。距離考慮のコストは3人規模なら無視できる。
### 型定義
```typescript
interface Reservation {
  entityId: string;      // TileId | ItemId | BuildingId（予約対象）
  jobId: JobId;
  colonistId: ColonistId;
}
// GameStateに追加するフィールド
interface GameState {
  // ...4章の定義に加えて
  reservations: Record<string /* entityId */, Reservation>;
}
```
`Job`型は4章で定義済み（`state: JobState`、`reservedBy`、`retryCount`、`cooldownUntilTick`を含む）。
### ライフサイクル
1. **ジョブキュー生成（JobGenerator）**: 毎tick、マップ上の「伐採指定された木」「採掘指定タイル」「未処理の運搬対象アイテム」「未完成の建築ブループリント」を走査し、対応する`pending`状態のJobを生成する。生成済みのエンティティは`targetEntityId → JobId`の逆引きインデックスで管理し、同じ対象に対して重複してJobを生成しない。
2. **候補フィルタ（CandidateFilter）**: 暇な（`currentJobId === null`）Colonistごとに、`pending`なJobの中から (a) 到達可能、(b) `reservations`に対象エンティティが存在しない、(c) 優先度が有効、(d) `cooldownUntilTick`を過ぎている、の4条件を満たすものを抽出し、優先度→距離の順でソートして先頭を選ぶ。
3. **予約（Reserve）**: 選ばれたJobについて、対象エンティティ（木・鉱石タイル・アイテム・建築フレーム）を`reservations`に登録し、Jobの`state`を`reserved`に、`reservedBy`をColonistIdに設定する。**運搬ジョブは搬出元アイテムと搬入先ゾーンの両方を予約する**（ゾーン側は「残り受け入れ可能容量」に対する予約）。理由: 搬入先を予約しないと、満杯間近のゾーンに複数のColonistが同時に運び込もうとして溢れる、あるいは置いた直後に別のColonistがまた運び出す無限ループが起きる。
4. **実行（Execute）**: `state`を`active`にし、Colonistの`currentJobId`にセットする。Job種別ごとの純粋関数（`ColonistとGameStateを受け取り、次のGameStateを返す`形）が、移動（7章の経路キャッシュを使用）→作業アニメーション→資源の増減、を1tickずつ進める。
5. **解放（Release）**: 完了時は対象エンティティを`reservations`から削除し、`state`を`completed`にしてJobキューから除去、Colonistの`currentJobId`を`null`に戻す。**失敗時**（経路が地形変更で完全に塞がれた等）は`retryCount`をインクリメントし、`cooldownUntilTick = tick + COOLDOWN_TICKS`（例: 50 tick）を設定して`pending`に戻す。`retryCount`が閾値（例: 3回）を超えたJobは`failed`として破棄し、ログに残す。理由: 無限リトライを防がないと、到達不能なジョブに毎tick候補フィルタの計算コストを吸われ続ける。
この5段階（生成→候補フィルタ→予約→実行→解放）が唯一のJob状態遷移経路であり、これ以外の経路でColonistがJobに触れることはない。
## 7. 経路探索
全Colonistが毎フレームA*を走らせると、60×60マスのグリッドでは即座にフレーム落ちする。**再計算のトリガーを「目的地変更時」と「地形変更時」の2つだけに限定する**ことで破綻を防ぐ。
### グリッドA*
- 60×60タイルのグリッド上で4方向移動（斜め移動はMVP範囲外、地形3種の見た目とコスト計算をシンプルに保つため）。
- ヒューリスティックはマンハッタン距離。
- コストは地形により変化させない（MVPでは草地・森・岩の移動コストは一律。森の減速等はスコープ外）。
### 経路キャッシュ
- Colonistは`path: Vector2[] | null`と`pathTargetTileId: TileId | null`を保持する（4章）。
- 新しい移動先が指定されたとき（＝Jobの予約が成立した瞬間、6章）だけA*を1回実行し、結果を`path`にキャッシュする。
- 以降のtickでは、Colonistは`path`の先頭から順に1マスずつ進むだけで、目的地が変わらない限り再計算しない。
- 複数Colonist間で経路そのものを共有するキャッシュ（同じ始点終点の経路を使い回す）は実装しない。理由: 3人規模ではA*1回のコストがそもそも小さく、共有キャッシュの整合性管理コストが見合わない。
### 地形変更時の無効化
- 建築（壁・扉の設置/破壊）や伐採・採掘で`Tile.walkable`が変化した場合、そのタイルを経路の一部として使っている全Colonistの`path`を無効化し、次tickで再計算させる必要がある。
- 全Colonistの`path`を毎回スキャンするのは非効率なので、**PathIndex**（`Record<TileId, ColonistId[]>`、「このタイルを現在の経路に含んでいるColonistの一覧」への逆引きインデックス）をGameStateとは別に（非セーブ対象の派生キャッシュとして）保持する。
- 地形変更時は、変更されたタイル自身についてPathIndexを引き、該当するColonistのみ`path = null`にして次tickの候補フィルタ／実行フェーズで再計算をトリガーする。理由: O(全Colonist)ではなくO(該当Colonistのみ)に抑えるため。
- 無効化範囲は「変更されたタイルそのもの」で十分とする。**隣接タイルまで広げない**。理由: 経路は明示的にそのタイルを通過する場合のみPathIndexに登録されており、隣接タイルの変化がその経路自体を壊すことはない（壁の設置は設置先タイルのwalkableのみを変える）。
## 8. セーブ／ロード
4章の原則（エンティティは純粋データ、ロジックは外部関数）を守っている限り、`GameState`はそのまま`JSON.stringify`できる。クラスのインスタンスやDate、Map/Setのような非JSON型は使わず、`Record<Id, T>`と配列とプリミティブのみで構成する。
### セーブファイル構造
```typescript
interface SaveFile {
  schemaVersion: number;   // マイグレーション判定用
  savedAtTick: number;
  savedAtRealTime: string; // ISO8601文字列（Date型は保持しない）
  state: GameState;
}
```
- `reservations`や`PathIndex`のうち、`PathIndex`は派生データ（7章）なのでセーブに含めない。ロード後、最初のtickで各Colonistの`path`から再構築する。
- `reservations`はセーブに含める（6章の補足の通り、ロード直後に予約が消えると事故が再発しうるため）。
### バージョニング方針
- `schemaVersion`を1から始め、`GameState`の型を破壊的に変更するたびにインクリメントする。
- ロード時は`schemaVersion`を見て、`migrations: Record<number, (old: unknown) => unknown>`のようなマイグレーション関数チェーンを、保存時のバージョンから最新バージョンまで順に適用する。
- 適用できないほど古い（マイグレーション関数が存在しない）セーブは、ロードを拒否してユーザーに警告を表示する。理由: 中途半端に読み込んで壊れた状態で進行させるより、拒否した方が安全。
### 保存先・タイミング
- MVPでは手動セーブ／ロードのみ（オートセーブは範囲外）。
- 保存先はIndexedDB。理由: `items`や`jobs`が増えるとlocalStorageの5MB上限に近づきうるため、余裕のあるIndexedDBを既定にする。
## 9. MVP機能リスト
### 含むもの
- マップ: 60×60タイル、1枚のみ
- 地形: 草地／森／岩の3種
- 入植者: 3人
- ニーズ: 空腹・睡眠の2種のみ（直線減衰、5章）
- 仕事: 伐採・採掘・農作・建築・運搬の5種（6章のジョブシステム経由）
- 建築: 壁・床・扉・ベッド・畑・貯蔵ゾーンの6種
- 資源: 木材・石材・食料の3種
- 時間: 1日サイクル、速度は停止／1倍／3倍（5章）
- 経路探索: グリッドA*＋キャッシュ（7章）
- セーブ／ロード: 手動、IndexedDB（8章）
- UI: 入植者タブ、仕事優先度表、資源一覧（React、3章）
- 勝敗判定なし。生存が続くことがゴール
### 含まないもの（フェーズ2以降）
- 魔力インフラ（マナ結晶・魔導炉・魔導装置）全般
- 魔法・戦闘・襲撃・防衛建築
- 気分（mood）・精神崩壊（メンタルブレイク）
- スキル・性格特性・関係性（物語生成要素）
- 健康画面／怪我／病気
- 天候・季節・気温管理
- 複数マップ・キャラバン・貿易・研究ツリー
- 空腹・睡眠以外のニーズ（娯楽・快適・美しさ・屋内外等）
MVPの範囲はこれ以上広げない。フェーズ2以降で追加される要素は11章に記す。
## 10. 実装順序
土台（状態設計・描画・経路探索）を先に固め、ジョブシステムはその上に積む。ジョブシステムをUIより先に動かし切ってから、Reactの管理画面を被せる順序にする。理由: 予約機構（6章）はUIの見た目より先に正しく動く必要があり、後から差し込むのが最も難しい部分だから。
- **Week 1: 基盤とデータ設計。** Vite+TS+PixiJS+Reactのプロジェクト雛形、`GameState`の型定義（4章）、状態ストアの導入、空のセーブ／ロード（8章）。
  **動いたと言える条件**: 空の`GameState`を`JSON.stringify`→`JSON.parse`で往復させても内容が一致する。
- **Week 2: マップと描画。** タイルマップ生成（草地／森／岩）、PixiJSでの描画、カメラのパン／ズーム。
  **動いたと言える条件**: 60×60マップがブラウザ上に表示され、マウス操作でパン・ズームできる。
- **Week 3: 経路探索と手動移動。** グリッドA*、経路キャッシュ、PathIndex（7章）。Jobなしでクリック移動のみ実装。
  **動いたと言える条件**: マップ上をクリックすると、Colonistが壁や森を迂回して目的地に到達する。
- **Week 4: ジョブシステムの中核。** 伐採・採掘の2ジョブと予約機構（6章）をフルスコープで実装。
  **動いたと言える条件**: 3人の入植者に同時に大量の伐採指定を出しても、2人が同じ木に向かって片方が無駄足になる事故が起きない。
- **Week 5: ニーズと生存ループ。** 空腹・睡眠（5章）、ベッド・畑・貯蔵ゾーン、農作・運搬ジョブ。
  **動いたと言える条件**: プレイヤーが何も操作しなくても、入植者が自律的に食事・睡眠を取り、餓死しない。
- **Week 6: 建築とReact UI。** 建築ジョブ（壁・床・扉）、入植者タブ・仕事優先度表・資源一覧（React）。
  **動いたと言える条件**: プレイヤーがReact UIから壁の設置を指示すると、入植者が資材を運搬して建築を完了する。
- **Week 7: 時間モデルと通しプレイ。** 速度切替・一時停止（5章）、バランス調整、既知バグの修正。
  **動いたと言える条件**: 何も操作せず3倍速で放置しても、複数日にわたり誰も餓死・行き詰まりせずに生産チェーンが回り続ける。
## 11. フェーズ2以降のロードマップ
コアの魅力の優先順（1. 最適化パズル、2. 物語生成、3. 防衛と危機管理）に対応させ、魔力インフラ→物語生成→防衛の順で積む。**魔力インフラはMVPには一切登場しない**（9章）。
### フェーズ2: 魔力インフラ
最適化パズル（コアの魅力1）を発展させる段階。既存の生産チェーンに「電力」に相当する魔力の生産・分配という新しい制約を追加する。
- 新規アイテム: `ManaCrystal`（マナ結晶、`ResourceType`に追加）
- 新規建築: `ManaFurnace`（魔導炉、マナ結晶を消費してマナを産出）、`ManaConsumer`系（照明・自動採掘・温度管理・自動防衛タレットの前提となる魔力消費建築の共通インターフェース）
- 新規の型: `ManaNetwork`（隣接する魔力対応建築をグラフとして接続する送電網相当の構造）、`ManaGrid`（ネットワークごとの供給・消費バランス）
- 既存`Building`型への拡張: `manaConsumption`・`manaOutput`フィールドの追加
- 新規ジョブ種別: マナ結晶の採掘（既存の`mine`ジョブの対象拡張で対応可能か検討）
### フェーズ3: 物語生成
コアの魅力2。入植者に性格・関係・メンタルブレイクを持たせ、ドラマを生む。
- `Colonist`型への拡張: `traits: Trait[]`（性格特性）、`mood: number`、`thoughts: Thought[]`
- 新規の型: `Relationship`（`colonistIdA × colonistIdB → affinity`のペア関係）、`MentalState`（moodのしきい値に応じて遷移するステートマシン。RimWorldの「Mental break」に相当）
- ニーズの拡張: 5章で対象外とした娯楽・快適・美しさ等の追加を検討（RimWorld wikiの「Needs」に挙がる人間専用ニーズ群が参考になる）
### フェーズ4: 防衛と危機管理
コアの魅力3。1と2に負荷をかける装置として最後に追加する。
- 新規イベント: `RaidEvent`（襲撃）
- 新規状態: `CombatState`（Colonistの戦闘関連ステータス）
- 新規建築: 防衛タレット（魔力消費型タレットはフェーズ2の`ManaConsumer`に依存するため、フェーズ2完了後でないと成立しない）
依存関係として、フェーズ4の魔力式防衛設備はフェーズ2の魔力インフラを前提にする。この依存順を崩さない。
## 12. ドット絵アセット仕様
Codexへドット絵生成を依頼する際にそのまま渡せる仕様。**MVPに必要なものだけ**を挙げる（フェーズ2以降の魔力インフラ系スプライトは対象外）。
### タイルサイズ
- **32×32px**を推奨。理由: RimWorld系のキャラクター・小物の視認性と、PixiJSのテクスチャアトラス／スプライトバッチ効率のバランスが良い解像度。1タイル=1テクスチャの単純な対応にできる。
- キャラクター（入植者）も32×32のセルに収める（はみ出す装飾は将来検討、MVPでは不要）。
### パレット方針
- 各スプライトにつき**32色以内**の制限パレットを使う。理由: ファンタジー世界観の統一感を出しつつ、後で色数を絞ったパレット差し替え（染色・季節変化等）をしやすくするため。
- 地形3種は明度差で判別しやすい配色にする（草地=中明度の緑、森=低明度の濃緑、岩=中〜低明度のグレー）。理由: 60×60の見下ろし視点でとっさに地形を識別できる必要がある。
- 建築物は地形より明るい/彩度の高い配色にして、地形の上に乗っていることが一目でわかるようにする。
- 資源アイコン（木材・石材・食料）は原色に近い高彩度色を使い、UI上の一覧表示で区別しやすくする。
- 出力形式: 透過PNG、1px黒〜濃色のアウトラインを入れる（背景タイルに溶け込ませない）。
### 必要スプライト一覧
| 分類 | 名前 | サイズ | 枚数/フレーム数 | 備考 |
| --- | --- | --- | --- | --- |
| 地形 | 草地タイル | 32×32 | 1 | バリエーション不要（MVPは単調柄でよい） |
| 地形 | 森タイル | 32×32 | 1〜2 | 木がまばらな見た目にするなら2枚 |
| 地形 | 岩タイル | 32×32 | 1 | 採掘前の状態 |
| 建築 | 壁 | 32×32 | 1（完成）+1（建築中ブループリント） | ブループリントは半透明表現 |
| 建築 | 床 | 32×32 | 1 | |
| 建築 | 扉 | 32×32 | 2（開/閉） | |
| 建築 | ベッド | 32×32 | 1 | |
| 建築 | 畑（畝） | 32×32 | 2〜3（種まき直後/成長中/収穫可） | 農作ジョブの進捗表現に使う |
| 建築 | 貯蔵ゾーンマーカー | 32×32 | 1 | 床タイルに重ねる枠線程度の表現でよい |
| 資源アイコン | 木材 | 16×16 or 32×32 | 1 | UI（資源一覧）とマップ上のドロップアイテム兼用 |
| 資源アイコン | 石材 | 16×16 or 32×32 | 1 | 同上 |
| 資源アイコン | 食料 | 16×16 or 32×32 | 1 | 同上 |
| 入植者 | 歩行アニメーション | 32×32 | 4方向×2〜4フレーム | MVPは3人だが個体差は色替えで対応し、共通の歩行スプライトシートを使い回す想定 |
| 入植者 | 作業アニメーション | 32×32 | 1〜2フレーム（簡易） | 伐採/採掘/農作/建築で使い回す簡易モーションでよい |
| UIアイコン | 仕事アイコン5種 | 16×16 or 24×24 | 各1 | 伐採・採掘・農作・建築・運搬（仕事優先度表で使用） |
| UIアイコン | ニーズアイコン2種 | 16×16 or 24×24 | 各1 | 空腹・睡眠（入植者タブで使用） |
木・岩そのもの（伐採前の木、採掘前の鉱脈）は森タイル・岩タイルの絵柄に含める設計とし、個別オブジェクトスプライトとしては起こさない。これによりMVPで必要な新規スプライト枚数を最小限に抑える。
