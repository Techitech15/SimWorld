# 音声ファイルの置き場所

ここにファイルを置くと、**その名前の音だけ**が合成音から差し替わる。
1本も無くてもゲームは鳴る（`src/ui/sfx.ts` の合成音が土台）。

仕様と発注書は [`docs/design-phase15-audio.md`](../../../docs/design-phase15-audio.md) の 5 章。

- ファイル名 = 音の名前。`raid.ogg` / `build.ogg` / `notify.ogg` …
- 数字の接尾辞はバリエーション。`animal_1.ogg` / `animal_2.ogg` はどちらも `animal` として扱い、
  鳴らすたびにどれかを選ぶ（同じ音の連続が機械的に聞こえるのを避けるため）
- `bgm_day` / `bgm_night` の `_day` は数字ではないので、**別々の音**として扱われる
- 形式は `.ogg`（Opus）推奨。`.mp3` / `.wav` / `.m4a` も読む
- 読み込みや復号に失敗した音は**合成音に落ちる**。無音にはならない

`npm run build:single` は、ここのファイルを data URI として単一 HTML に埋め込む。
埋め込まれずに別ファイルとして出力されたものがあれば `tools/bundle-single-file.mjs` が
**ビルドを失敗させる**（外部リクエストが静かに増えるのを防ぐため）。
