#!/usr/bin/env node
/* Checks the output of build-images.mjs, locally and, with --base, as deployed.

   Local (always):
     * every public level in levels.json (when --levels is given) is in the manifest, and no
       private one is
     * every level has all four tiers (card and fit in both formats, play and zoom as AVIF),
       every HUD thumb and the sticker
     * every file exists and decodes to the pixel size the manifest claims
     * every tier matches the level's aspect within 1px (a rotated or mis-cropped derivative
       would displace every target), and its long edge is min(tier, source) — never upscaled
     * thumbs and stickers are square at the advertised size

   Deployed (--base https://host/):
     * every file answers 200 with an image content type and Cache-Control containing
       "immutable"
     * the manifest answers 200 with Cache-Control containing "must-revalidate" and is
       byte-identical to the local one

   Exits non-zero with every problem listed, so it works as a CI gate.

   Usage:
     node tools/verify-images.mjs [--manifest assets/paintings.json] [--levels <levels.json>]
                                  [--base https://hiddenonearth.ucer.us/]
*/
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIERS, TIER_FORMATS, THUMB_PX, STICKER_PX, FORMATS, formatsOf, tierSize } from './build-images.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const a = { manifest: path.resolve(REPO, 'assets/paintings.json'), levels: null, base: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--manifest') { a.manifest = path.resolve(v); i++; }
    else if (k === '--levels') { a.levels = path.resolve(v); i++; }
    else if (k === '--base') { a.base = v.endsWith('/') ? v : v + '/'; i++; }
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

const problems = [];
const bad = (msg) => problems.push(msg);

function entries(level) {
  const out = [];
  for (const [tier, t] of Object.entries(level.tiers)) out.push({ kind: 'tier', name: tier, entry: t, formats: TIER_FORMATS[tier] || FORMATS });
  for (const [g, t] of Object.entries(level.thumbs)) out.push({ kind: 'thumb', name: g, entry: t, formats: FORMATS });
  out.push({ kind: 'sticker', name: 'sticker', entry: level.sticker, formats: FORMATS });
  return out;
}

async function checkLocal(manifest, manifestPath, levelsPath) {
  const outDir = path.resolve(path.dirname(manifestPath), manifest.base);
  if (levelsPath) {
    const file = JSON.parse(await fs.readFile(levelsPath, 'utf8'));
    const personal = new Set((file.collections || []).filter((c) => c.personal).map((c) => c.id));
    for (const l of file.levels) {
      const isPrivate = personal.has(l.collection);
      if (!isPrivate && !manifest.levels[l.id]) bad(`${l.id}: public level missing from the manifest`);
      if (isPrivate && manifest.levels[l.id]) bad(`${l.id}: PRIVATE level is in the manifest; it must not be published`);
      const m = manifest.levels[l.id];
      if (m) {
        if (m.aspect.w !== l.aspect.w || m.aspect.h !== l.aspect.h) bad(`${l.id}: manifest aspect differs from levels.json`);
        for (const g of l.items) if (!m.thumbs[g.id]) bad(`${l.id}: no thumb for group ${g.id}`);
      }
    }
  }
  let files = 0;
  for (const [id, level] of Object.entries(manifest.levels)) {
    for (const tier of Object.keys(TIERS)) if (!level.tiers[tier]) bad(`${id}: tier ${tier} missing`);
    const { w: W, h: H } = level.aspect;
    for (const { kind, name, entry, formats } of entries(level)) {
      for (const f of formatsOf(entry)) if (!formats.includes(f)) bad(`${id}/${name}: carries ${f}, which this tier no longer ships`);
      for (const f of formats) {
        if (!entry[f]) { bad(`${id}/${name}: no ${f}`); continue; }
        const abs = path.join(outDir, entry[f].path);
        let meta;
        try { meta = await sharp(abs).metadata(); files++; }
        catch (e) { bad(`${id}/${name}.${f}: ${entry[f].path} unreadable (${e.message})`); continue; }
        if (meta.width !== entry.w || meta.height !== entry.h) {
          bad(`${id}/${name}.${f}: file is ${meta.width}x${meta.height}, manifest says ${entry.w}x${entry.h}`);
        }
        const size = (await fs.stat(abs)).size;
        if (size !== entry[f].bytes) bad(`${id}/${name}.${f}: ${size} bytes on disk, manifest says ${entry[f].bytes}`);
        if (!entry[f].path.includes('.' + f) || !/\.[0-9a-f]{10}\./.test(entry[f].path)) bad(`${id}/${name}.${f}: path ${entry[f].path} is not content-hashed`);
      }
      if (kind === 'tier') {
        const expected = tierSize(name, W, H);
        if (Math.max(entry.w, entry.h) !== Math.max(expected.w, expected.h) || Math.abs(entry.w - expected.w) > 1 || Math.abs(entry.h - expected.h) > 1) {
          bad(`${id}/${name}: is ${entry.w}x${entry.h}, expected ${expected.w}x${expected.h} for a ${W}x${H} source`);
        }
        const hFromW = entry.w * H / W;
        if (Math.abs(entry.h - hFromW) > 1) bad(`${id}/${name}: ${entry.w}x${entry.h} is off the ${W}:${H} aspect by ${(entry.h - hFromW).toFixed(2)}px`);
        if ((W >= H) !== (entry.w >= entry.h) && W !== H) bad(`${id}/${name}: orientation differs from the source`);
      } else {
        const px = kind === 'thumb' ? THUMB_PX : STICKER_PX;
        if (entry.w !== px || entry.h !== px) bad(`${id}/${name}: is ${entry.w}x${entry.h}, expected ${px}x${px}`);
      }
    }
  }
  return files;
}

