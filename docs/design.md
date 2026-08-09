# SimWorld 設計方針

> RimWorld風2Dブラウザ入植地シミュレーション。本ドキュメントは実装レベルの設計を定める。
> **実装に追随して更新する**。いま何がどう動くかを書く場所であり、実装と食い違ったらこちらを直す。

| | |
| --- | --- |
| **このファイル** | 仕様。いま何がどう動くか |
| [design-notes.md](design-notes.md) | 追加検討時の設計思想。なぜそうしたか、何を測ったか、案から何を変えたか |
| [design-phase2.5-animals.md](design-phase2.5-animals.md) | **フェーズ2.5** 生物レイヤーの設計案（提案時のまま。現況は notes 側） |
| [design-phase5-trade.md](design-phase5-trade.md) | **フェーズ5** 交易とファンタジー層の設計案（未着手） |
| [design-phase6-space.md](design-phase6-space.md) | **フェーズ6** マップ拡張と画面の再配置の設計案（未着手） |
| [design-next.md](design-next.md) | 未実装のものの検討。実装したらこちらの 11 章と notes へ移す |
| `README.md` | 動かし方・操作・テスト一覧 |

原案（MVP 着手時点の版）は Git 履歴に残っている（`docs/design.md` を追加したコミット `534c005`）。
本文を原案のまま保つ必要はないので、以降は現状に合わせて書き換える。ただし
**「なぜそうしたか」はここには書かない** —— それは notes 側の役割で、仕様と理由は寿命が違うため。
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
SimWorldは、ファンタジー世界観の入植地シミュレーションである。プレイヤーは3人の入植者から始め、伐採・採掘・農作・建築・運搬の生産チェーンを回して生存を続けさせる。マナ結晶を燃料とする魔力インフラが自動化・防衛の土台になる（11章フェーズ2、段階A・B 実装済み）。
守るべき設計原則は3つ。
1. **データとロジックを分離する。** エンティティ（入植者・建築・アイテム・ジョブ）は振る舞いを持たないプレーンなデータとし、ロジックはすべて外部関数に置く。理由: これを守らないとセーブがJSON化だけで完結しなくなり、後から矯正するコストが破滅的に高い。
2. **シミュレーションとUIの再描画を分離する。** ゲーム状態ストアを唯一の真実源とし、PixiJSとReactはどちらもそれをsubscribeするだけで、互いのループに干渉しない。理由: Reactの再レンダリングがゲームループのfpsを揺らす設計は、入植者が増えた瞬間に破綻する。
3. **土台が回ってから積む。** 最適化パズル（生産チェーン）が気持ちよく回ることを最優先する。理由: 土台が壊れている状態で機能を積み増しても、後で土台からやり直すことになる。MVP を終えた現在も同じ規則で運用しており、追加は必ず段階に割って、段階ごとに「動いたと言える条件」をテストにしてから実装する（10章）。
4. **主張する前に測る。** バランスも性能も「こうなるはず」ではなく、年単位のヘッドレス実行か実ビルドで測ってから書く。測った値と食い違ったら、直すのは主張の側。実際に何度もそうなっており、記録は [design-notes.md](design-notes.md) にある。
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
全型はプレーンなデータであり、メソッドを持たない。クラス・`Date`・`Map`・`Set` は使わない。相互参照はオブジェクト参照ではなくID（`string`）で行う。理由: ID参照ならJSON化しても壊れないが、オブジェクト参照は循環構造を生み `JSON.stringify` できない。この原則が「`GameState` はそのままセーブになる」（8章）を成立させている。

実体は `src/core/types.ts`。

