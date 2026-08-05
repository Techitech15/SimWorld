// Generates every MVP sprite listed in section 12 of the design document.
// Output: src/assets/**.png (transparent PNG, <=32 colours per sprite,
// 1px dark outline on object sprites).
//
// Run with: npm run sprites
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas, mulberry32 } from './png.mjs';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets');

const TILE = 32;

// --- palettes (section 12: terrain separated by brightness, buildings brighter,
// resource icons highly saturated) -----------------------------------------
const P = {
  outline: '#171018',
  grass: ['#3f7536', '#4b8a3f', '#56a04a', '#63b356'],
  forest: ['#1f4423', '#28542a', '#316a33', '#3f8a3d'],
  trunk: ['#4a3220', '#5f4128'],
  stone: ['#4a4a52', '#5c5c65', '#6b6b73', '#8a8a93'],
  wallLight: '#cbbda4',
  wallMid: '#a8977c',
  wallDark: '#7d6e58',
  mortar: '#5d5344',
  plankLight: '#c08b52',
  plankMid: '#a9764a',
  plankDark: '#7d5432',
  doorWood: '#b5793c',
  doorWoodDark: '#8a5628',
  metal: '#d8c56a',
  bedFrame: '#8a5628',
  bedSheet: '#ded6c2',
  bedBlanket: '#3f6bb8',
  bedBlanketDark: '#2f4f8c',
  soil: ['#4f3521', '#65452b', '#7b5636'],
  sprout: '#5fbf4a',
  crop: '#8fd24f',
  cropRipe: '#e8c34a',
  cropRipeDark: '#c79a2c',
  blueprint: '#5ec8ff',
  blueprintFill: '#5ec8ff55',
  storage: '#f2a03d',
  wood: ['#a9764a', '#c08b52', '#d8a86a', '#6b4426'],
  ore: ['#7d7d88', '#9a9aa5', '#b8b8c2'],
  food: ['#d6452f', '#ef6a4c', '#ff9478', '#3f8a3d'],
  skin: '#e2ab7d',
  skinShade: '#c48c60',
  hair: '#4a3423',
  tunic: '#f2f2f2', // near-white so PixiJS tint gives per-colonist colour variants
  tunicShade: '#cfcfcf',
  pants: '#4a5461',
  pantsShade: '#3a424d',
  boots: '#2f2318',
  eye: '#241a12',
  iconBg: '#00000000',
  iconMetal: '#c8ccd6',
  iconMetalDark: '#8c93a3',
  iconWood: '#a9764a',
  iconWoodDark: '#7d5432',
};

function save(name, canvas) {
  const file = path.join(OUT_DIR, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, canvas.toPNG());
  return name;
}

/** Subtle darker border so 60x60 tiles stay readable without a harsh grid. */
function tileEdge(c, color) {
  for (let i = 0; i < TILE; i++) {
    c.set(i, TILE - 1, color);
    c.set(TILE - 1, i, color);
  }
}

// --- terrain ---------------------------------------------------------------
function grassTile() {
  const c = new Canvas(TILE, TILE);
  const rnd = mulberry32(1001);
  c.fill(P.grass[1]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const r = rnd();
      if (r < 0.14) c.set(x, y, P.grass[0]);
      else if (r < 0.26) c.set(x, y, P.grass[2]);
    }
  }
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rnd() * TILE);
    const y = Math.floor(rnd() * (TILE - 3)) + 2;
    c.set(x, y, P.grass[3]);
    c.set(x, y - 1, P.grass[3]);
    c.set(x + 1, y - 1, P.grass[2]);
  }
  tileEdge(c, P.grass[0]);
  return c;
}

function tree(c, cx, cy, r, dark) {
  // trunk grows downward from the canopy centre
  c.rect(cx - 1, cy, 3, r + 3, P.trunk[0]);
  c.vline(cx - 1, cy, r + 3, P.trunk[1]);
  // layered canopy: shadow -> body -> lit side, so trees read at 32px
  c.disc(cx, cy - 1, r, P.forest[0]);
  c.disc(cx, cy - 2, r, dark ? P.forest[1] : P.forest[2]);
  c.disc(cx - 1, cy - 4, r - 1, dark ? P.forest[2] : P.forest[3]);
  c.disc(cx - 2, cy - 5, Math.max(1, r - 3), P.forest[3]);
  c.set(cx - 3, cy - 6, '#4fa04a');
}

function forestTile(variant) {
  const c = new Canvas(TILE, TILE);
  const rnd = mulberry32(2000 + variant);
  c.fill(P.forest[0]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const r = rnd();
      if (r < 0.16) c.set(x, y, P.forest[1]);
      else if (r < 0.22) c.set(x, y, '#24492355');
    }
  }
  if (variant === 1) {
    tree(c, 16, 22, 9, false);
    tree(c, 6, 11, 5, true);
    tree(c, 26, 13, 5, true);
  } else {
    // sparser variant so forests do not look like one repeated stamp
    tree(c, 10, 24, 7, false);
    tree(c, 24, 17, 6, true);
  }
  tileEdge(c, '#16331a');
  return c;
}

