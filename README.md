# SimWorld

RimWorld 風の 2D ブラウザ入植地シミュレーション。TypeScript + PixiJS + React、ビルドすると
**単一の HTML ファイル**になる（外部リクエストゼロ）。

| ドキュメント | 何が書いてあるか |
| --- | --- |
| [docs/design.md](docs/design.md) | **設計方針（全12章）**。いま何がどう動くか。実装に追随して更新する |
| [docs/design-notes.md](docs/design-notes.md) | **追加検討ノート**。なぜそうしたか・何を測ったか・案から何を変えたか |
| [docs/design-phase2.5-animals.md](docs/design-phase2.5-animals.md) | **フェーズ2.5** 生物レイヤーの設計案（提案時のまま） |
| [docs/design-phase5-trade.md](docs/design-phase5-trade.md) | **フェーズ5** 交易とファンタジー層の設計案（未着手） |
| [docs/design-phase6-space.md](docs/design-phase6-space.md) | **フェーズ6** マップ拡張と画面の再配置の設計案（未着手） |
| [docs/design-phase7-time.md](docs/design-phase7-time.md) | **フェーズ7** 昼夜の表現・なめらかな移動の設計案（未着手） |
| [docs/design-phase8-equipment.md](docs/design-phase8-equipment.md) | **フェーズ8** 服と武器の設計案（未着手） |
| [docs/design-next.md](docs/design-next.md) | **次の検討**。まだ実装していないものと、その優先順位 |
| この README | 動かし方・操作・実装との対応・テスト一覧 |

フェーズ単位で足す層の設計案は `design-phase<番号>-<名前>.md`。フェーズに属さない3つ
（`design.md` / `design-notes.md` / `design-next.md`）にはこの命名を適用しない。
ロードマップ上の各フェーズの現況は [docs/design.md](docs/design.md) の 11 章。

仕様（design.md）と理由（design-notes.md）を分けているのは、寿命が違うから。仕様は実装が変われば
書き換わるが、「なぜ牧場は食料しか受け入れないか」は実装が変わっても消えてはいけない記録になる。

```bash
npm install
npm run sprites       # ドット絵アセットを再生成（src/assets 配下、49枚）
npm run dev           # http://localhost:5173
npm test              # ヘッドレスシミュレーションのテスト
npm run build         # 型チェック + 本番ビルド
npm run build:single  # 単一HTMLに固めた版（dist/simworld.html）。ダブルクリックで起動できる
```

## 操作

| 操作                        | 内容                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------ |
| 左ドラッグ（ツール選択時）  | 範囲に対してツールを適用（伐採・採掘・撤去の指定／建築ブループリント／貯蔵・牧場ゾーン／動物指定／取消） |
| 左クリック（Select）        | 入植者を選択。選択中に地面をクリックで移動命令                                       |
| 右ドラッグ / Shift+ドラッグ | カメラのパン                                                                         |
| ホイール                    | ズーム（カーソル位置基準）                                                           |
| WASD / 矢印キー             | カメラのパン                                                                         |
| ⏸ / ▶ / ▶▶▶                 | 停止・1倍・3倍                                                                       |
| Space / 1・2・3             | 停止と再開 / 速度の直接指定                                                          |
| Esc, c, m, x, q, b, f, r, n, v, z, p, e, h, t, k | ツールの切り替え（ツールバー下部に一覧）                          |

危機（食料ゼロ・餓死・全滅）が新たに発生すると自動で停止する。ゲーム内1日ごとに専用スロットへオートセーブし、
存在するときだけ「Load autosave」が出る。

## アーキテクチャ（3章）

依存の向きは一方向で固定されている。

```
[Simulation] --tick書き込み--> [Store (GameState)] <--購読のみ-- [Rendering (PixiJS)]
                                    ^
                                    |--アクション関数（優先度変更・建築指定など）
                              [UI (React)] --selector購読--> (Storeから読む)
```

