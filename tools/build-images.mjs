#!/usr/bin/env node
/* Hidden on Earth image pipeline.

   Reads the game's levels.json and the source paintings next to it, and writes every
   derivative the web game and the site need:

     card   320px long edge   picker cards, sticker-book slots
     fit   1280px long edge   first paint, phones at scale 1
     play  2048px long edge   the default playing image (bundled in the app shells)
     zoom  3200px long edge   swapped in past ~1.6x zoom, fetched on demand
     thumb  128px square      one per item group, the HUD card picture (ItemGroup.thumbRect)
     sticker 384px square     the detail earned for finishing (Level.stickerRect)

   card, fit, thumb and sticker come as AVIF (primary) and WebP (fallback); play and zoom are
   AVIF only, since every current browser decodes it and a browser that cannot still plays at
   fit. File names carry a hash of their own bytes, so they can be served immutable forever
   and a changed source never collides with a cached copy. Nothing is ever upscaled: a source shorter than a tier gets that tier at its own
   size, and a tier that would repeat the previous one reuses its file.

   The manifest (assets/paintings.json by default) lists every output with its pixel size and
   byte count, plus each level's aspect and source hash. A level whose source and encoder
   settings are unchanged is skipped on the next run, so re-running is cheap.

   Levels in a personal collection (`"personal": true` in levels.json, the family's own
   drawings) are skipped unless --include-private is given. This repository is public; those
   pictures are not. Generate them with --include-private --out <dir> into the app bundle.

   Usage:
     node tools/build-images.mjs [--levels ../seek-and-find/SeekAndFind/Resources/levels.json]
                                 [--art <dir, default: beside levels.json>]
                                 [--out assets/img] [--manifest assets/paintings.json]
                                 [--only <level id>]... [--include-private] [--force]
*/
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TIERS = { card: 320, fit: 1280, play: 2048, zoom: 3200 };
export const THUMB_PX = 128;
export const STICKER_PX = 384;
export const FORMATS = ['avif', 'webp'];
/* Which formats each tier carries. The big tiers are AVIF only: the WebP copies were 60% of
   the catalog's bytes for browsers that no longer exist in number. */
export const TIER_FORMATS = { card: FORMATS, fit: FORMATS, play: ['avif'], zoom: ['avif'] };
export const formatsOf = (entry) => FORMATS.filter((f) => entry[f]);

/* Encoder settings. Bump SETTINGS_VERSION when these change so every level is re-encoded. */
const SETTINGS_VERSION = 1;
/* Measured on the densest painting (Rousseau's jungle): AVIF q50 gives card 14 KB, fit 101 KB,
   play 190 KB, zoom 389 KB, which is the plan's budget. Effort 5 is the speed/size knee. The small
   crops are shown at 1:1 or larger, so they get more quality and full chroma. */
const AVIF = { quality: 50, effort: 5, chromaSubsampling: '4:2:0' };
const AVIF_SMALL = { quality: 60, effort: 6, chromaSubsampling: '4:4:4' };   // thumbs, stickers
const WEBP = { quality: 76, effort: 5 };
const WEBP_SMALL = { quality: 82, effort: 6 };
const SETTINGS_KEY = `v${SETTINGS_VERSION}/avif${AVIF.quality}-${AVIF_SMALL.quality}/webp${WEBP.quality}-${WEBP_SMALL.quality}`;

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const a = {
    levels: path.resolve(REPO, '../seek-and-find/SeekAndFind/Resources/levels.json'),
    art: null,
    out: path.resolve(REPO, 'assets/img'),
    manifest: path.resolve(REPO, 'assets/paintings.json'),
    only: [],
    includePrivate: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--levels') { a.levels = path.resolve(v); i++; }
    else if (k === '--art') { a.art = path.resolve(v); i++; }
    else if (k === '--out') { a.out = path.resolve(v); i++; }
    else if (k === '--manifest') { a.manifest = path.resolve(v); i++; }
    else if (k === '--only') { a.only.push(v); i++; }
    else if (k === '--include-private') a.includePrivate = true;
    else if (k === '--force') a.force = true;
    else if (k === '--help' || k === '-h') { console.log(usage()); process.exit(0); }
    else throw new Error(`unknown argument ${k}`);
  }
  if (!a.art) a.art = path.join(path.dirname(a.levels), 'Art');
  return a;
}