function stoneTile() {
  const c = new Canvas(TILE, TILE);
  const rnd = mulberry32(3001);
  c.fill(P.stone[2]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const r = rnd();
      if (r < 0.18) c.set(x, y, P.stone[1]);
      else if (r < 0.24) c.set(x, y, P.stone[3]);
    }
  }
  // rock chunks with highlight / shadow to read as an un-mined ore face
  const chunks = [
    [8, 9, 7],
    [21, 13, 6],
    [13, 23, 6],
    [26, 25, 4],
  ];
  for (const [cx, cy, r] of chunks) {
    c.disc(cx, cy, r, P.stone[1]);
    c.disc(cx - 1, cy - 1, r - 2, P.stone[3]);
    c.disc(cx + 1, cy + 2, r - 3, P.stone[0]);
  }
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rnd() * TILE);
    const y = Math.floor(rnd() * TILE);
    c.line(x, y, x + 3 - Math.floor(rnd() * 6), y + 4, P.stone[0]);
  }
  tileEdge(c, '#3c3c43');
  return c;
}

// --- buildings -------------------------------------------------------------
function wallTile() {
  const c = new Canvas(TILE, TILE);
  c.fill(P.mortar);
  const brick = (x, y, w, h) => {
    c.rect(x, y, w, h, P.wallMid);
    c.hline(x, y, w, P.wallLight);
    c.hline(x, y + h - 1, w, P.wallDark);
    c.vline(x + w - 1, y, h, P.wallDark);
  };
  let y = 1;
  let offset = 0;
  while (y < TILE - 1) {
    for (let x = -offset; x < TILE; x += 16) brick(x + 1, y, 14, 8);
    y += 10;
    offset = offset === 0 ? 8 : 0;
  }
  c.strokeRect(0, 0, TILE, TILE, P.outline);
  return c;
}

function wallBlueprint() {
  const c = new Canvas(TILE, TILE);
  c.rect(2, 2, TILE - 4, TILE - 4, P.blueprintFill);
  // dashed frame reads as "planned, not built yet"
  for (let i = 0; i < TILE; i += 4) {
    c.hline(i, 1, 2, P.blueprint);
    c.hline(i, TILE - 2, 2, P.blueprint);
    c.vline(1, i, 2, P.blueprint);
    c.vline(TILE - 2, i, 2, P.blueprint);
  }
  c.line(6, 6, TILE - 7, TILE - 7, '#5ec8ff88');
  c.line(TILE - 7, 6, 6, TILE - 7, '#5ec8ff88');
  return c;
}

/** Granite block wall: the stone counterpart to the wooden one, and tougher. */
function stoneWallTile() {
  const c = new Canvas(TILE, TILE);
  c.fill(P.stone[0]);
  const block = (x, y, w, h) => {
    c.rect(x, y, w, h, P.stone[2]);
    c.hline(x, y, w, P.stone[3]);
    c.hline(x, y + h - 1, w, P.stone[0]);
    c.vline(x + w - 1, y, h, P.stone[0]);
  };
  let y = 1;
  let offset = 0;
  while (y < TILE - 1) {
    for (let x = -offset; x < TILE; x += 16) block(x + 1, y, 14, 9);
    y += 11;
    offset = offset === 0 ? 8 : 0;
  }
  c.strokeRect(0, 0, TILE, TILE, P.outline);
  return c;
}

/** Flagstones: irregular slabs, so it reads differently from the plank floor. */
function stoneFloorTile() {
  const c = new Canvas(TILE, TILE);
  const rnd = mulberry32(0x5107);
  c.fill(P.stone[1]);
  const slabs = [
    [1, 1, 14, 9],
    [16, 1, 15, 9],
    [1, 11, 10, 10],
    [12, 11, 19, 10],
    [1, 22, 18, 9],
    [20, 22, 11, 9],
  ];
  for (const [x, y, w, h] of slabs) {
    c.rect(x, y, w, h, P.stone[2]);
    c.hline(x, y, w, P.stone[3]);
    c.hline(x, y + h - 1, w, P.stone[0]);
    // a few speckles so the slabs are not flat colour
    for (let i = 0; i < 5; i++) {
      c.set(x + 1 + Math.floor(rnd() * (w - 2)), y + 1 + Math.floor(rnd() * (h - 2)), P.stone[1]);
    }
  }
  tileEdge(c, P.stone[0]);
  return c;
}