| 層          | 場所                     | 備考                                                                 |
| ----------- | ------------------------ | -------------------------------------------------------------------- |
| Simulation  | `src/core/`              | DOM にも PixiJS にも依存しない。`tickOnce(state, ctx) -> state`      |
| State Store | `src/store/gameStore.ts` | 唯一の真実源（zustand）。書き込みは tick とアクション関数の2経路のみ |
| Rendering   | `src/render/`            | PixiJS の RAF ループ。ストアへは書き込まない                         |
| UI          | `src/ui/`                | selector 単位で購読（`src/ui/hooks.ts`）                             |
| 永続化      | `src/persistence/`       | IndexedDB、`schemaVersion` とマイグレーションチェーン                |

派生キャッシュ（PathIndex・到達可能領域ラベル）は `src/core/derived.ts` の `SimContext` にあり、GameState の外・セーブ対象外（8章）。

## 章ごとの実装対応

章番号は [docs/design.md](docs/design.md) のもの。

| 章                | 実装                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 4. データモデル   | `src/core/types.ts`（全てプレーンデータ、参照は ID のみ、クラス無し）                                                       |
| 5. 時間モデル     | `src/core/constants.ts`（1 tick = 200ms、1日 = 3,000 tick）、`src/game/loop.ts`（tick長固定・処理回数可変）                 |
| 5. ニーズ         | `src/core/needs.ts`（空腹・睡眠のみ、直線減衰＋しきい値で自動遷移）                                                         |
| 6. ジョブシステム | `src/core/jobs/`（generator → assign（候補フィルタ＋予約）→ execute → release）                                             |
| 7. 経路探索       | `src/core/pathfinding.ts`（4方向グリッドA\*）、`src/core/movement.ts`（経路キャッシュ）、`src/core/derived.ts`（PathIndex・領域ラベル） |
| 8. セーブ／ロード | `src/persistence/saveFile.ts`（`schemaVersion` 15・移行チェーン）, `indexeddb.ts`                                            |
| 9. 機能リスト     | 60×60マップ・地形4種・入植者3人から・仕事9種・建築15種・資源4種・速度4段                                                     |
| 11. フェーズ4     | `src/core/raid.ts`（襲撃・民兵・タレット） |
| 11. フェーズ2     | `src/core/mana.ts`（結晶・魔導炉・導管・魔力灯・自動採掘機、ネットワークは導出）                                                        |
| 12. ドット絵      | `tools/generate-sprites.mjs` が 55 枚を決定論的に生成（`src/assets`）                                                       |

追加要素の一覧は [docs/design.md](docs/design.md) の9章、その設計思想は
[docs/design-notes.md](docs/design-notes.md)。

## ジョブのライフサイクル（6章）

生成 → 候補フィルタ → 予約 → 実行 → 解放 の 5 段階だけが Job の状態遷移経路。

- 候補フィルタの条件は (a) 到達可能、(b) 対象が未予約、(c) 優先度が有効、(d) クールダウン経過。
- 同一優先度内は距離最短優先（RimWorld の距離無視方式は採らない、6章の明記どおり）。
- 運搬ジョブは搬出元アイテムと搬入先（貯蔵タイル or ブループリントの資材枠）の**両方**を予約する。
- 失敗時は `retryCount` を進めて `COOLDOWN_TICKS` 後に `pending` へ戻し、`MAX_RETRIES` 超過で `failed` にしてログへ。
  `failed` ジョブは一定時間だけ墓標として残り（同じ仕事の即時再生成を防ぐ）、期限が切れると破棄される。

到達可能性の判定は毎 tick の A* ではなく、歩行可能タイルの連結成分ラベル（地形変更時のみ再構築）で O(1) に判定し、
実際の A* は「実際に割り当てる候補」に対してのみ、1 tick あたり最大 `CANDIDATE_PATH_ATTEMPTS` 回だけ実行する。

## 速度

1日 = 3,000 tick、ループは毎秒 5×speed tick 進むので、3倍速でも1日に実時間3分20秒かかっていた。
季節・出来事・スキルはどれも「日」の尺度で起きるので、これではゲームの大半が**読むもので見るものでない**。
**10倍速（1日1分）**を追加した。1 tick は約0.6ms なので毎秒50 tick でも1コアの約3%にすぎず、
制約だったのはシミュレーションではなかった。ブラウザ実測で 50.0 tick/秒、2分半で3日目に到達。