function usage() {
  return 'node tools/build-images.mjs [--levels <levels.json>] [--art <dir>] [--out <dir>] ' +
    '[--manifest <file>] [--only <id>]... [--include-private] [--force]';
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const exists = (p) => fs.access(p).then(() => true, () => false);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/* Mirrors ItemGroup.thumbRect(aspectRatio:) in Level.swift: the explicit crop, or a box 2.2
   radii wide around the first target, made square on screen. */
export function thumbRect(group, aspectRatio) {
  if (group.thumb) return group.thumb;
  const t = group.targets && group.targets[0];
  if (!t) return { x: 0, y: 0, w: 0.1, h: 0.1 };
  const r = t.r ?? 0.05;
  const w = r * 2.2, h = w * aspectRatio;
  return { x: t.x - w / 2, y: t.y - h / 2, w, h };
}

/* Mirrors Level.stickerRect. */
export function stickerRect(level, aspectRatio) {
  if (level.sticker) return level.sticker;
  if (level.items && level.items[0]) return thumbRect(level.items[0], aspectRatio);
  return { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
}

/* A normalized rect to a pixel box inside the image, as CGRect.intersection does. */
function pixelBox(rect, W, H) {
  const x0 = clamp01(rect.x), y0 = clamp01(rect.y);
  const x1 = clamp01(rect.x + rect.w), y1 = clamp01(rect.y + rect.h);
  const left = Math.round(x0 * W), top = Math.round(y0 * H);
  const width = Math.max(1, Math.round(x1 * W) - left);
  const height = Math.max(1, Math.round(y1 * H) - top);
  return { left, top, width, height };
}

/* The size a tier comes out at: long edge = min(tier, source), aspect kept, never enlarged.
   The short edge is the rounded ideal; the encoder's own rounding may differ by one pixel. */
export function tierSize(tier, W, H) {
  const long = Math.max(W, H);
  if (long <= TIERS[tier]) return { w: W, h: H };
  const s = TIERS[tier] / long;
  return W >= H
    ? { w: TIERS[tier], h: Math.round(H * s) }
    : { w: Math.round(W * s), h: TIERS[tier] };
}

async function encode(pipeline, format, small) {
  const p = pipeline.clone();
  const out = format === 'avif' ? p.avif(small ? AVIF_SMALL : AVIF) : p.webp(small ? WEBP_SMALL : WEBP);
  const { data, info } = await out.toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

async function writeVariants(outDir, relDir, stem, pipeline, small, formats = FORMATS) {
  const entry = {};
  for (const format of formats) {
    const { data, w, h } = await encode(pipeline, format, small);
    const name = `${stem}.${sha(data).slice(0, 10)}.${format}`;
    await fs.writeFile(path.join(outDir, relDir, name), data);
    entry[format] = { path: `${relDir}/${name}`, bytes: data.length };
    entry.w = w; entry.h = h;
  }
  return entry;
}

function levelPaths(entry) {
  const paths = [];
  for (const t of Object.values(entry.tiers)) for (const f of formatsOf(t)) paths.push(t[f].path);
  for (const t of Object.values(entry.thumbs)) for (const f of formatsOf(t)) paths.push(t[f].path);
  for (const f of formatsOf(entry.sticker)) paths.push(entry.sticker[f].path);
  return paths;
}

function referencedPaths(manifest) {
  const set = new Set();
  for (const lvl of Object.values(manifest.levels)) for (const p of levelPaths(lvl)) set.add(p);
  return set;
}

async function allFilesExist(outDir, entry) {
  const checks = await Promise.all(levelPaths(entry).map((p) => exists(path.join(outDir, p))));
  return checks.every(Boolean);
}

/* A previous entry may carry a format a tier no longer ships (the WebP play and zoom of the
   first build). Drop it from the entry; prune removes the file. The AVIF it keeps is unchanged,
   so nothing re-encodes. */
function dropRetiredFormats(entry) {
  for (const [tier, t] of Object.entries(entry.tiers)) {
    for (const f of FORMATS) if (t[f] && !TIER_FORMATS[tier].includes(f)) delete t[f];
  }
  return entry;
}

async function buildLevel(level, args, previous) {
  const id = level.id;
  const srcPath = (await exists(path.join(args.art, `${level.imageName}.jpg`)))
    ? path.join(args.art, `${level.imageName}.jpg`)
    : path.join(args.art, `${level.imageName}.png`);
  if (!(await exists(srcPath))) throw new Error(`${id}: source image ${level.imageName}.jpg/.png not found in ${args.art}`);
  const src = await fs.readFile(srcPath);
  const srcHash = sha(src);

  if (!args.force && previous && previous.source.sha256 === srcHash && previous.settings === SETTINGS_KEY
      && previous.schemaVersion === SETTINGS_VERSION && await allFilesExist(args.out, previous)) {
    return { entry: dropRetiredFormats(previous), skipped: true };
  }

  const meta = await sharp(src).metadata();
  const W = meta.width, H = meta.height;
  if (meta.orientation && meta.orientation !== 1) {
    throw new Error(`${id}: source carries EXIF orientation ${meta.orientation}; bake it into the pixels first`);
  }
  if (!level.aspect || level.aspect.w !== W || level.aspect.h !== H) {
    throw new Error(`${id}: levels.json aspect ${JSON.stringify(level.aspect)} does not match the image (${W}x${H}). ` +
      'A wrong aspect displaces every target; fix levels.json (python3 tools/check_levels.py in the game repo).');
  }
  const aspectRatio = W / H;

  await fs.mkdir(path.join(args.out, id), { recursive: true });
  const base = sharp(src, { failOn: 'error', limitInputPixels: false });

  const tiers = {};
  let prevKey = null;
  for (const tier of Object.keys(TIERS)) {
    const size = tierSize(tier, W, H);
    const key = `${size.w}x${size.h}`;
    if (prevKey && prevKey.key === key) {           // source too small for this tier: same pixels, same file
      tiers[tier] = { ...tiers[prevKey.tier] };
      for (const f of FORMATS) if (!TIER_FORMATS[tier].includes(f)) delete tiers[tier][f];
      continue;
    }
    // Constrain the long edge only; libvips derives the short one, and its rounding may differ
    // from tierSize by a pixel, which the aspect check below allows.
    const pipeline = base.clone().resize({
      [W >= H ? 'width' : 'height']: Math.max(size.w, size.h),
      fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3',
    });
    tiers[tier] = await writeVariants(args.out, id, tier, pipeline, false, TIER_FORMATS[tier]);
    const got = tiers[tier];
    if (Math.max(got.w, got.h) !== Math.max(size.w, size.h) || Math.abs(got.w - size.w) > 1 || Math.abs(got.h - size.h) > 1) {
      throw new Error(`${id}/${tier}: expected ${key}, encoder produced ${got.w}x${got.h}`);
    }
    prevKey = { tier, key };
  }

  const thumbs = {};
  for (const group of level.items) {
    const box = pixelBox(thumbRect(group, aspectRatio), W, H);
    const pipeline = base.clone().extract(box)
      .resize({ width: THUMB_PX, height: THUMB_PX, fit: 'cover', withoutEnlargement: false, kernel: 'lanczos3' });
    thumbs[group.id] = await writeVariants(args.out, id, `thumb-${group.id}`, pipeline, true);
  }

  const stickerBox = pixelBox(stickerRect(level, aspectRatio), W, H);
  const sticker = await writeVariants(args.out, id, 'sticker',
    base.clone().extract(stickerBox)
      .resize({ width: STICKER_PX, height: STICKER_PX, fit: 'cover', withoutEnlargement: false, kernel: 'lanczos3' }),
    true);

  return {
    entry: {
      aspect: { w: W, h: H },
      source: { sha256: srcHash, bytes: src.length },
      settings: SETTINGS_KEY,
      schemaVersion: SETTINGS_VERSION,
      tiers, thumbs, sticker,
    },
    skipped: false,
  };
}

async function prune(outDir, keep) {
  let removed = 0;
  async function walk(dir, rel) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(abs, r);
        if ((await fs.readdir(abs)).length === 0) await fs.rmdir(abs);
      } else if (!keep.has(r)) {
        await fs.unlink(abs); removed++;
      }
    }
  }
  if (await exists(outDir)) await walk(outDir, '');
  return removed;
}