function floorTile() {
  const c = new Canvas(TILE, TILE);
  c.fill(P.plankMid);
  for (let y = 0; y < TILE; y += 8) {
    c.hline(0, y, TILE, P.plankDark);
    c.hline(0, y + 1, TILE, P.plankLight);
    const seam = y % 16 === 0 ? 10 : 22;
    c.vline(seam, y, 8, P.plankDark);
  }
  tileEdge(c, P.plankDark);
  return c;
}

function doorTile(open) {
  const c = new Canvas(TILE, TILE);
  // stone jambs on both sides
  c.rect(0, 0, 5, TILE, P.wallMid);
  c.rect(TILE - 5, 0, 5, TILE, P.wallMid);
  c.vline(4, 0, TILE, P.wallDark);
  c.vline(TILE - 5, 0, TILE, P.wallDark);
  if (open) {
    c.rect(5, 0, TILE - 10, TILE, '#231a12');
    c.rect(5, 0, 4, TILE, P.doorWoodDark);
    c.rect(TILE - 9, 0, 4, TILE, P.doorWoodDark);
  } else {
    c.rect(5, 0, TILE - 10, TILE, P.doorWood);
    for (let x = 7; x < TILE - 6; x += 5) c.vline(x, 1, TILE - 2, P.doorWoodDark);
    c.hline(5, 8, TILE - 10, P.doorWoodDark);
    c.hline(5, TILE - 9, TILE - 10, P.doorWoodDark);
    c.rect(TILE - 12, 15, 3, 3, P.metal);
  }
  c.strokeRect(0, 0, TILE, TILE, P.outline);
  return c;
}

function bedTile() {
  const c = new Canvas(TILE, TILE);
  c.rect(3, 2, 26, 28, P.bedFrame);
  c.rect(5, 4, 22, 24, P.bedSheet);
  c.rect(5, 4, 22, 7, '#ffffff');
  c.rect(6, 5, 20, 5, P.bedSheet);
  c.rect(5, 12, 22, 16, P.bedBlanket);
  c.hline(5, 12, 22, P.bedBlanketDark);
  c.hline(5, 20, 22, P.bedBlanketDark);
  c.rect(5, 27, 22, 1, P.bedBlanketDark);
  c.outline(P.outline);
  return c;
}

function farmTile(stage) {
  const c = new Canvas(TILE, TILE);
  const rnd = mulberry32(4000 + stage);
  c.fill(P.soil[1]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const r = rnd();
      if (r < 0.16) c.set(x, y, P.soil[0]);
      else if (r < 0.26) c.set(x, y, P.soil[2]);
    }
  }
  // furrows
  for (let y = 3; y < TILE; y += 8) {
    c.hline(0, y, TILE, P.soil[0]);
    c.hline(0, y + 1, TILE, P.soil[2]);
  }
  const rows = [6, 14, 22, 30];
  for (const y of rows) {
    for (let x = 4; x < TILE - 2; x += 7) {
      if (stage === 0) {
        c.set(x, y - 1, P.sprout);
        c.set(x, y - 2, P.sprout);
      } else if (stage === 1) {
        c.vline(x, y - 5, 5, P.crop);
        c.set(x - 1, y - 4, P.crop);
        c.set(x + 1, y - 3, P.crop);
      } else {
        c.vline(x, y - 7, 7, P.cropRipeDark);
        c.rect(x - 1, y - 9, 3, 4, P.cropRipe);
        c.set(x - 2, y - 7, P.cropRipeDark);
        c.set(x + 2, y - 7, P.cropRipeDark);
      }
    }
  }
  // full border: adjacent plots must read as separate plots, not one brown slab
  c.strokeRect(0, 0, TILE, TILE, '#3b2717');
  return c;
}