```typescript
type TileId = string;       // `${x},${y}`
type ColonistId = string;
type BuildingId = string;
type ItemId = string;
type JobId = string;
type ZoneId = string;
type AnimalId = string;
type Vector2 = { x: number; y: number };

// crystal は岩盤の中のマナ結晶。建築ではなく地形なので、採掘は既存の mine ジョブがそのまま扱う
type TerrainType = 'grass' | 'forest' | 'stone' | 'crystal';
type Designation = 'chop' | 'mine' | 'deconstruct';

interface Tile {
  id: TileId;
  x: number;
  y: number;
  terrain: TerrainType;
  walkable: boolean;        // 岩・結晶は採掘前 false。地形変更で更新される
  buildingId: BuildingId | null;
  itemIds: ItemId[];        // 地面に落ちているアイテム
  designation: Designation | null;
  forage: number;           // 草地の可食量 0..1。放牧で減り1日で戻る
}

type ResourceType = 'wood' | 'stone' | 'food' | 'manaCrystal';
interface Item {
  id: ItemId;
  type: ResourceType;
  quantity: number;
  position: Vector2;        // 貯蔵ゾーン内でも実座標を持つ
  reservedByJobId: JobId | null;
}

interface ColonistNeeds {
  hunger: number;           // 0(満腹)〜100(餓死寸前)
  sleep: number;            // 0(覚醒)〜100(限界)
}

// ニーズ由来の振る舞いはジョブシステムの外側に置く（プレイヤーが優先度を付ける仕事ではないため）
type ColonistActivity =
  | { kind: 'none' }
  | { kind: 'moving'; targetTileId: TileId }
  | { kind: 'eating'; itemId: ItemId | null; ticksRemaining: number }
  | { kind: 'sleeping'; bedId: BuildingId | null }
  | { kind: 'fleeing'; fromAnimalId: AnimalId; untilTick: number }
  | { kind: 'brooding'; untilTick: number };   // 気分が限界を切って仕事を放棄している

interface Colonist {
  id: ColonistId;
  name: string;
  color: number;                    // 共通スプライトへの tint（12章）
  position: Vector2;
  path: Vector2[] | null;           // 経路キャッシュ（7章）
  pathTargetTileId: TileId | null;
  needs: ColonistNeeds;
  currentJobId: JobId | null;
  health: number;                   // 0..100。部位なし・病気なし・治療ジョブなし
  carrying: { type: ResourceType; quantity: number } | null;
  activity: ColonistActivity;
  workPriorities: Record<JobType, number>;   // 0=無効, 1(最高)..3(最低)
  skills: Record<SkillName, number>;         // 累積経験値。レベルは導出する
  traits: TraitName[];                       // 生涯不変。すべて既存の数値への乗数
}

type BuildingType =
  | 'wall' | 'stoneWall' | 'floor' | 'stoneFloor' | 'door' | 'bed'
  | 'farmPlot' | 'berryBush' | 'storageZoneMarker'
  | 'manaFurnace' | 'manaConduit' | 'manaLamp';

interface Building {
  id: BuildingId;
  type: BuildingType;
  tileId: TileId;
  isBlueprint: boolean;
  hpCurrent: number;
  hpMax: number;
  requiredResources: { type: ResourceType; quantity: number }[];
  buildProgress: number;    // 0..1
  growth: number;           // 畑・ベリー: 0=裸地, 1=収穫可
  sown: boolean;            // 畑のみ
  manaFuel: number;         // 魔導炉に残っている燃焼 tick 数
}

type JobType = 'chop' | 'mine' | 'farm' | 'build' | 'haul' | 'hunt' | 'handle' | 'deconstruct' | 'repair';
type JobState = 'pending' | 'reserved' | 'active' | 'completed' | 'failed' | 'cancelled';

interface Job {
  id: JobId;
  type: JobType;            // 実行内容
  workType: JobType;        // どの仕事列で優先度を引くか（資材運搬は「建築」の仕事）
  priority: number;
  targetTileId: TileId | null;
  targetEntityId: string | null;
  destinationId: string | null;      // 運搬先（貯蔵タイル・ブループリント・魔導炉）
  payloadType: ResourceType | null;
  workProgress: number;
  state: JobState;
  reservedBy: ColonistId | null;
  createdAtTick: number;
  retryCount: number;
  cooldownUntilTick: number | null;
}

interface Zone {
  id: ZoneId;
  type: 'storage' | 'pasture';
  tileIds: TileId[];
  accepts: ResourceType[];  // 貯蔵ゾーンの受け入れ資源。牧場は food のみ
}

interface Animal {
  id: AnimalId;
  species: AnimalSpecies;   // deer | boar | rabbit | chicken | goat | wolf
  name: string;
  position: Vector2;
  path: Vector2[] | null;
  pathExpiresAtTick: number | null;  // 動物の経路は PathIndex に載せず、失効させる（7章）
  hunger: number;
  health: number;
  ageTicks: number;
  tame: boolean;
  pastureZoneId: ZoneId | null;
  designation: 'hunt' | 'tame' | 'slaughter' | null;
  activity: AnimalActivity;
  produceAtTick: number | null;
  gestationUntilTick: number | null;
}

interface GameState {
  tick: number;
  speed: 0 | 1 | 3 | 10;
  tiles: Record<TileId, Tile>;
  colonists: Record<ColonistId, Colonist>;
  buildings: Record<BuildingId, Building>;
  items: Record<ItemId, Item>;
  jobs: Record<JobId, Job>;
  zones: Record<ZoneId, Zone>;
  animals: Record<AnimalId, Animal>;
  reservations: Record<string, Reservation>;
  forestCapacity: number;   // この地図が支える森の量。再生の不動点
  worldSeed: number;        // 災厄の暦を世界ごとに変えるため
  scenario: ScenarioName;   // 生成時だけでなく毎日効く規則がある
  nextIds: Record<string, number>;
  log: LogEntry[];
}
```