function fmtBytes(n) { return n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${Math.round(n / 1e3)} KB`; }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = JSON.parse(await fs.readFile(args.levels, 'utf8'));
  const personal = new Set((file.collections || []).filter((c) => c.personal).map((c) => c.id));

  let previous = { levels: {} };
  if (await exists(args.manifest)) {
    try { previous = JSON.parse(await fs.readFile(args.manifest, 'utf8')); } catch { previous = { levels: {} }; }
  }

  const manifest = {
    schema: 1,
    // Where the images sit relative to the manifest. Empty when the manifest is written inside
    // --out, which is how the app bundles it; "/" there would mean the server root.
    base: (() => {
      const rel = path.relative(path.dirname(args.manifest), args.out).split(path.sep).join('/');
      return rel ? rel + '/' : '';
    })(),
    tiers: TIERS,
    tierFormats: TIER_FORMATS,
    thumb: THUMB_PX,
    sticker: STICKER_PX,
    formats: FORMATS,
    levels: {},
  };

  let skippedPrivate = 0, built = 0, reused = 0;
  const t0 = Date.now();
  for (const level of file.levels) {
    if (args.only.length && !args.only.includes(level.id)) {
      if (previous.levels[level.id]) manifest.levels[level.id] = previous.levels[level.id];
      continue;
    }
    if (personal.has(level.collection) && !args.includePrivate) { skippedPrivate++; continue; }
    const started = Date.now();
    const { entry, skipped } = await buildLevel(level, args, previous.levels[level.id]);
    manifest.levels[level.id] = entry;
    if (skipped) { reused++; continue; }
    built++;
    const sizes = Object.keys(TIERS).map((t) => `${t} ${fmtBytes(entry.tiers[t].avif.bytes)}`).join(', ');
    console.log(`${level.id.padEnd(32)} ${sizes}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }

  await fs.mkdir(path.dirname(args.manifest), { recursive: true });
  await fs.writeFile(args.manifest, JSON.stringify(manifest, null, 1) + '\n');

  // prune() deletes everything under --out that the manifest does not reference, and the
  // manifest references only images. Writing it inside --out is the natural thing to do — it is
  // how the app bundles it — so keep it rather than deleting it and reporting success.
  const keep = referencedPaths(manifest);
  const manifestRel = path.relative(args.out, args.manifest);
  if (!manifestRel.startsWith('..')) keep.add(manifestRel.split(path.sep).join('/'));
  const removed = await prune(args.out, keep);

  let total = { avif: 0, webp: 0 }, session = 0;
  for (const lvl of Object.values(manifest.levels)) {
    const seen = new Set();
    for (const t of Object.values(lvl.tiers)) for (const f of formatsOf(t)) {
      if (seen.has(t[f].path)) continue; seen.add(t[f].path); total[f] += t[f].bytes;
    }
    for (const t of Object.values(lvl.thumbs)) for (const f of formatsOf(t)) total[f] += t[f].bytes;
    for (const f of formatsOf(lvl.sticker)) total[f] += lvl.sticker[f].bytes;
    session += lvl.tiers.card.avif.bytes + lvl.tiers.fit.avif.bytes;
  }
  console.log(`\n${built} built, ${reused} unchanged, ${skippedPrivate} private skipped, ${removed} stale files removed, ` +
    `${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`catalog: ${fmtBytes(total.avif)} AVIF + ${fmtBytes(total.webp)} WebP; card+fit for every painting: ${fmtBytes(session)} AVIF`);
  console.log(`manifest: ${path.relative(REPO, args.manifest)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