function storageMarker() {
  const c = new Canvas(TILE, TILE);
  // corner brackets only: it overlays the floor/terrain underneath
  const corners = [
    [0, 0, 1, 1],
    [TILE - 1, 0, -1, 1],
    [0, TILE - 1, 1, -1],
    [TILE - 1, TILE - 1, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    for (let i = 0; i < 9; i++) {
      c.set(x + dx * i, y, P.storage);
      c.set(x, y + dy * i, P.storage);
      c.set(x + dx * i, y + dy, '#c47a22');
      c.set(x + dx, y + dy * i, '#c47a22');
    }
  }
  for (let i = 2; i < TILE - 2; i += 6) {
    c.set(i, 0, '#f2a03d99');
    c.set(i, TILE - 1, '#f2a03d99');
    c.set(0, i, '#f2a03d99');
    c.set(TILE - 1, i, '#f2a03d99');
  }
  return c;
}

// --- resource icons (map drop + UI list) -----------------------------------
function woodIcon() {
  const c = new Canvas(TILE, TILE);
  const log = (x, y, w) => {
    c.rect(x, y, w, 7, P.wood[1]);
    c.hline(x, y, w, P.wood[2]);
    c.hline(x, y + 6, w, P.wood[3]);
    c.rect(x + w - 4, y + 1, 4, 5, P.wood[2]);
    c.rect(x + w - 3, y + 2, 2, 3, P.wood[3]);
  };
  log(6, 20, 20);
  log(4, 13, 20);
  log(9, 6, 18);
  c.outline(P.outline);
  return c;
}

function stoneIcon() {
  const c = new Canvas(TILE, TILE);
  const rock = (cx, cy, r) => {
    c.disc(cx, cy, r, P.ore[0]);
    c.disc(cx - 1, cy - 1, r - 1, P.ore[1]);
    c.disc(cx - 2, cy - 2, Math.max(1, r - 3), P.ore[2]);
  };
  rock(11, 21, 7);
  rock(22, 22, 5);
  rock(19, 12, 6);
  c.outline(P.outline);
  return c;
}

function foodIcon() {
  const c = new Canvas(TILE, TILE);
  const berry = (cx, cy, r) => {
    c.disc(cx, cy, r, P.food[0]);
    c.disc(cx - 1, cy - 1, r - 1, P.food[1]);
    c.disc(cx - 2, cy - 2, Math.max(1, r - 3), P.food[2]);
  };
  berry(12, 21, 7);
  berry(22, 20, 5);
  berry(19, 11, 6);
  // leaf
  c.disc(13, 8, 3, P.food[3]);
  c.disc(11, 7, 2, '#5fbf4a');
  c.line(15, 9, 18, 6, '#2f6b2e');
  c.outline(P.outline);
  return c;
}

// --- colonist --------------------------------------------------------------
// dir: 0=south(down) 1=west(left) 2=east(right) 3=north(up)
function drawColonist(c, ox, oy, dir, legPhase, armPhase = 0) {
  const put = (x, y, col) => c.set(ox + x, oy + y, col);
  const box = (x, y, w, h, col) => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) put(x + dx, y + dy, col);
  };

  const swing = [0, 1, 0, -1][legPhase];
  const side = dir === 1 || dir === 2;

  if (side) {
    // profile view: narrower silhouette, legs swing along the facing axis
    const f = dir === 2 ? 1 : -1; // +1 faces east, -1 faces west
    const mirror = (x) => (dir === 2 ? x : 31 - x);
    const sbox = (x, y, w, h, col) => {
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) put(mirror(x + dx), y + dy, col);
    };

    // back leg then front leg
    sbox(13 - swing, 23, 3, 5, P.pantsShade);
    sbox(13 - swing, 28, 5, 2, '#241a12');
    sbox(14 + swing, 23, 3, 5, P.pants);
    sbox(14 + swing, 28, 5, 2, P.boots);

    // torso (7px wide instead of 11px)
    sbox(12, 14, 8, 9, P.tunic);
    sbox(12, 14, 8, 1, P.tunicShade);
    sbox(19, 15, 1, 8, P.tunicShade);
    sbox(12, 21, 8, 2, P.pantsShade);

    // single visible arm, swinging opposite the legs
    const armX = 15 - swing * 2;
    sbox(armX, 15 + (armPhase === 1 ? 1 : 0), 3, 6, P.tunicShade);
    sbox(armX, 21 + (armPhase === 1 ? 1 : 0), 3, 2, P.skin);

    // head in profile: hair covers the back, face and nose point forward
    sbox(13, 6, 8, 9, P.skin);
    sbox(13, 6, 8, 3, P.hair);
    sbox(13, 6, 3, 8, P.hair);
    sbox(13, 13, 8, 1, P.skinShade);
    sbox(18, 9, 2, 2, P.eye);
    put(mirror(21), 10, P.skin);
    put(mirror(21), 11, P.skinShade);
    void f;
    return;
  }

  // legs (drawn first so the tunic overlaps them)
  box(12, 23, 4, 5 + (swing > 0 ? -1 : 0), P.pants);
  box(17, 23, 4, 5 + (swing < 0 ? -1 : 0), P.pantsShade);
  box(12, 27 + (swing > 0 ? -1 : 0), 4, 2, P.boots);
  box(17, 27 + (swing < 0 ? -1 : 0), 4, 2, P.boots);

  // torso
  box(11, 14, 11, 9, P.tunic);
  box(11, 14, 11, 1, P.tunicShade);
  box(11, 21, 11, 2, P.pantsShade);
  if (dir === 3) box(14, 15, 5, 6, P.tunicShade);

  // arms
  const armY = 15 + (armPhase === 1 ? 1 : 0);
  box(9, armY, 2, 6, P.tunic);
  box(22, armY - (armPhase === 1 ? 1 : 0), 2, 6, P.tunic);
  box(9, armY + 6, 2, 2, P.skin);
  box(22, armY + 5, 2, 2, P.skin);

  // head
  box(12, 6, 9, 9, dir === 3 ? P.hair : P.skin);
  if (dir !== 3) {
    box(12, 6, 9, 3, P.hair);
    put(12, 9, P.hair);
    put(20, 9, P.hair);
    box(12, 13, 9, 1, P.skinShade);
    box(14, 10, 2, 2, P.eye);
    box(18, 10, 2, 2, P.eye);
  } else {
    box(12, 12, 9, 2, P.hair);
  }
}