補足: 経路（`path`）・予約（`reservations`）もセーブ対象に含める。理由: ロード直後に全員が経路探索をやり直すのは無駄で、予約が消えると2人が同じ木に向かう事故（6章）が再発するため。

**保存しないもの（導出する）**: 経路インデックス、連結領域ラベル、魔力ネットワーク（`ManaNetwork` / `ManaGrid`）、気分と思考。いずれも `SimContext` かその場の計算で、セーブには入らない。理由: 導出できる値を保存すると「実態とズレた値」という不具合の種類が増える。

## 5. 時間モデル
- **tick長**: 1 tick = 200ms（5 tick/秒）を基準周波数とする。理由: A*やジョブ候補フィルタを毎フレーム（60fps）ではなくtick単位で走らせることで、経路探索コスト（7章）を安全な頻度に抑えられる。
- **1日の長さ**: 1日 = 3,000 tick。1倍速では 3,000 tick ÷ 5 tick/秒 = 600秒（10分）で1日が経過する。
- **速度倍率**: 停止(0) / 1倍 / 3倍 / 10倍。いずれも **tick長は変えず処理回数だけを変える**。理由: tick長を可変にすると経路キャッシュや予約のタイムアウト計算（6章）がずれる。
  - 停止（0倍）: tickカウンタを進めない。GameStateへの書き込みは一切発生しない。
  - 10倍は1日を60秒にする。季節・災厄・熟練はすべて「日」の尺度で起きるので、これが無いとゲームの大半が「遊ぶもの」ではなく「読むもの」になる。シミュレーションは1 tick あたり約0.6ms（1コアの約3%）で、律速は最初から描画側だった。
- **1年**: 1季5日・4季で20日（`src/core/season.ts`）。作物の成長・草の再生・繁殖・気分が季節で変わる。
- **pause時の扱い**: Simulation層のtickループを完全停止する。PixiJSのRAF描画ループ自体は止めない（カメラ操作のため）が、GameStateが変化しないのでスプライトは静止する。Reactの操作（優先度変更や建築指定）はpause中も受け付け、次にtickが進んだ瞬間に反映される。
**ニーズは空腹・睡眠の2つのみ**。RimWorld wiki「Needs」の Food / Rest と同じく、しきい値マーカーを持たず直線的に減少し、しきい値到達で自動的に食事・睡眠行動へ遷移する。娯楽・快適・美しさ等の人間専用ニーズは**実装していない**（11章フェーズ3）。

気分（mood）と思考（thought）は実装済みだが**ニーズではない**。導出値であり、空腹・睡眠・体力・寝床・倉・床・灯・季節から毎回計算する。詳細は下の11章と [design-notes.md](design-notes.md)。

### tick パイプライン

順序は好みではなく、いくつかは入れ替えると壊れる。

```
beginTick → rebuildRegions（地形が変わっていれば）
  → growCrops → regrowForest → runIncidents → runArrivals
  → runNeeds ★ → runMoveOrders → runAnimals ★ → runFleeing → healColonists
  → runMana → runJobGenerator → runAssignment → runExecution → cleanupJobs
```

