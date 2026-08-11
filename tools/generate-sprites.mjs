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
  mana: ['#3b2a63', '#5b3fa0', '#8a5fd6', '#c9a6ff'],
  manaGlow: '#a97cff',
  // rust rather than metal: unmined iron reads as ore in the rock, and the
  // orange-brown keeps it apart from wood's warmer browns and stone's greys
  iron: ['#6b3a26', '#9c5030', '#c26a3c', '#e08d55'],
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

/** A low bush; `ripe` puts berries on it so the two states read apart. */
function berryBush(ripe) {
  const c = new Canvas(TILE, TILE);
  const rnd = mulberry32(ripe ? 0x8e11 : 0x8e10);
  for (let i = 0; i < 46; i++) {
    const cx = 6 + Math.floor(rnd() * 20);
    const cy = 12 + Math.floor(rnd() * 14);
    c.disc(cx, cy, 3 + Math.floor(rnd() * 2), rnd() < 0.5 ? P.forest[2] : P.forest[1]);
  }
  c.rect(15, 24, 2, 6, P.plankDark); // stem
  if (ripe) {
    for (let i = 0; i < 9; i++) {
      const bx = 8 + Math.floor(rnd() * 17);
      const by = 13 + Math.floor(rnd() * 11);
      c.disc(bx, by, 1, '#c8394f');
      c.set(bx, by - 1, '#e2637a');
    }
  }
  c.outline(P.outline);
  return c;
}

/**
 * Frostbloom (11章 フェーズ5). It has to read as "the berry bush's opposite" at
 * a glance: pale blue-white against the bush's green, upright spikes instead of
 * a round mass, and the bloomed state carries the mana violet so the one plant
 * that belongs to winter is visibly on the same side of the world as the
 * crystal.
 */