function colonistWalkSheet() {
  // 4 directions (rows) x 4 frames (columns), 32x32 cells => 128x128
  const sheet = new Canvas(TILE * 4, TILE * 4);
  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 4; frame++) {
      const cell = new Canvas(TILE, TILE);
      drawColonist(cell, 0, 0, dir, frame, frame % 2);
      cell.outline(P.outline);
      cell.blitTo(sheet, frame * TILE, dir * TILE);
    }
  }
  return sheet;
}

function colonistWorkSheet() {
  // 2 frames of a generic tool swing, reused by chop/mine/farm/build
  const sheet = new Canvas(TILE * 2, TILE);
  for (let frame = 0; frame < 2; frame++) {
    const cell = new Canvas(TILE, TILE);
    drawColonist(cell, 0, 0, 0, 0, 0);
    if (frame === 0) {
      // tool raised
      cell.rect(23, 6, 2, 10, P.iconWood);
      cell.rect(21, 4, 6, 3, P.iconMetal);
      cell.rect(21, 4, 6, 1, P.iconMetalDark);
      cell.rect(22, 13, 2, 4, P.skin);
    } else {
      // tool swung down
      cell.rect(23, 16, 2, 9, P.iconWood);
      cell.rect(21, 24, 6, 3, P.iconMetal);
      cell.rect(21, 26, 6, 1, P.iconMetalDark);
      cell.rect(22, 15, 2, 3, P.skin);
    }
    cell.outline(P.outline);
    cell.blitTo(sheet, frame * TILE, 0);
  }
  return sheet;
}

// --- UI icons (24x24) ------------------------------------------------------
const ICON = 24;

function iconChop() {
  // axe: fan-shaped blade on the left of the haft, distinct from the build hammer
  const c = new Canvas(ICON, ICON);
  c.line(9, 21, 17, 4, P.iconWood);
  c.line(10, 21, 18, 4, P.iconWoodDark);
  for (let i = 0; i < 9; i++) {
    const w = 3 + Math.round(Math.sin((i / 8) * Math.PI) * 4);
    c.hline(15 - w, 3 + i, w + 1, P.iconMetal);
    c.set(15 - w, 3 + i, '#eef1f7');
    c.set(15 - w + 1, 3 + i, '#eef1f7');
  }
  c.line(15, 3, 15, 11, P.iconMetalDark);
  c.outline(P.outline);
  return c;
}

function iconMine() {
  const c = new Canvas(ICON, ICON);
  c.line(6, 18, 16, 8, P.iconWood);
  c.line(7, 18, 17, 8, P.iconWoodDark);
  c.line(9, 8, 14, 3, P.iconMetal);
  c.line(14, 3, 20, 8, P.iconMetal);
  c.line(9, 9, 14, 4, P.iconMetalDark);
  c.line(14, 4, 20, 9, P.iconMetalDark);
  c.outline(P.outline);
  return c;
}

function iconFarm() {
  const c = new Canvas(ICON, ICON);
  c.rect(2, 17, 20, 5, P.soil[1]);
  c.hline(2, 17, 20, P.soil[0]);
  c.vline(12, 6, 11, '#3f8a3d');
  c.disc(8, 9, 3, P.sprout);
  c.disc(16, 7, 3, P.sprout);
  c.disc(12, 4, 3, P.crop);
  c.outline(P.outline);
  return c;
}

function iconBuild() {
  const c = new Canvas(ICON, ICON);
  c.line(7, 20, 15, 10, P.iconWood);
  c.line(8, 20, 16, 10, P.iconWoodDark);
  c.rect(11, 3, 10, 6, P.iconMetal);
  c.rect(11, 3, 10, 2, '#eef1f7');
  c.rect(11, 8, 10, 1, P.iconMetalDark);
  c.rect(14, 9, 4, 3, P.iconMetalDark);
  c.outline(P.outline);
  return c;
}

function iconDeconstruct() {
  const c = new Canvas(ICON, ICON);
  // a wall coming apart: three courses of brick with the top one falling away
  c.rect(3, 12, 15, 9, P.iconMetal);
  c.strokeRect(3, 12, 15, 9, P.iconMetalDark);
  c.hline(3, 16, 15, P.iconMetalDark);
  c.vline(10, 12, 9, P.iconMetalDark);
  c.rect(14, 4, 6, 5, P.iconMetal);
  c.strokeRect(14, 4, 6, 5, P.iconMetalDark);
  // the crowbar doing the work
  c.line(4, 9, 11, 3, P.iconWood);
  c.line(5, 9, 12, 3, P.iconWoodDark);
  c.outline(P.outline);
  return c;
}

