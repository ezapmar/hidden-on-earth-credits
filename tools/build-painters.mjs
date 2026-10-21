#!/usr/bin/env node
/*
  build-painters.mjs — the eight painter portraits a player can choose to be.

  Same idea as build-images.mjs, one tier smaller: read the game's `painters.json`, cut each
  portrait's square `crop` out of its source scan, encode it as AVIF at 256px and write it
  beside the paintings in the app's `Resources/Img/Painters/`. The file name carries a hash of
  its own bytes, as every other image in the catalog does, and the script writes that name back
  into `painters.json` so the app reads one file to find both the picture and who is in it.

  These are not levels: nothing is played on them, so they are not in levels.json and not in
  the paintings manifest. They are public-domain scans all the same, recorded in the game's
  CREDITS.md.

    node tools/build-painters.mjs [--game <seek-and-find dir>] [--check]

  --check encodes nothing and exits non-zero if a file in painters.json is missing from the
  output directory, or a portrait has no row on this site's credits.html; CI uses it the way it
  uses images:verify.
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/** The circle is drawn at 110pt at most, so 256px covers a 2x screen with room to spare. */
const SIZE = 256;
/** A face at 1:1 or larger, so the same settings the thumbnails and stickers get. */
const AVIF = { quality: 60, effort: 6, chromaSubsampling: '4:4:4' };

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const check = process.argv.includes('--check');
const game = path.resolve(arg('game', '../seek-and-find'));
const resources = path.join(game, 'SeekAndFind', 'Resources');
const manifestPath = path.join(resources, 'painters.json');
const sourceDir = path.join(resources, 'Painters');
const outDir = path.join(resources, 'Img', 'Painters');
const creditsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'credits.html');

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

if (check) {
  const missing = [];
  for (const painter of manifest.painters) {
    const file = path.join(outDir, painter.file ?? '');
    if (!painter.file || !(await fs.access(file).then(() => true, () => false))) {
      missing.push(painter.id);
    }
  }
  if (missing.length) {
    console.error(`painters: no encoded portrait for ${missing.join(', ')}. Run npm run painters.`);
    process.exit(1);
  }
  // The app's "Painting credits" link lands on credits.html, so a portrait with no row there is
  // a face nobody can look up. A row names the work the way painters.json does.
  const credits = (await fs.readFile(creditsPath, 'utf8')).replaceAll('&amp;', '&').replaceAll('&nbsp;', ' ');
  const uncredited = manifest.painters.filter((p) => !credits.includes(p.work)).map((p) => p.id);
  if (uncredited.length) {
    console.error(`painters: no row on credits.html for ${uncredited.join(', ')}. Add one under "The painter portraits".`);
    process.exit(1);
  }
  console.log(`painters: ${manifest.painters.length} portraits present in ${path.relative(process.cwd(), outDir)}, all credited on credits.html`);
  process.exit(0);
}

await fs.mkdir(outDir, { recursive: true });
const written = new Set();

for (const painter of manifest.painters) {
  const source = path.join(sourceDir, painter.src);
  const image = sharp(source);
  const { width, height } = await image.metadata();
  const [left, top, side] = painter.crop;

  // A crop that runs off the scan would silently come back smaller than square, which shows
  // as a squashed face in a round frame. Refuse it instead.
  if (left < 0 || top < 0 || left + side > width || top + side > height) {
    throw new Error(`${painter.id}: crop [${painter.crop}] falls outside ${width}x${height}`);
  }

  const data = await image
    .extract({ left, top, width: side, height: side })
    .resize(SIZE, SIZE, { fit: 'cover' })
    .avif(AVIF)
    .toBuffer();

  const name = `${painter.id}.${sha(data).slice(0, 10)}.avif`;
  await fs.writeFile(path.join(outDir, name), data);
  written.add(name);
  painter.file = name;
  console.log(`${painter.id.padEnd(10)} ${String(side).padStart(5)}px square -> ${SIZE}px, ${(data.length / 1024).toFixed(1)} kB`);
}

// An older encode of the same portrait keeps its own name, so it would sit in the bundle
// forever unread. Only this script writes here, so anything it did not just write can go.
for (const stale of await fs.readdir(outDir)) {
  if (!written.has(stale)) await fs.rm(path.join(outDir, stale));
}

await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`painters: ${manifest.painters.length} portraits in ${path.relative(process.cwd(), outDir)}`);