★1 `runNeeds` はジョブ生成より前でなければならない。中断された仕事が同じ tick のうちにキューへ戻っていないと、生成器と候補フィルタが古い状態を見る。
★2 `runAnimals` は割り当てより前でなければならない。同じ tick に捕食者に追われた入植者へ仕事が割り当てられてはいけない。
## 6. ジョブシステム詳細
素朴な実装（各Colonistが毎tick「一番近い未処理の木」を探して直接向かう）は、2人が同じ木に向かって片方が無駄足になる、運搬したアイテムをまた別のColonistが運び出す無限ループ、といった事故を起こす。原因は「候補を選ぶ」と「実際に確保する」の間に競合防止がないことなので、**予約（reservation）を最初からジョブのライフサイクルに組み込む**。
### RimWorld準拠の簡略化
RimWorld wiki「Work」によると、実際の優先度システムは次の通り。
- 標準モードでは「割り当て済み/未割り当て」のみで、Work Menu上で左にある仕事ほど優先。マニュアルモードでは各仕事タイプに1〜4の優先度を手動設定できる。
- **「同一優先度の仕事は、次の優先度に移る前に全て終わらせる」**。距離やマップ上の位置は一切考慮しない（真横の木より地図の反対側の木を先に処理することもある）。
本作ではこれを次のように簡略化する。
- 優先度は**1〜3の3段階**（0=無効）。RimWorldの1〜4より単純化。
- 仕事は9種（`chop` / `mine` / `farm` / `build` / `haul` / `hunt` / `handle` / `deconstruct` / `repair`）だが、**優先度の列は7つ**。`deconstruct` と `repair` は建設の列で扱う——壁を壊すのも直すのも、建てたのと同じ技能だから。この「実行内容（`type`）」と「どの列で選ばれるか（`workType`）」の分離が `Job.workType`。ブループリントへの資材運搬は「建築」の仕事として扱う（そうしないと運搬を最低優先度にした植民地で建物が永久に完成しない）。
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
1. **ジョブキュー生成（JobGenerator）**: 毎tick、「伐採指定された木」「採掘指定タイル（岩・マナ結晶）」「未処理の運搬対象アイテム」「未完成のブループリント」「傷んだ建物」「狩猟／世話を指定された動物」「燃料を欲しがっている魔導炉」を走査し、対応する `pending` Job を生成する。重複防止は仕事の同一性キー（`jobKey`）で行い、同じ対象に二重の Job は作らない。
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

### 到達可能性は A* で判定しない

候補フィルタ（6章）は毎tick「その仕事に行けるか」を問うが、そこで A* を走らせると本末転倒になる。歩行可能タイルの**連結成分ラベル**（`Int32Array`、地形変更時のみ再構築）を持ち、判定を O(1) にする。実際の A* は「実際に割り当てる候補」に対してのみ、1 tick あたり最大 `CANDIDATE_PATH_ATTEMPTS` 回だけ走る。

この設計には**鋭い縁**がある: 通行不可タイルの上に立ったエンティティは領域 −1 になり、地図上の全ての仕事が到達不能に見える。壁を建てて自分を閉じ込めた建築士がこれで生まれた（対策は notes 側）。

### 動物の経路

動物20〜40体が毎tick A* を走らせると3人規模で設計した予算が破綻する。

- 徘徊・逃走・採食は A* を使わない（隣接1マスの判断のみ）。
- A* を使うのは追跡と帰巣だけで、1 tick あたりの本数に上限を設ける（`animalPathBudget`）。群れが入植者の経路探索を締め出せない。
- 動物の経路は **PathIndex に登録しない**。代わりに最大 N tick で失効させる。厳密な無効化より、失効の方が動物には十分かつ安価。
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
- 手動セーブ／ロードに加え、**1ゲーム内日ごとのオートセーブ**を別枠で持つ。
- 保存先はIndexedDB。理由: `items`や`jobs`が増えるとlocalStorageの5MB上限に近づきうるため、余裕のあるIndexedDBを既定にする。
- 現行 `schemaVersion` は **11**。v1〜v10 のセーブは読み込み時に順に移行される。移行チェーンは1段ずつテストしてある。
## 9. 機能リスト