function iconHaul() {
  const c = new Canvas(ICON, ICON);
  c.rect(3, 10, 13, 11, P.iconWood);
  c.strokeRect(3, 10, 13, 11, P.iconWoodDark);
  c.hline(3, 15, 13, P.iconWoodDark);
  c.vline(9, 10, 11, P.iconWoodDark);
  // motion arrow
  c.line(16, 6, 21, 6, P.storage);
  c.line(18, 3, 21, 6, P.storage);
  c.line(18, 9, 21, 6, P.storage);
  c.outline(P.outline);
  return c;
}

function iconHunger() {
  const c = new Canvas(ICON, ICON);
  // drumstick: high-saturation so it reads at 16px in the colonist tab
  c.disc(9, 8, 6, '#a83c22');
  c.disc(9, 8, 5, '#d6452f');
  c.disc(8, 6, 3, '#ef6a4c');
  c.set(7, 5, '#ff9478');
  // bone
  for (let i = 0; i < 8; i++) {
    c.set(12 + i, 11 + i, '#ede0c8');
    c.set(13 + i, 11 + i, '#ede0c8');
    c.set(14 + i, 11 + i, '#cbbda4');
  }
  c.disc(20, 19, 3, '#ede0c8');
  c.disc(19, 18, 2, '#ffffff');
  c.disc(22, 21, 2, '#cbbda4');
  c.outline(P.outline);
  return c;
}

function iconSleep() {
  const c = new Canvas(ICON, ICON);
  const z = (x, y, s, col) => {
    c.hline(x, y, s, col);
    c.line(x + s - 1, y, x, y + s - 1, col);
    c.hline(x, y + s - 1, s, col);
  };
  z(11, 2, 7, '#9ec9ff');
  z(4, 10, 9, '#5ec8ff');
  z(13, 14, 6, '#9ec9ff');
  c.outline(P.outline);
  return c;
}

// --- animals (docs/design-animals.md 9) ------------------------------------
// Each species is a 2-frame walk cycle facing right; the renderer mirrors the
// sprite for the other direction, which halves the art without halving the
// readability.
const A = {
  deerBody: '#a9713f',
  deerBelly: '#c98f58',
  deerDark: '#7d4f27',
  deerAntler: '#e0cba8',
  rabbitBody: '#b9ab97',
  rabbitBelly: '#ded4c2',
  rabbitDark: '#8a7d6b',
  boarBody: '#5e4a3c',
  boarBelly: '#7a6252',
  boarDark: '#3f3229',
  tusk: '#efe6cf',
  chickenBody: '#f2f0e6',
  chickenShade: '#d5d1c2',
  comb: '#d6452f',
  beak: '#e8b23c',
  wolfBody: '#7d848f',
  wolfBelly: '#a4abb5',
  wolfDark: '#575d67',
  eye: '#241a12',
};

/** Shared four-legged silhouette; species differ by palette and head shape. */
function quadruped(c, frame, opts) {
  const { body, belly, dark, bodyY = 14, bodyW = 17, bodyH = 8, legLength = 6, x0 = 5 } = opts;
  const swing = frame === 0 ? 1 : -1;

  // legs first so the body overlaps them
  const legTop = bodyY + bodyH - 2;
  const legs = [
    [x0 + 2, swing],
    [x0 + 5, -swing],
    [x0 + bodyW - 6, -swing],
    [x0 + bodyW - 3, swing],
  ];
  for (const [lx, phase] of legs) {
    c.rect(lx + (phase > 0 ? 1 : 0), legTop, 2, legLength, dark);
    c.rect(lx + (phase > 0 ? 1 : 0), legTop + legLength, 2, 1, '#2b2118');
  }

  // barrel
  c.rect(x0, bodyY, bodyW, bodyH, body);
  c.rect(x0 + 1, bodyY + bodyH - 3, bodyW - 2, 2, belly);
  c.hline(x0, bodyY, bodyW, dark);

  // head at the right end
  const headX = x0 + bodyW - 2;
  const headY = bodyY - opts.neck;
  c.rect(headX, headY, 7, 6, body);
  c.rect(headX + 5, headY + 2, 3, 3, opts.muzzle ?? body);
  c.rect(headX, headY - 1, 2, 2, dark); // ear
  c.set(headX + 5, headY + 2, A.eye);
  // neck
  c.rect(headX - 2, headY + 3, 4, opts.neck + 2, body);

  return { headX, headY, legTop };
}