function frostbloom(bloomed) {
  const c = new Canvas(TILE, TILE);
  const rnd = mulberry32(bloomed ? 0x5f01 : 0x5f00);
  const leaf = '#7fa8bf';
  const leafDark = '#557d95';
  // A low rosette of frosted leaves, splayed from a single point. It has to
  // fill most of the tile: a dormant plant that is a few pale pixels is a plant
  // the player walks past all summer and cannot find when winter comes.
  for (let i = 0; i < 9; i++) {
    const angle = (i / 8) * Math.PI - Math.PI;
    const length = 11 + Math.floor(rnd() * 4);
    const ex = 16 + Math.round(Math.cos(angle) * length);
    const ey = 27 + Math.round(Math.sin(angle) * (length * 0.75));
    c.line(16, 28, ex, ey, i % 2 === 0 ? leaf : leafDark);
    c.set(ex, ey, leafDark);
    c.set(ex, ey - 1, leaf);
  }
  c.vline(16, 18, 11, leafDark); // stem
  if (bloomed) {
    // six-petalled flower, ice white with a violet heart
    const petals = [
      [16, 12],
      [12, 14],
      [20, 14],
      [12, 18],
      [20, 18],
      [16, 20],
    ];
    for (const [px, py] of petals) {
      c.disc(px, py, 3, '#e6f2ff');
      c.disc(px, py, 2, '#c3ddf2');
    }
    c.disc(16, 16, 3, P.mana[3]);
    c.disc(16, 16, 2, P.manaGlow);
    // frost specks around it, so a bloomed one reads even zoomed out
    for (let i = 0; i < 6; i++) {
      c.set(6 + Math.floor(rnd() * 21), 6 + Math.floor(rnd() * 8), '#e6f2ff');
    }
  } else {
    // dormant: a tight closed bud on the stem
    c.disc(16, 16, 4, leafDark);
    c.disc(16, 15, 3, leaf);
    c.set(16, 12, leafDark);
  }
  c.outline(P.outline);
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

// --- animals (docs/design-phase2.5-animals.md 9) ------------------------------------
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
  goatBody: '#d8d2c4',
  goatBelly: '#efeadd',
  goatDark: '#9d9587',
  goatHorn: '#7b6f5c',
  elkBody: '#b9c6cf',
  elkBelly: '#dde6ec',
  elkDark: '#8b98a3',
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

/**
 * The one large tameable animal, so a pen is worth the walls. Pale and blocky
 * where the deer is slender, with back-swept horns doing the silhouette.
 */
function goatSheet() {
  const sheet = new Canvas(TILE * 2, TILE);
  for (let frame = 0; frame < 2; frame++) {
    const c = new Canvas(TILE, TILE);
    const { headX, headY } = quadruped(c, frame, {
      body: A.goatBody,
      belly: A.goatBelly,
      dark: A.goatDark,
      neck: 3,
      bodyY: 14,
      bodyW: 14,
      bodyH: 8,
      muzzle: A.goatDark,
    });
    // horns swept back over the neck
    c.set(headX + 1, headY - 4, A.goatHorn);
    c.set(headX + 2, headY - 5, A.goatHorn);
    c.set(headX + 3, headY - 5, A.goatHorn);
    c.set(headX + 4, headY - 4, A.goatHorn);
    // beard
    c.vline(headX + 1, headY + 4, 3, A.goatDark);
    // short upright tail
    c.vline(3, 12, 3, A.goatBelly);
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

/**
 * Crystal elk (11章 フェーズ5). Built on the deer so the family resemblance is
 * the point, then everything that says "deer" is turned down and the antlers
 * are replaced with mana violet: at map zoom this reads as a pale deer with a
 * lit rack, which is exactly what it is.
 */
function crystalElkSheet() {
  const sheet = new Canvas(TILE * 2, TILE);
  for (let frame = 0; frame < 2; frame++) {
    const c = new Canvas(TILE, TILE);
    const { headX, headY } = quadruped(c, frame, {
      body: A.elkBody,
      belly: A.elkBelly,
      dark: A.elkDark,
      neck: 5,
      bodyY: 14,
      bodyW: 16,
      bodyH: 7,
      muzzle: A.elkDark,
    });
    // crystal antlers: taller and brighter than a deer's, in the mana palette
    for (const [ax, ay, h] of [
      [headX, -6, 5],
      [headX + 2, -8, 7],
      [headX + 4, -6, 5],
    ]) {
      c.vline(ax, headY + ay, h, P.mana[2]);
      c.set(ax, headY + ay, P.manaGlow);
    }
    c.set(headX + 1, headY - 7, P.mana[2]);
    c.set(headX + 3, headY - 7, P.mana[2]);
    // a seam of the same violet along the flank, so a tamed one in a pen still
    // reads as the crystal animal even with its head turned away
    c.hline(8, 16, 6, P.mana[2]);
    c.set(10, 15, P.manaGlow);
    c.outline(P.outline);
    c.blitTo(sheet, frame * TILE, 0);
  }
  return sheet;
}

/**
 * Rockeater (11章 フェーズ5). Low, wide and made of the terrain palette: the
 * silhouette should say "a piece of the rock face that moved" rather than
 * "animal", because that is how it behaves.
 */
function rockeaterSheet() {
  const sheet = new Canvas(TILE * 2, TILE);
  for (let frame = 0; frame < 2; frame++) {
    const c = new Canvas(TILE, TILE);
    const swing = frame === 0 ? 1 : -1;
    // six stubby legs, alternating
    for (let i = 0; i < 3; i++) {
      const lx = 6 + i * 7;
      c.rect(lx, 24 + (i % 2 === 0 ? swing : -swing), 3, 4, P.stone[0]);
    }
    // slab of a body, plated
    c.rect(4, 14, 24, 11, P.stone[1]);
    c.rect(5, 22, 22, 3, P.stone[0]);
    c.hline(4, 14, 24, P.stone[2]);
    for (let i = 0; i < 4; i++) {
      c.rect(6 + i * 6, 12, 5, 4, P.stone[2]); // shell plates along the back
      c.hline(6 + i * 6, 12, 5, P.stone[3]);
    }
    // blunt head at the right, all jaw
    c.rect(26, 18, 5, 7, P.stone[2]);
    c.rect(28, 21, 4, 3, P.stone[0]); // maw
    c.set(27, 19, A.eye);
    // grit it has been chewing, caught between the plates
    c.set(11, 16, P.ore[2]);
    c.set(20, 17, P.ore[1]);
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

// A face, because mood is the one gauge whose meaning is not obvious from a
// bar: the icon says which direction is good.
function iconMood() {
  const c = new Canvas(ICON, ICON);
  c.disc(12, 12, 9, '#e8c34a');
  c.disc(12, 11, 8, '#f2d97a');
  c.disc(9, 10, 1, '#3a2f14');
  c.disc(15, 10, 1, '#3a2f14');
  // a shallow smile: three rows narrowing towards the corners
  c.hline(9, 15, 7, '#3a2f14');
  c.hline(10, 16, 5, '#3a2f14');
  c.outline(P.outline);
  return c;
}


/**
 * A rock face with mana crystal in it. Read against stone.png it has to say
 * "same rock, something in it": the grey base is the stone tile's palette and
 * only the crystal itself carries the violet.
 */
function crystalTile() {
  const c = new Canvas(TILE, TILE);
  const rnd = mulberry32(0x0c1a);
  c.fill(P.stone[2]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const r = rnd();
      if (r < 0.18) c.set(x, y, P.stone[1]);
      else if (r < 0.24) c.set(x, y, P.stone[3]);
    }
  }
  for (const [cx, cy, r] of [
    [8, 10, 6],
    [24, 22, 5],
  ]) {
    c.disc(cx, cy, r, P.stone[1]);
    c.disc(cx - 1, cy - 1, r - 2, P.stone[3]);
  }
  // the vein: two shards and a seam running between them
  const shard = (cx, cy, h) => {
    c.line(cx, cy - h, cx - 3, cy, P.mana[1]);
    c.line(cx, cy - h, cx + 3, cy, P.mana[1]);
    c.line(cx - 3, cy, cx, cy + 3, P.mana[0]);
    c.line(cx + 3, cy, cx, cy + 3, P.mana[0]);
    for (let i = 0; i < h + 3; i++) c.hline(cx - 2, cy - h + i + 1, 4, P.mana[2]);
    c.vline(cx - 1, cy - h + 2, h, P.mana[3]);
  };
  shard(15, 18, 8);
  shard(22, 13, 5);
  c.line(15, 20, 22, 15, P.mana[0]);
  tileEdge(c, '#3c3c43');
  return c;
}

/**
 * A rock face with iron in it. Same statement as crystalTile - "same rock,
 * something in it" - but the something is rust-brown nuggets along a seam
 * rather than violet shards: iron is the ore you meet on the way in.
 */
function ironVeinTile() {
  const c = new Canvas(TILE, TILE);
  const rnd = mulberry32(0x1207);
  c.fill(P.stone[2]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const r = rnd();
      if (r < 0.18) c.set(x, y, P.stone[1]);
      else if (r < 0.24) c.set(x, y, P.stone[3]);
    }
  }
  for (const [cx, cy, r] of [
    [24, 8, 5],
    [7, 25, 5],
  ]) {
    c.disc(cx, cy, r, P.stone[1]);
    c.disc(cx - 1, cy - 1, r - 2, P.stone[3]);
  }
  // the seam: nuggets strung along a diagonal, rust with a lit top edge
  const nugget = (cx, cy, r) => {
    c.disc(cx, cy, r, P.iron[0]);
    c.disc(cx, cy - 1, Math.max(1, r - 1), P.iron[1]);
    c.disc(cx - 1, cy - 1, Math.max(1, r - 2), P.iron[2]);
    c.set(cx - 1, cy - 2, P.iron[3]);
  };
  c.line(8, 10, 24, 23, P.iron[0]);
  nugget(9, 11, 4);
  nugget(16, 16, 5);
  nugget(23, 22, 4);
  nugget(21, 27, 2);
  tileEdge(c, '#3c3c43');
  return c;
}

/** The mined iron stack, and the UI icon for the resource list. */
function ironIcon() {
  const c = new Canvas(TILE, TILE);
  const lump = (cx, cy, r) => {
    c.disc(cx, cy, r, P.iron[1]);
    c.disc(cx - 1, cy - 1, r - 1, P.iron[2]);
    c.disc(cx - 2, cy - 2, Math.max(1, r - 3), P.iron[3]);
  };
  lump(11, 21, 7);
  lump(22, 22, 5);
  lump(19, 12, 6);
  c.outline(P.outline);
  return c;
}

/** The mined stack, and the UI icon for the resource list. */
function crystalIcon() {
  const c = new Canvas(TILE, TILE);
  const shard = (cx, cy, h, w) => {
    for (let i = 0; i < h; i++) {
      const t = i / h;
      const half = Math.max(1, Math.round(w * (1 - Math.abs(t - 0.35) * 1.4)));
      c.hline(cx - half, cy - h + i, half * 2, P.mana[1]);
    }
    c.vline(cx - 1, cy - h + 2, h - 3, P.mana[2]);
    c.vline(cx - 2, cy - h + 4, h - 7, P.mana[3]);
  };
  shard(13, 26, 17, 5);
  shard(22, 27, 11, 4);
  c.outline(P.outline);
  return c;
}


/** The furnace: a stone housing with a crystal burning behind a grate. */
function manaFurnaceTile() {
  const c = new Canvas(TILE, TILE);
  c.fill(P.stone[1]);
  c.rect(2, 4, 28, 26, P.stone[2]);
  c.hline(2, 4, 28, P.stone[3]);
  // the mouth
  c.rect(9, 12, 14, 14, '#1a1420');
  c.disc(16, 20, 5, P.mana[1]);
  c.disc(16, 20, 3, P.mana[2]);
  c.disc(15, 19, 1, P.mana[3]);
  // grate bars
  for (let x = 10; x < 23; x += 4) c.vline(x, 12, 14, P.stone[0]);
  // chimney
  c.rect(11, 1, 10, 4, P.stone[0]);
  c.hline(11, 1, 10, P.stone[2]);
  c.strokeRect(0, 0, TILE, TILE, P.outline);
  return c;
}

/** The conduit: a channel in the floor, lit when it is carrying. */
function manaConduitTile(live) {
  const c = new Canvas(TILE, TILE);
  c.fill(P.stone[1]);
  c.rect(1, 1, 30, 30, P.stone[2]);
  c.rect(12, 0, 8, TILE, P.stone[0]);
  c.rect(0, 12, TILE, 8, P.stone[0]);
  const core = live ? P.mana[2] : P.mana[0];
  c.rect(14, 0, 4, TILE, core);
  c.rect(0, 14, TILE, 4, core);
  if (live) {
    c.vline(15, 0, TILE, P.mana[3]);
    c.hline(0, 15, TILE, P.mana[3]);
  }
  tileEdge(c, '#3c3c43');
  return c;
}

/** The lamp: a crystal on a post, dark until the grid feeds it. */
function manaLampTile(lit) {
  const c = new Canvas(TILE, TILE);
  // post
  c.rect(14, 16, 4, 13, P.stone[0]);
  c.rect(11, 28, 10, 3, P.stone[2]);
  // head
  c.disc(16, 12, 6, P.stone[0]);
  c.disc(16, 12, 5, lit ? P.mana[2] : P.mana[0]);
  c.disc(16, 12, 3, lit ? P.mana[3] : P.mana[1]);
  if (lit) {
    // a soft halo, drawn as a ring rather than a blur the palette cannot do
    c.disc(16, 12, 9, '#a97cff33');
    c.disc(16, 12, 7, '#a97cff55');
    c.disc(16, 12, 5, P.mana[3]);
  }
  c.outline(P.outline);
  return c;
}


/** The extractor: a drill head on a mana-fed frame, biting into the rock. */
function manaExtractorTile(running) {
  const c = new Canvas(TILE, TILE);
  c.fill(P.stone[1]);
  c.rect(2, 6, 28, 24, P.stone[2]);
  c.hline(2, 6, 28, P.stone[3]);
  c.hline(2, 29, 28, P.stone[0]);
  // the mana feed running up the side
  c.rect(4, 8, 3, 20, running ? P.mana[2] : P.mana[0]);
  if (running) c.vline(5, 8, 20, P.mana[3]);
  // drill: a stubby cone pointing right, with a bit at the tip
  c.rect(10, 14, 12, 8, P.stone[0]);
  c.hline(10, 14, 12, P.stone[3]);
  for (let i = 0; i < 6; i++) c.hline(22 + i, 15 + i, 6 - i, P.iconMetal);
  for (let i = 0; i < 6; i++) c.hline(22 + i, 20 - i, 6 - i, P.iconMetalDark);
  c.disc(16, 18, 3, running ? P.mana[2] : P.stone[2]);
  if (running) c.disc(16, 18, 2, P.mana[3]);
  // spoil at the foot
  c.disc(7, 27, 2, P.ore[1]);
  c.disc(11, 28, 2, P.ore[0]);
  c.strokeRect(0, 0, TILE, TILE, P.outline);
  return c;
}


/** The hearth: a ring of stones with a fire in it, and a log to sit on. */
function hearthTile() {
  const c = new Canvas(TILE, TILE);
  // ring of stones
  const ring = [
    [16, 6], [22, 8], [25, 14], [24, 21], [16, 25], [8, 21], [7, 14], [10, 8],
  ];
  for (const [x, y] of ring) {
    c.disc(x, y, 3, P.stone[1]);
    c.disc(x - 1, y - 1, 2, P.stone[3]);
  }
  // logs
  c.line(11, 19, 21, 12, P.trunk[0]);
  c.line(11, 12, 21, 19, P.trunk[1]);
  // flame: three tapering tongues
  const flame = (cx, base, h, colour) => {
    for (let i = 0; i < h; i++) {
      const w = Math.max(1, Math.round((h - i) / 2));
      c.hline(cx - w, base - i, w * 2, colour);
    }
  };
  flame(16, 19, 11, '#d6452f');
  flame(16, 18, 8, '#ef8a2c');
  flame(15, 16, 5, '#e8c34a');
  c.set(16, 9, '#fff0b8');
  c.outline(P.outline);
  return c;
}


// --- furniture (design-phase10-ores.md 4章) --------------------------------
// All five read top-down like the bed: warm plank browns for the wooden
// pieces so they sit in the bed/floor family, iron fittings in the metal
// greys where the build cost says iron, and the statue in the stone palette
// because that is what it is made of.

/** The table: a plank top on four legs, iron brackets at the corners. */
function tableTile() {
  const c = new Canvas(TILE, TILE);
  // legs first, peeking out at the corners
  for (const [x, y] of [
    [4, 4],
    [24, 4],
    [4, 24],
    [24, 24],
  ]) {
    c.rect(x, y, 4, 4, P.plankDark);
  }
  // the top overlaps them: one broad slab of planks
  c.rect(3, 6, 26, 20, P.plankMid);
  c.hline(3, 6, 26, P.plankLight);
  c.hline(3, 25, 26, P.plankDark);
  for (let y = 10; y < 25; y += 5) c.hline(3, y, 26, P.plankDark);
  c.vline(3, 6, 20, P.plankLight);
  c.vline(28, 6, 20, P.plankDark);
  // iron corner brackets: the 2 iron the build cost asks for, visible
  for (const [x, y] of [
    [4, 7],
    [25, 7],
    [4, 22],
    [25, 22],
  ]) {
    c.rect(x, y, 3, 3, P.iconMetal);
    c.set(x + 2, y + 2, P.iconMetalDark);
  }
  c.outline(P.outline);
  return c;
}

/** The stool: a small round seat, low enough to tuck under the table. */
function stoolTile() {
  const c = new Canvas(TILE, TILE);
  // three legs splayed out under the seat
  c.rect(10, 20, 3, 7, P.plankDark);
  c.rect(19, 20, 3, 7, P.plankDark);
  c.rect(15, 22, 3, 6, P.plankDark);
  // the seat: a disc of planks with a lit rim
  c.disc(16, 14, 8, P.plankDark);
  c.disc(16, 13, 7, P.plankMid);
  c.disc(15, 12, 5, P.plankLight);
  c.hline(10, 13, 12, P.plankDark);
  c.hline(10, 16, 13, P.plankDark);
  c.outline(P.outline);
  return c;
}

/** The dresser: a two-door cabinet, iron hinges and handles. */
function dresserTile() {
  const c = new Canvas(TILE, TILE);
  // carcass
  c.rect(3, 3, 26, 26, P.plankMid);
  c.hline(3, 3, 26, P.plankLight);
  c.hline(3, 28, 26, P.plankDark);
  c.vline(3, 3, 26, P.plankLight);
  c.vline(28, 3, 26, P.plankDark);
  // two door panels with a shadow line between them
  c.rect(6, 6, 9, 20, P.plankLight);
  c.rect(17, 6, 9, 20, P.plankLight);
  c.strokeRect(6, 6, 9, 20, P.plankDark);
  c.strokeRect(17, 6, 9, 20, P.plankDark);
  c.vline(16, 5, 22, P.plankDark);
  // iron hinges on the outer edges and a handle on each door: the 4 iron
  for (const y of [8, 22]) {
    c.rect(6, y, 2, 3, P.iconMetal);
    c.rect(24, y, 2, 3, P.iconMetal);
  }
  c.rect(13, 14, 2, 4, P.iconMetal);
  c.rect(17, 14, 2, 4, P.iconMetalDark);
  c.outline(P.outline);
  return c;
}

/** The armchair: a cushioned seat with a back and two arms, facing south. */
function armchairTile() {
  const c = new Canvas(TILE, TILE);
  // back rail, tallest part
  c.rect(6, 4, 20, 7, P.bedBlanketDark);
  c.rect(7, 5, 18, 5, P.bedBlanket);
  // arms down both sides
  c.rect(4, 8, 5, 18, P.bedBlanketDark);
  c.rect(23, 8, 5, 18, P.bedBlanketDark);
  c.rect(5, 9, 3, 15, P.bedBlanket);
  c.rect(24, 9, 3, 15, P.bedBlanket);
  // the seat cushion between them
  c.rect(9, 11, 14, 13, P.bedBlanket);
  c.hline(9, 11, 14, P.bedSheet);
  c.hline(9, 18, 14, P.bedBlanketDark); // seam where the cushion folds
  c.rect(9, 24, 14, 3, P.bedBlanketDark);
  // wooden feet
  c.rect(5, 26, 4, 3, P.plankDark);
  c.rect(23, 26, 4, 3, P.plankDark);
  c.outline(P.outline);
  return c;
}

/** The statue: a stone figure on a plinth - the quarry's surplus, upright. */
function statueTile() {
  const c = new Canvas(TILE, TILE);
  // plinth
  c.rect(7, 24, 18, 6, P.stone[1]);
  c.hline(7, 24, 18, P.stone[3]);
  c.hline(7, 29, 18, P.stone[0]);
  c.rect(10, 21, 12, 3, P.stone[2]);
  // body: a robed figure, arms folded
  c.rect(12, 10, 8, 11, P.stone[2]);
  c.vline(12, 10, 11, P.stone[3]); // lit edge
  c.vline(19, 10, 11, P.stone[0]); // shadowed edge
  c.hline(12, 15, 8, P.stone[0]); // folded arms
  c.hline(13, 16, 6, P.stone[1]);
  // head
  c.disc(16, 7, 3, P.stone[2]);
  c.set(14, 6, P.stone[3]);
  // a little moss at the base so it reads as a fixture, not a person
  c.set(9, 28, P.grass[2]);
  c.set(23, 28, P.grass[1]);
  c.outline(P.outline);
  return c;
}

// --- research (11章 フェーズ12, design-phase12-research.md) -----------------

/** The research desk: a plank lectern with an open book laid across it. */
function researchDeskTile() {
  const c = new Canvas(TILE, TILE);
  // legs
  for (const [x, y] of [
    [5, 22],
    [24, 22],
  ]) {
    c.rect(x, y, 3, 7, P.plankDark);
  }
  // the desktop
  c.rect(3, 14, 26, 10, P.plankMid);
  c.hline(3, 14, 26, P.plankLight);
  c.hline(3, 23, 26, P.plankDark);
  c.vline(3, 14, 10, P.plankLight);
  c.vline(28, 14, 10, P.plankDark);
  // the open book: two pages meeting at a spine
  c.rect(8, 8, 8, 11, '#ede0c8');
  c.rect(16, 8, 8, 11, '#ded1b8');
  c.vline(16, 8, 11, P.plankDark);
  for (let y = 10; y < 18; y += 3) {
    c.hline(9, y, 6, '#cbbda4');
    c.hline(17, y, 6, '#cbbda4');
  }
  // a candle standing beside it, so a night shift at the desk reads at a glance
  c.rect(23, 5, 2, 8, '#ede0c8');
  c.disc(24, 4, 2, '#e8c34a');
  c.set(24, 3, '#ff9478');
  c.outline(P.outline);
  return c;
}

/** The research job icon: an open book, matching the desk it targets. */
function iconResearch() {
  const c = new Canvas(ICON, ICON);
  c.rect(3, 6, 8, 13, '#ede0c8');
  c.rect(12, 6, 8, 13, '#ded1b8');
  c.vline(12, 6, 13, P.iconWoodDark);
  for (let y = 9; y < 17; y += 3) {
    c.hline(5, y, 5, '#cbbda4');
    c.hline(13, y, 5, '#cbbda4');
  }
  c.hline(3, 5, 17, P.iconWoodDark);
  c.outline(P.outline);
  return c;
}


/** The workbench (design-next 提案3): a heavy bench top with a cleaver and a
 *  chopping board - the entrance to second-stage goods. */
function workbenchTile() {
  const c = new Canvas(TILE, TILE);
  // legs at the corners, like the table but stouter
  for (const [x, y] of [
    [4, 6],
    [23, 6],
    [4, 23],
    [23, 23],
  ]) {
    c.rect(x, y, 5, 5, P.plankDark);
  }
  // the bench top: thicker than the table, scarred by use
  c.rect(2, 7, 28, 18, P.plankMid);
  c.hline(2, 7, 28, P.plankLight);
  c.hline(2, 24, 28, P.plankDark);
  c.vline(2, 7, 18, P.plankLight);
  c.vline(29, 7, 18, P.plankDark);
  // knife scars across the working half
  c.hline(5, 12, 6, P.plankDark);
  c.hline(7, 15, 5, P.plankDark);
  c.hline(4, 18, 7, P.plankDark);
  // the chopping board, offset to the right
  c.rect(17, 10, 10, 9, '#ded1b8');
  c.hline(17, 10, 10, '#ede0c8');
  // the cleaver on the board: iron blade, wooden grip
  c.rect(19, 12, 5, 3, P.iconMetal);
  c.set(24, 13, P.iconMetalDark);
  c.rect(24, 14, 3, 2, P.plankDark);
  c.outline(P.outline);
  return c;
}

/** The craft column icon: the cleaver over the board, readable at 22px. */
function iconCraft() {
  const c = new Canvas(ICON, ICON);
  // the board
  c.rect(3, 8, 16, 10, '#ded1b8');
  c.hline(3, 8, 16, '#ede0c8');
  c.hline(3, 17, 16, '#cbbda4');
  // the cleaver: broad blade, short grip
  c.rect(5, 10, 8, 5, P.iconMetal);
  c.hline(5, 14, 8, P.iconMetalDark);
  c.rect(13, 11, 4, 3, P.plankDark);
  c.outline(P.outline);
  return c;
}

/** A raider: the colonist silhouette in dark colours with a blade. */
function raiderSheet() {
  const sheet = new Canvas(TILE * 2, TILE);
  for (let frame = 0; frame < 2; frame++) {
    const c = new Canvas(TILE, TILE);
    // body, deliberately the same build as a colonist so the threat reads as
    // "people" rather than "monster"
    c.rect(12, 12, 8, 11, '#3a3340');
    c.rect(12, 12, 8, 3, '#4a4250');
    c.rect(13, 23, 3, 6, '#241f28');
    c.rect(17, 23, 3, 6, '#241f28');
    c.disc(16, 9, 5, P.skinShade);
    c.rect(11, 4, 10, 4, '#5a2030'); // red headband
    c.set(14, 9, P.eye);
    c.set(18, 9, P.eye);
    // blade, swinging on the second frame
    const bx = frame === 0 ? 22 : 24;
    c.line(bx, 18, bx + 4, 8 + frame * 4, P.iconMetal);
    c.line(bx + 1, 18, bx + 5, 9 + frame * 4, P.iconMetalDark);
    c.rect(bx - 1, 17, 3, 3, P.trunk[0]);
    c.outline(P.outline);
    c.blitTo(sheet, frame * TILE, 0);
  }
  return sheet;
}

/** The turret: a mana-fed emplacement. Dark until the grid feeds it. */
function manaTurretTile(live) {
  const c = new Canvas(TILE, TILE);
  c.disc(16, 22, 10, P.stone[1]);
  c.disc(16, 21, 9, P.stone[2]);
  c.hline(7, 13, 18, P.stone[3]);
  // barrel
  c.rect(14, 4, 5, 16, P.stone[0]);
  c.vline(15, 4, 16, P.stone[2]);
  c.disc(16, 5, 3, live ? P.mana[2] : P.stone[1]);
  if (live) {
    c.disc(16, 5, 2, P.mana[3]);
    c.disc(16, 22, 4, P.mana[1]);
    c.disc(16, 22, 2, P.mana[2]);
  } else {
    c.disc(16, 22, 3, P.mana[0]);
  }
  c.strokeRect(0, 0, TILE, TILE, P.outline);
  return c;
}


/** The trading post: a plank counter with an awning. */
function tradingPostTile() {
  const c = new Canvas(TILE, TILE);
  // counter
  c.rect(3, 17, 26, 10, P.plankMid);
  c.hline(3, 17, 26, P.plankLight);
  c.hline(3, 26, 26, P.plankDark);
  for (let x = 6; x < 29; x += 6) c.vline(x, 18, 8, P.plankDark);
  // posts and awning
  c.rect(3, 6, 2, 12, P.trunk[0]);
  c.rect(27, 6, 2, 12, P.trunk[0]);
  for (let i = 0; i < 5; i++) {
    c.rect(2 + i * 6, 4, 3, 5, i % 2 === 0 ? '#c2543f' : '#e8d9b8');
    c.rect(5 + i * 6, 4, 3, 5, i % 2 === 0 ? '#e8d9b8' : '#c2543f');
  }
  c.hline(2, 3, 28, P.trunk[1]);
  // a crate and a sack on the counter
  c.rect(7, 12, 7, 6, P.plankDark);
  c.hline(7, 12, 7, P.plankMid);
  c.disc(21, 15, 4, '#cbbda4');
  c.disc(21, 14, 3, '#ded6c2');
  c.outline(P.outline);
  return c;
}

/** A trader: a colonist silhouette in a travelling cloak, with a pack. */
function traderSheet() {
  const sheet = new Canvas(TILE * 2, TILE);
  for (let frame = 0; frame < 2; frame++) {
    const c = new Canvas(TILE, TILE);
    const cloak = frame === 0 ? '#3f6bb8' : '#456fbd';
    c.rect(11, 11, 10, 13, cloak);
    c.rect(11, 11, 10, 3, '#2f4f8c');
    c.rect(13, 24, 3, 5, P.boots);
    c.rect(17, 24, 3, 5, P.boots);
    c.disc(16, 8, 5, P.skin);
    c.rect(10, 3, 12, 3, '#2f4f8c'); // wide brim
    c.set(14, 8, P.eye);
    c.set(18, 8, P.eye);
    // pack on the back, and a staff that sways a pixel between frames
    c.rect(6, 13, 6, 8, P.plankDark);
    c.hline(6, 13, 6, P.plankMid);
    c.vline(24 + frame, 8, 18, P.trunk[0]);
    c.outline(P.outline);
    c.blitTo(sheet, frame * TILE, 0);
  }
  return sheet;
}

// --- main ------------------------------------------------------------------
const written = [];
written.push(save('terrain/grass.png', grassTile()));
written.push(save('terrain/forest_1.png', forestTile(1)));
written.push(save('terrain/forest_2.png', forestTile(2)));
written.push(save('terrain/stone.png', stoneTile()));
written.push(save('terrain/crystal.png', crystalTile()));
written.push(save('terrain/iron_vein.png', ironVeinTile()));
written.push(save('buildings/wall.png', wallTile()));
written.push(save('buildings/wall_blueprint.png', wallBlueprint()));
written.push(save('buildings/floor.png', floorTile()));
written.push(save('buildings/berry_bare.png', berryBush(false)));
written.push(save('buildings/berry_ripe.png', berryBush(true)));
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
written.push(save('resources/mana_crystal.png', crystalIcon()));
written.push(save('resources/iron.png', ironIcon()));
written.push(save('buildings/mana_furnace.png', manaFurnaceTile()));
written.push(save('buildings/mana_conduit.png', manaConduitTile(false)));
written.push(save('buildings/mana_conduit_live.png', manaConduitTile(true)));
written.push(save('buildings/mana_lamp.png', manaLampTile(false)));
written.push(save('buildings/mana_lamp_lit.png', manaLampTile(true)));
written.push(save('buildings/mana_extractor.png', manaExtractorTile(false)));
written.push(save('buildings/mana_extractor_run.png', manaExtractorTile(true)));
written.push(save('buildings/hearth.png', hearthTile()));
written.push(save('buildings/table.png', tableTile()));
written.push(save('buildings/stool.png', stoolTile()));
written.push(save('buildings/dresser.png', dresserTile()));
written.push(save('buildings/armchair.png', armchairTile()));
written.push(save('buildings/statue.png', statueTile()));
written.push(save('buildings/research_desk.png', researchDeskTile()));
written.push(save('buildings/workbench.png', workbenchTile()));
written.push(save('raiders/raider.png', raiderSheet()));
written.push(save('buildings/mana_turret.png', manaTurretTile(false)));
written.push(save('buildings/mana_turret_live.png', manaTurretTile(true)));
written.push(save('buildings/trading_post.png', tradingPostTile()));
written.push(save('raiders/trader.png', traderSheet()));
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
written.push(save('animals/goat.png', goatSheet()));
written.push(save('animals/wolf.png', wolfSheet()));
written.push(save('animals/crystal_elk.png', crystalElkSheet()));
written.push(save('animals/rockeater.png', rockeaterSheet()));
written.push(save('buildings/frostbloom_bare.png', frostbloom(false)));
written.push(save('buildings/frostbloom_bloom.png', frostbloom(true)));
written.push(save('buildings/pasture_marker.png', pastureMarker()));
written.push(save('ui/job_hunt.png', iconHunt()));
written.push(save('ui/job_handle.png', iconHandle()));
written.push(save('ui/job_research.png', iconResearch()));
written.push(save('ui/job_craft.png', iconCraft()));
written.push(save('ui/need_health.png', iconHealth()));
written.push(save('ui/need_mood.png', iconMood()));

console.log(`generated ${written.length} sprites into ${path.relative(process.cwd(), OUT_DIR)}`);
for (const name of written) console.log(`  ${name}`);