MVP として定めた範囲と、そのあとに足したもの。**MVP の項目はすべて実装済み**で、いくつかは超過している。

### MVP（当初の範囲）

| 項目 | 当初 | 現在 |
| --- | --- | --- |
| マップ | 60×60・1枚 | 同じ |
| 地形 | 草地／森／岩 の3種 | **4種**（マナ結晶を追加） |
| 入植者 | 3人 | 3人から開始（移住で最大8人） |
| ニーズ | 空腹・睡眠のみ | 同じ |
| 仕事 | 5種 | **9種**（狩猟・世話・解体・修理を追加、優先度の列は7つ） |
| 建築 | 6種 | **12種**（石壁・石床・ベリー・魔導炉・導管・魔力灯を追加） |
| 資源 | 木材・石材・食料 | **4種**（マナ結晶を追加） |
| 速度 | 停止／1倍／3倍 | **4段**（10倍を追加） |
| セーブ | 手動・IndexedDB | 手動＋日次オートセーブ |
| UI | 入植者タブ・仕事優先度表・資源一覧 | 上記＋アラート・目標・ミニマップ・選択詳細・ログ・動物・貯蔵フィルタ |
| 勝敗 | なし。生存が続くことがゴール | 同じ |

### MVP のあとに足したもの

| 追加 | 概要 |
| --- | --- |
| 生物レイヤー | 動物6種の生態・狩猟・手懐け・牧場・繁殖・飼い葉（[design-phase2.5-animals.md](design-phase2.5-animals.md)） |
| 四季 | 1年20日。冬は作物が止まり草も戻らない |
| 災厄（インシデント） | 6種。世界シードごとに別の暦を持つ |
| 移住者 | 食料に余裕がある植民地に3日ごと（冬以外）1人 |
| 熟練度・特性 | 7スキル・12特性（11章フェーズ3の先取り） |
| 気分・思考 | 導出値。作業速度と「仕事の放棄」に効く（同上） |
| 魔力インフラ | マナ結晶・魔導炉・導管・魔力灯（11章フェーズ2、段階A〜B） |
| 森の再生 | 伐採跡が戻る。地図ごとの森林容量で頭打ち |
| シナリオ | 開始条件3種 |

### 実装していないもの

- 魔法・戦闘・襲撃・防衛建築（11章フェーズ4）
- 入植者間の関係性、複数種のメンタルブレイク（同フェーズ3）
- 空腹・睡眠以外のニーズ（娯楽・快適・美しさ・屋内外）
- 複数マップ・キャラバン・貿易・研究ツリー
- 天候・気温管理（季節はあるが気温は無い）
- 健康画面・部位・病気（`health` は0..100の単一値のみ）

**当初「含まないもの」としながら実装した項目**は、気分・メンタルブレイク・熟練度・特性（いずれもフェーズ3の先取り）、最小構成の `health`、そして季節。理由は [design-notes.md](design-notes.md) に記録してある。

## 10. 実装順序

土台（状態設計・描画・経路探索）を先に固め、ジョブシステムをその上に積み、UI は最後に被せる。理由: 予約機構（6章）は見た目より先に正しく動く必要があり、後から差し込むのが最も難しい部分だから。

この順序は実際に守られ、MVP は Week 1〜7 相当の区切りどおりに積み上がった。各段階の「動いたと言える条件」は以下で、すべて対応するテストになっている。

| 段階 | 内容 | 動いたと言える条件 | 対応するテスト |
| --- | --- | --- | --- |
| 1 | 基盤とデータ設計 | 空の `GameState` が JSON 往復で一致する | `roundtrip.test.ts` |
| 2 | マップと描画 | 60×60が表示され、パン・ズームできる | 実ビルドでの確認 |
| 3 | 経路探索と手動移動 | クリックで壁や森を迂回して到達する | `pathfinding.test.ts` |
| 4 | ジョブ中核 | 大量の伐採指定でも2人が同じ木に向かわない | `jobs.test.ts` |
| 5 | ニーズと生存ループ | 無操作で食事・睡眠を取り、餓死しない | `survival.test.ts` |
| 6 | 建築と React UI | 壁の設置指示で資材運搬から完成まで通る | `actions.test.ts` |
| 7 | 時間モデルと通しプレイ | 無操作・3倍速で複数日、行き詰まらない | `longrun.test.ts`（20日） |