function deerSheet() {
  const sheet = new Canvas(TILE * 2, TILE);
  for (let frame = 0; frame < 2; frame++) {
    const c = new Canvas(TILE, TILE);
    const { headX, headY } = quadruped(c, frame, {
      body: A.deerBody,
      belly: A.deerBelly,
      dark: A.deerDark,
      neck: 5,
      muzzle: A.deerDark,
    });
    // antlers
    c.vline(headX + 1, headY - 5, 4, A.deerAntler);
    c.set(headX, headY - 5, A.deerAntler);
    c.set(headX + 3, headY - 4, A.deerAntler);
    c.vline(headX + 3, headY - 4, 3, A.deerAntler);
    // white tail
    c.rect(3, 14, 3, 4, '#efe6cf');
    c.outline(P.outline);
    c.blitTo(sheet, frame * TILE, 0);
  }
  return sheet;
}

/** Small and low to the ground, with the ears doing the silhouette work. */
function rabbitSheet() {
  const sheet = new Canvas(TILE * 2, TILE);
  for (let frame = 0; frame < 2; frame++) {
    const c = new Canvas(TILE, TILE);
    const { headX, headY } = quadruped(c, frame, {
      body: A.rabbitBody,
      belly: A.rabbitBelly,
      dark: A.rabbitDark,
      neck: 1,
      bodyY: 18,
      bodyW: 11,
      bodyH: 6,
      legLength: 3,
      x0: 9,
      muzzle: A.rabbitDark,
    });
    // long ears
    c.vline(headX + 1, headY - 6, 6, A.rabbitBody);
    c.vline(headX + 3, headY - 5, 5, A.rabbitBody);
    c.set(headX + 1, headY - 6, A.rabbitDark);
    c.set(headX + 3, headY - 5, A.rabbitDark);
    // powder puff tail
    c.disc(9, 19, 2, A.rabbitBelly);
    c.outline(P.outline);
    c.blitTo(sheet, frame * TILE, 0);
  }
  return sheet;
}

function boarSheet() {
  const sheet = new Canvas(TILE * 2, TILE);
  for (let frame = 0; frame < 2; frame++) {
    const c = new Canvas(TILE, TILE);
    const { headX, headY } = quadruped(c, frame, {
      body: A.boarBody,
      belly: A.boarBelly,
      dark: A.boarDark,
      neck: 2,
      bodyH: 10,
      legLength: 4,
      muzzle: A.boarDark,
    });
    c.set(headX + 6, headY + 4, A.tusk); // tusk
    c.set(headX + 6, headY + 3, A.tusk);
    // bristles along the spine
    for (let i = 0; i < 6; i++) c.set(8 + i * 2, 12, A.boarDark);
    c.rect(3, 15, 2, 3, A.boarDark); // short tail
    c.outline(P.outline);
    c.blitTo(sheet, frame * TILE, 0);
  }
  return sheet;
}

function wolfSheet() {
  const sheet = new Canvas(TILE * 2, TILE);
  for (let frame = 0; frame < 2; frame++) {
    const c = new Canvas(TILE, TILE);
    const { headX, headY } = quadruped(c, frame, {
      body: A.wolfBody,
      belly: A.wolfBelly,
      dark: A.wolfDark,
      neck: 3,
      bodyH: 7,
      muzzle: A.wolfDark,
    });
    // snout and ear
    c.rect(headX + 7, headY + 3, 2, 2, A.wolfDark);
    c.set(headX + 1, headY - 2, A.wolfDark);
    // bushy tail, raised
    c.rect(2, 12, 4, 3, A.wolfBody);
    c.rect(1, 13, 3, 3, A.wolfDark);
    c.outline(P.outline);
    c.blitTo(sheet, frame * TILE, 0);
  }
  return sheet;
}

function chickenSheet() {
  const sheet = new Canvas(TILE * 2, TILE);
  for (let frame = 0; frame < 2; frame++) {
    const c = new Canvas(TILE, TILE);
    const swing = frame === 0 ? 1 : 0;
    // legs
    c.rect(13 + swing, 24, 1, 4, A.beak);
    c.rect(17 - swing, 24, 1, 4, A.beak);
    c.rect(12 + swing, 28, 3, 1, A.beak);
    c.rect(16 - swing, 28, 3, 1, A.beak);
    // body and tail
    c.disc(16, 20, 5, A.chickenBody);
    c.disc(17, 21, 4, A.chickenShade);
    c.rect(9, 16, 4, 3, A.chickenBody);
    // head
    c.disc(20, 14, 3, A.chickenBody);
    c.rect(19, 10, 3, 2, A.comb); // comb
    c.rect(23, 14, 3, 2, A.beak);
    c.set(21, 13, A.eye);
    c.outline(P.outline);
    c.blitTo(sheet, frame * TILE, 0);
  }
  return sheet;
}