## テスト

`npm test` は 10 章の各週の「動いたと言える条件」をヘッドレスで検証する。

| テスト                         | 対応する条件                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `src/persistence/save.test.ts` | Week 1: 空の GameState が JSON 往復で一致する／予約と経路も保存される／マイグレーション拒否 |
| `src/core/pathfinding.test.ts` | Week 3: クリック移動で壁を迂回して到達する／PathIndex が該当入植者の経路だけを無効化する    |
| `src/core/jobs.test.ts`        | Week 4: 大量の伐採指定でも2人が同じ木に向かわない。Week 6: 資材を運搬して壁が完成する       |
| `src/core/survival.test.ts`    | Week 5: 無操作で食事・睡眠を取り餓死しない。Week 7: 4日放置しても生産チェーンが回り続ける   |
| `src/core/state.test.ts`       | 3章: tick が前の状態を書き換えない（購読側の差分検知の前提）                                |
| `src/core/animals.test.ts`     | 生物レイヤーの段階 A〜D の受け入れ条件と、動物の A\* 予算の上限（設計案 10 章）             |
| `src/core/death.test.ts`       | 入植者を失ってもジョブ・予約・運搬物が取り残されない                                        |
| `src/core/zones.test.ts`       | ゾーンの撤去でマーカー建築・予約・家畜の紐付けが道連れになる                                 |
| `src/core/deconstruct.test.ts` | 完成した建築の撤去（半額返却・通行可への復帰・ベッドの解放）                                 |
| `src/core/survival2.test.ts`   | 空腹100からの餓死と、採掘した石を石壁に使えること                                           |
| `src/ui/SelectionPanel.test.ts` | クリックしたタイルの内容（地形・ゾーン・建築・アイテム・動物・指定）が正しく出ること         |
| `src/core/season.test.ts`      | 四季の暦と、冬に作物が止まり春に再開すること・1年放置で越冬できること                       |
| `src/core/alerts.test.ts`      | 危険な状態（食料切れ・餓死寸前・負傷・捕食者接近・冬）だけが出ること                         |
| `src/core/doors.test.ts`       | 扉は入植者だけが通れ、囲いに入れた家畜は出られず狼も入れないこと                             |
| `src/core/arrivals.test.ts`    | 食料に余裕がある植民地にだけ移住者が来る／冬は来ない／人口上限で止まる                       |
| `src/core/fodder.test.ts`      | 草の尽きた囲いで家畜が飼い葉を食べて越冬できること                                           |
| `src/core/berries.test.ts`     | ベリーが森に散り、自力で熟し、収穫量が畑を上回らないこと                                     |
| `src/core/skills.test.ts`      | 熟練するほど同じ仕事が速く終わり、やった仕事だけが伸びること／開拓者の得意分野が異なること   |
| `src/core/storageFilters.test.ts` | 貯蔵ゾーンが受け入れる資源を絞れること／囲いに薪が積まれないこと／往復の無限ループが起きないこと |
| `src/ui/Minimap.test.ts`       | ミニマップに穴が無く、地形・捕食者・家畜・指定が描き分けられること                           |
| `src/core/traits.test.ts`      | 特性が実際に差を生むこと（大食い／早熟／頑健／勤勉）と、矛盾する特性が同時に付かないこと     |
| `src/core/raid.test.ts` | 8日目まで襲撃が来ないこと／民兵だけが戦い他は逃げること／壁が壊されること／タレットがグリッドの点いている間だけ撃つこと／襲撃者が必ず居なくなること |
| `src/core/recreation.test.ts` | 娯楽が働く間だけ溜まり眠っても抜けないこと／炉端が地べたより効くこと／ブレイク3種が引き金の思考で決まること |
| `src/core/relationships.test.ts` | 近くで過ごすと絆が育ち離れると薄れること／眠っている間は育たないこと／仲間と喪が気分に効くこと／喪が3日で消えること |
| `src/core/mood.test.ts`        | 気分が内訳と一致すること／40〜70 で作業速度が変わらないこと／限界に達した入植者が仕事を放り出し、一口の食事では復帰しないこと |
| `src/core/mana.test.ts`        | 鉱脈が全世界に湧き岩の中に隠れていること／掘り進めないと到達不能なこと／結晶が出て既存の運搬で倉に入ること |
| `src/core/manaExtractor.test.ts` | 入植者なしで岩が石になること／半径外は掘らないこと／停電で進捗が止まり取り返さないこと／掘り尽くしを1度だけ告げること |
| `src/core/manaNetwork.test.ts` | 触れている建物が1グリッドになること／供給不足でグリッド全体が落ちること／需要が無い間は燃料を食わないこと／結晶→炉→灯までが無操作で繋がること |
| `src/core/repair.test.ts`      | 捕食者が柵を齧ること／獲物が居なければ齧らないこと／修理ジョブが建設列で走ること             |
| `src/core/longrun.test.ts`     | 無操作1年（20日）で植民地が生き残り、tick 予算・セーブ往復・ジョブ滞留が破綻しないこと       |
| `src/core/regrowth.test.ts`    | 森が伐採跡に戻ること／草原を侵食しないこと／冬に止まること／同じ林を伐り続けられること       |
| `src/ui/ColonistDetail.test.ts` | 入植者シートが全スキル・レベル進捗・特性の効果・現在の作業を正しく出すこと                 |
| `src/core/scenario.test.ts`    | 3つの開始条件が初期資源・獲物の量・狼の上限を実際に変えること／標準は従来どおりであること     |
| `src/render/damage.test.ts`    | 損傷の色付けが最初の一撃から見え、段階が単調で、ブループリントを赤く染めないこと             |
| `src/core/walling.test.ts`     | 壁を建てた本人が壁の中に閉じ込められないこと／列が途中で止まらないこと／床は足元に敷けること |
| `src/core/chaos.test.ts`       | 無作為なプレイヤー操作を流し込んでも、状態の整合性（不変条件）が壊れないこと                 |
| `src/core/goals.test.ts`       | 次の目標が現在の状態から導かれ、成り立たなくなれば未達に戻ること／各目標が実在の道具を案内すること |
| `src/core/events.test.ts`      | 出来事が季節に応じて起き、畑を全滅させず、セーブを再生すると同じ年になること／世界ごとに暦が違うこと |
| `src/game/speed.test.ts`       | 速度が tick 長ではなく tick 数の倍率であること／同じ tick 数なら結果が一致すること           |
| `src/core/logging.test.ts`     | ログが有界であること／`recordLog` が切り捨てを跨いで正確に記録すること／1年分が行動可能な情報であること |
| `src/core/goat.test.ts`        | 山羊が「囲いに入れる価値が最も高い」こと／万能ではないこと／新しい地図に現れること           |
| `src/core/livestock.test.ts`   | 牧場を描き野生動物を指定するだけで、手懐け→定着→食料産出まで繋がること                       |
| `src/core/assignWork.test.ts`  | 「スキルで割り当て」が得意な2列を最優先にし、無効化した列に触れないこと／その代償も測ること   |

## 配布

`npm run build:single` は 2 つのファイルを出力する。スプライトはビルド時に data URI として
バンドルへ取り込まれるため（`vite.config.ts` の `assetsInlineLimit`）、どちらもネットワーク接続を一切必要としない。

| 出力                       | 用途                                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| `dist/simworld.html`       | 単体で完結した HTML。ブラウザで直接開ける（サーバ不要）                   |
| `dist/simworld-embed.html` | `<html>`/`<body>` を持つホストへ埋め込む用の断片（Artifact・iframe など） |

## 設計との差分・追加要素の設計思想

MVP のあとに足したもの（魔力インフラ・生物レイヤー・気分・特性・熟練度・四季・災厄・シナリオほか）の
検討過程、実測値、案から変えた点は [docs/design-notes.md](docs/design-notes.md) にまとめてある。
実装がいまどうなっているかは [docs/design.md](docs/design.md)。
