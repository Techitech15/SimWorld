// Folds a production build into self-contained HTML.
//
// Sprites are already data URIs (vite.config.ts raises assetsInlineLimit) and
// SIMWORLD_SINGLE_FILE=1 makes Vite emit one flat JS chunk, so all this has to
// do is inline that chunk and the stylesheet.
//
// Two outputs, assembled from the same parts:
//   dist/simworld.html       complete document, opens straight from the filesystem
//   dist/simworld-embed.html fragment for hosts that supply their own document
//                            shell (Claude Artifacts, an embed, a docs page)
//
// Run with: npm run build:single
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

function readAsset(src) {
  return fs.readFileSync(path.join(DIST, src.replace(/^\.?\//, '')), 'utf8');
}

const indexHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

const title = indexHtml.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'SimWorld';

const stylesheets = [...indexHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)];
const css = stylesheets.map((match) => readAsset(match[1])).join('\n');

const scripts = [...indexHtml.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)];
if (scripts.length !== 1) {
  throw new Error(
    `expected exactly one module script, found ${scripts.length}. ` +
      'Was the build run with SIMWORLD_SINGLE_FILE=1?',
  );
}
// `</script>` inside a string literal would end the inline script early. The
// bundle is never re-parsed as HTML beyond this point, so nothing else needs
// escaping - and note both outputs are assembled from these parts rather than
// by regexing the finished HTML, which would trip over `</body>` in the code.
const js = readAsset(scripts[0][1]).replace(/<\/script>/gi, '<\\/script>');

const document = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
${js}
    </script>
  </body>
</html>
`;

const fragment = `<title>${title}</title>
<style>
${css}
</style>
<style>
  /* the host page owns the document shell, so the app claims the viewport here */
  html,
  body {
    height: 100%;
    margin: 0;
    overflow: hidden;
  }
  #root {
    height: 100vh;
    min-height: 560px;
  }
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;

const outputs = [
  [path.join(DIST, 'simworld.html'), document],
  [path.join(DIST, 'simworld-embed.html'), fragment],
];
for (const [file, contents] of outputs) {
  fs.writeFileSync(file, contents);
  console.log(`${path.relative(ROOT, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} kB)`);
}