function pastureMarker() {
  const c = new Canvas(TILE, TILE);
  // dashed green frame: pasture is marked ground, not a built structure
  for (let i = 0; i < TILE; i += 6) {
    c.hline(i, 0, 3, '#6bbf59');
    c.hline(i, TILE - 1, 3, '#6bbf59');
    c.vline(0, i, 3, '#6bbf59');
    c.vline(TILE - 1, i, 3, '#6bbf59');
  }
  // tuft of grass in the middle so an empty pasture still reads as one
  c.vline(15, 18, 5, '#4f9c3f');
  c.vline(17, 19, 4, '#4f9c3f');
  c.set(14, 19, '#63b356');
  c.set(18, 20, '#63b356');
  return c;
}

function iconHunt() {
  // bow and arrow: hunting is ranged in this build
  const c = new Canvas(ICON, ICON);
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const x = 7 + Math.round(Math.sin(t * Math.PI) * 5);
    c.set(x, 4 + i, P.iconWood);
    c.set(x + 1, 4 + i, P.iconWoodDark);
  }
  c.line(7, 4, 7, 19, '#cbbda4'); // string
  c.line(6, 12, 20, 12, P.iconWoodDark); // arrow
  c.line(17, 9, 21, 12, P.iconMetal);
  c.line(17, 15, 21, 12, P.iconMetal);
  c.outline(P.outline);
  return c;
}

function iconHandle() {
  // an open hand offering feed
  const c = new Canvas(ICON, ICON);
  c.rect(6, 12, 11, 7, '#e2ab7d');
  c.rect(6, 10, 2, 4, '#e2ab7d');
  c.rect(9, 8, 2, 6, '#e2ab7d');
  c.rect(12, 9, 2, 5, '#e2ab7d');
  c.rect(15, 11, 2, 3, '#e2ab7d');
  c.rect(6, 17, 11, 2, '#c48c60');
  // seeds in the palm
  c.set(10, 14, '#e8c34a');
  c.set(12, 15, '#e8c34a');
  c.set(14, 14, '#e8c34a');
  c.outline(P.outline);
  return c;
}

function iconHealth() {
  const c = new Canvas(ICON, ICON);
  c.disc(9, 9, 4, '#d6452f');
  c.disc(15, 9, 4, '#d6452f');
  for (let i = 0; i < 9; i++) {
    c.hline(4 + i, 10 + i, 17 - i * 2, '#d6452f');
  }
  c.disc(8, 8, 2, '#ef6a4c');
  c.outline(P.outline);
  return c;
}

// --- main ------------------------------------------------------------------
const written = [];
written.push(save('terrain/grass.png', grassTile()));
written.push(save('terrain/forest_1.png', forestTile(1)));
written.push(save('terrain/forest_2.png', forestTile(2)));
written.push(save('terrain/stone.png', stoneTile()));
written.push(save('buildings/wall.png', wallTile()));
written.push(save('buildings/wall_blueprint.png', wallBlueprint()));
written.push(save('buildings/floor.png', floorTile()));
written.push(save('buildings/stone_wall.png', stoneWallTile()));
written.push(save('buildings/stone_floor.png', stoneFloorTile()));
written.push(save('buildings/door_closed.png', doorTile(false)));
written.push(save('buildings/door_open.png', doorTile(true)));
written.push(save('buildings/bed.png', bedTile()));
written.push(save('buildings/farm_0.png', farmTile(0)));
written.push(save('buildings/farm_1.png', farmTile(1)));
written.push(save('buildings/farm_2.png', farmTile(2)));
written.push(save('buildings/storage_marker.png', storageMarker()));
written.push(save('resources/wood.png', woodIcon()));
written.push(save('resources/stone.png', stoneIcon()));
written.push(save('resources/food.png', foodIcon()));
written.push(save('colonist/walk.png', colonistWalkSheet()));
written.push(save('colonist/work.png', colonistWorkSheet()));
written.push(save('ui/job_chop.png', iconChop()));
written.push(save('ui/job_mine.png', iconMine()));
written.push(save('ui/job_farm.png', iconFarm()));
written.push(save('ui/job_build.png', iconBuild()));
written.push(save('ui/job_haul.png', iconHaul()));
written.push(save('ui/job_deconstruct.png', iconDeconstruct()));
written.push(save('ui/need_hunger.png', iconHunger()));
written.push(save('ui/need_sleep.png', iconSleep()));
written.push(save('animals/deer.png', deerSheet()));
written.push(save('animals/boar.png', boarSheet()));
written.push(save('animals/rabbit.png', rabbitSheet()));
written.push(save('animals/chicken.png', chickenSheet()));
written.push(save('animals/wolf.png', wolfSheet()));
written.push(save('buildings/pasture_marker.png', pastureMarker()));
written.push(save('ui/job_hunt.png', iconHunt()));
written.push(save('ui/job_handle.png', iconHandle()));
written.push(save('ui/need_health.png', iconHealth()));

console.log(`generated ${written.length} sprites into ${path.relative(process.cwd(), OUT_DIR)}`);
for (const name of written) console.log(`  ${name}`);