以降の追加も同じ形を踏襲する——段階ごとに「動いたと言える条件」を先に決め、それをテストにしてから実装する。

## 11. フェーズ2以降のロードマップ

コアの魅力の優先順（1. 最適化パズル、2. 物語生成、3. 防衛と危機管理）に対応させ、魔力インフラ→物語生成→防衛の順で積む。依存関係として、フェーズ4の魔力式防衛設備はフェーズ2の魔力インフラを前提にする。**この依存順を崩さない**。

フェーズ3のうち特性・気分・思考だけは、フェーズ2より先に実装した（入植者を「二本のゲージを持つ機械」から個人にするのに、関係性やメンタルブレイクの一式は要らなかったため）。依存順を崩したわけではなく、依存の無い部分を先に取っただけ。

### フェーズ2: 魔力インフラ — 段階A・B 実装済み

既存の生産チェーンに「電力」に相当する魔力の生産・分配という制約を追加する。**制約の質が違う**のが要点で、材料が足りるかではなく供給し続けられるか、を問う。

| 項目 | 状態 | 実装 |
| --- | --- | --- |
| `manaCrystal`（`ResourceType` に追加） | 済 | 地形 `crystal` を岩盤の奥に配置。1本6産出 |
| マナ結晶の採掘 | 済 | **新規ジョブを作らず既存 `mine` の対象拡張で対応した**。当初の「対応可能か検討」への答え |
| `manaFurnace`（魔導炉） | 済 | 石25＋木10。結晶1個で2/3日燃え、10供給 |
| `manaConduit`（導管） | 済 | 石2。歩ける——送電線が回り道を強いる壁になってはいけない |
| `ManaNetwork` / `ManaGrid` | 済 | **導出**。連結成分ラベリングで `SimContext` に置き、セーブしない |
| `manaConsumption` / `manaOutput` | 済（形は変更） | `Building` のフィールドではなく**種類ごとのテーブル**。建築コストと同じ理由——種類の性質であって個体の性質ではない |
| 魔力灯（`ManaConsumer` の1つ目） | 済 | 3消費。半径6タイルの入植者の気分 +5 |
| 自動採掘（同2つ目） | 未 | 段階C |
| 温度管理・防衛タレット | 未 | 前者は気温が無いので保留、後者はフェーズ4 |

**供給不足はグリッド全体を落とす**（部分的なブラウンアウトにしない）。理由は [design-notes.md](design-notes.md)。

### フェーズ3: 物語生成 — 部分実装

| 項目 | 状態 |
| --- | --- |
| `traits`（性格特性） | 済。12種・6排他グループ。すべて既存の数値への乗数 |
| `mood` | 済。ただし**保存せず導出**する |
| `thoughts` | 済。同上。パネルは計算に使った思考をそのまま並べる |
| `MentalState` | 部分。`brooding`（仕事の放棄）の1状態のみ。複数種の遷移機械にはなっていない |
| `Relationship`（入植者間の affinity） | 未 |
| 娯楽・快適・美しさ等のニーズ | 未 |

### フェーズ4: 防衛と危機管理 — 未着手

| 項目 | 状態 |
| --- | --- |
| `RaidEvent`（襲撃） | 未。狼の群れはあるが、襲ってくる**人間**はいない |
| `CombatState` | 未。入植者は反撃せず逃げるだけ |
| 防衛タレット | 未。魔力消費型のためフェーズ2の完了が前提 |

### フェーズ5: 交易とファンタジー層 — 未着手

当初のロードマップ（2→3→4）に無い追加。設計案は [design-phase5-trade.md](design-phase5-trade.md)。

この世界は 1 章で**ファンタジー世界観**と定めているが、実装されている幻想要素は魔力インフラだけで、地形・植生・動物はいずれも現実のものである。フェーズ5は、既にある唯一の幻想要素（マナ）を生態と植生に接続し、そこへ**交易**という2つ目の資源の出入り口を足す。