/* The site's HTML names hashed files directly (no build step), so a re-encode that changes a
   hash must be followed by an HTML update. Catch the drift here. */
async function checkHtml(manifest, manifestPath) {
  const outDir = path.resolve(path.dirname(manifestPath), manifest.base);
  const relOut = path.relative(REPO, outDir).split(path.sep).join('/') + '/';
  const known = new Set();
  for (const level of Object.values(manifest.levels)) for (const { entry } of entries(level)) for (const f of formatsOf(entry)) known.add(relOut + entry[f].path);
  let refs = 0;
  for (const name of await fs.readdir(REPO)) {
    if (!name.endsWith('.html')) continue;
    const html = await fs.readFile(path.join(REPO, name), 'utf8');
    for (const m of html.matchAll(/assets\/img\/[^\s"'),]+/g)) {
      refs++;
      if (!known.has(m[0])) bad(`${name}: references ${m[0]}, which the manifest does not list (re-run the pipeline, then update the HTML)`);
    }
  }
  return refs;
}

async function head(url) {
  const r = await fetch(url, { method: 'HEAD', redirect: 'manual' });
  return { status: r.status, type: r.headers.get('content-type') || '', cache: r.headers.get('cache-control') || '' };
}

async function checkDeployed(manifest, manifestPath, base) {
  const manifestUrl = new URL(path.basename(manifestPath), base).href;
  const local = await fs.readFile(manifestPath, 'utf8');
  const r = await fetch(manifestUrl);
  if (r.status !== 200) bad(`${manifestUrl}: HTTP ${r.status}`);
  else {
    const cache = r.headers.get('cache-control') || '';
    if (!/must-revalidate/.test(cache)) bad(`${manifestUrl}: Cache-Control "${cache}" lacks must-revalidate`);
    if (/immutable/.test(cache)) bad(`${manifestUrl}: Cache-Control "${cache}" must not be immutable`);
    const remote = await r.text();
    if (remote !== local) bad(`${manifestUrl}: deployed manifest differs from the local one`);
  }
  const urls = [];
  for (const level of Object.values(manifest.levels)) {
    for (const { entry } of entries(level)) for (const f of formatsOf(entry)) urls.push(new URL(manifest.base + entry[f].path, manifestUrl).href);
  }
  const unique = [...new Set(urls)];
  let done = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (done < unique.length) {
      const url = unique[done++];
      let h;
      try { h = await head(url); } catch (e) { bad(`${url}: ${e.message}`); continue; }
      if (h.status !== 200) bad(`${url}: HTTP ${h.status}`);
      if (!/^image\/(avif|webp)/.test(h.type)) bad(`${url}: content-type "${h.type}"`);
      if (!/immutable/.test(h.cache)) bad(`${url}: Cache-Control "${h.cache}" lacks immutable`);
    }
  });
  await Promise.all(workers);
  return unique.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await fs.readFile(args.manifest, 'utf8'));
  const levels = Object.keys(manifest.levels).length;
  const files = await checkLocal(manifest, args.manifest, args.levels);
  const refs = await checkHtml(manifest, args.manifest);
  console.log(`local: ${levels} levels, ${files} files, ${refs} HTML references checked`);
  if (args.base) {
    const n = await checkDeployed(manifest, args.manifest, args.base);
    console.log(`deployed: ${n} URLs checked at ${args.base}`);
  }
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
  }
  console.log('ok');
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