| 項目 | 状態 | 内容 |
| --- | --- | --- |
| 行商人・交易柱・物々交換 | 未 | 商人が地図の端から来て去る。取引は既存の `haul` で成立し、`JobType` は増えない |
| 晶商（マナ結晶の売買） | 未 | 供給の通った魔力灯が来訪を格上げする。フェーズ2 段階B が前提 |
| 霜花（冬にだけ育つ植物） | 未 | 季節成長表を反転して引く |
| 光苔（灯りの下で `forage` が戻る） | 未 | 冬に囲いの群れが餓える穴を塞ぐ。フェーズ2 段階B が前提 |
| 晶角鹿（`manaCrystal` を産む家畜） | 未 | `SPECIES` に1行。産出の資源型が固定されているので `produceType` の1フィールドを足す |
| 岩喰い（岩を食う動物） | 未 | 捕食者が扉を齧る `gnawStructure` を地形へ拡張 |

**依存順**: フェーズ2 段階B（実装済み）が前提。フェーズ3・4 には依存せず、**フェーズ4 より先に着手してよい** —— 番号は「元のロードマップの外にある追加」を示すものであって、着手順ではない。キャラバン（入植者が地図の外へ出る形）は引き続き**非目標**で、土台の「1枚の地図」を変えるため。

**ドキュメントの命名**: フェーズ単位で足す層の設計案は `design-phase<番号>-<名前>.md` とする（生物レイヤー＝`design-phase2.5-animals.md`、本層＝`design-phase5-trade.md`、空間＝`design-phase6-space.md`）。`design.md` / `design-notes.md` / `design-next.md` の3つは特定のフェーズに属さないので、この命名は適用しない。

### フェーズ6: 空間（マップ拡張と画面の再配置） — 未着手

当初のロードマップに無い追加。設計案は [design-phase6-space.md](design-phase6-space.md)。**ゲーム内容を1つも増やさず**、盤面と見え方だけを変える。他のどのフェーズにも依存しない。

MVP 当時の 60×60 の地図と、幅 300px に11個のパネルを縦積みした右サイドバーは、入植者8人・仕事9種・建築12種・動物6種・牧場・魔力網が載った現在の植民地に対して狭い。両者は独立ではなく、地図が広がればミニマップとアラートからの移動の重みが増して画面の奪い合いが厳しくなる。

| 項目 | 状態 | 内容 |
| --- | --- | --- |
| マップ寸法を `GameState` へ | 未 | 現在はモジュール定数で12ファイル・77箇所から参照。state に移さないと既存セーブが読めなくなる |
| 60×60 → 120×120（面積4倍） | 未 | 実測で 1 tick 0.732 ms → 2.791 ms（予算 200 ms の 1.4%）。**性能は制約にならない** |
| 絶対数を密度へ | 未 | ベリー26株・動物35頭は定数なので、4倍の地図では密度が 1/4 になる。ここが拡張の実質的な作業 |
| マップサイズの選択 | 未 | 寸法が state に入れば表を1つ足すだけ。任意段階 |
| 選択詳細の3パネルを1枠へ | 未 | `ColonistDetail` と `AnimalDetail` は store 上で排他なのに独立した枠で縦に並んでいる |
| サイドバーの折り畳み | 未 | 開閉状態は `localStorage`。**`GameState` には入れない**（セーブと移行の対象にしない） |
| 資源・アラート・ミニマップを画面隅へ | 未 | 常に見たいが小さいものはオーバーレイへ。それ自体も畳める |

地形の構成比は 60×60 と 120×120 で1ポイント以内で一致するため（20 シード実測）、**地形生成には手を入れない**。実測値は [design-phase6-space.md](design-phase6-space.md) の 2 章。

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

### 現在の枚数

`tools/generate-sprites.mjs` が **49枚**を決定論的に生成する（`npm run sprites`）。当初一覧に対して増えたのは、地形（マナ結晶）、建築（石壁・石床・ベリー2種・牧場マーカー・魔導炉・導管2種・魔力灯2種）、動物6種の歩行シート、UIアイコン（狩猟・世話・体力・気分）。

外部の画像素材は使わず、すべてコードから描いている。理由: 決定論的に再生成でき、差分がレビューでき、単一HTMLに data URI で同梱できる。
