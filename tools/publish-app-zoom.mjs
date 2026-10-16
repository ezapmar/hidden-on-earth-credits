#!/usr/bin/env node
/* Publishes the iPad app's zoom tier, which the app downloads instead of bundling.

   build-images.mjs, run for the app with `--remote-tier zoom --remote-out <dir>`, writes each
   public painting's 3200px file outside the bundle and marks it "remote" in the app's manifest.
   This copies those files to assets/zoom/<level>/zoom.<hash>.avif, where the app fetches them.

   They are the app's own bytes, not the site's assets/img copies: the encoder is not
   byte-for-byte reproducible across machines, so the same painting built twice gets two names,
   and the app asks for exactly the name in its manifest.

   Nothing here is ever deleted. An installed copy of an older build keeps asking for the files
   its manifest names, so a file stays published as long as any build might want it. Names carry
   a hash of their bytes, so old and new never collide.

   Refuses a file whose bytes do not match the hash in its name, and any level in a personal
   collection: the family's own pictures are never published.

   Usage:
     node tools/publish-app-zoom.mjs [--app ../seek-and-find/SeekAndFind/Resources] [--check]

   --check copies nothing and fails if a remote file in the app's manifest is not published yet.
*/
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ZOOM_DIR = 'assets/zoom';

function parseArgs(argv) {
  const a = { app: path.resolve(REPO, '../seek-and-find/SeekAndFind/Resources'), check: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--app') { a.app = path.resolve(v); i++; }
    else if (k === '--check') a.check = true;
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

const exists = (p) => fs.access(p).then(() => true, () => false);

/* The hash in a name is the first ten hex digits of the file's SHA-256. */
export function nameMatchesBytes(name, data) {
  const m = /\.([0-9a-f]{10})\.[a-z0-9]+$/.exec(name);
  return Boolean(m) && createHash('sha256').update(data).digest('hex').startsWith(m[1]);
}

/* Every remote file in the app's manifest, as { level, path, bytes }. */
export function remoteFiles(manifest) {
  const out = [];
  for (const [level, entry] of Object.entries(manifest.levels)) {
    for (const t of Object.values(entry.tiers)) {
      if (t.avif?.remote) out.push({ level, path: t.avif.path, bytes: t.avif.bytes });
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await fs.readFile(path.join(args.app, 'Img/paintings.json'), 'utf8'));
  const levels = JSON.parse(await fs.readFile(path.join(args.app, 'levels.json'), 'utf8'));
  const personal = new Set((levels.collections || []).filter((c) => c.personal).map((c) => c.id));
  const privateLevels = new Set(levels.levels.filter((l) => personal.has(l.collection)).map((l) => l.id));

  const problems = [];
  let copied = 0, present = 0;
  for (const file of remoteFiles(manifest)) {
    if (privateLevels.has(file.level)) { problems.push(`${file.path}: personal level, never published`); continue; }
    const dest = path.join(REPO, ZOOM_DIR, file.path);
    if (await exists(dest)) { present++; continue; }
    if (args.check) { problems.push(`${file.path}: not published (run node tools/publish-app-zoom.mjs)`); continue; }
    const src = path.join(args.app, 'Zoom', file.path);
    if (!(await exists(src))) { problems.push(`${file.path}: missing from ${path.relative(REPO, src)}`); continue; }
    const data = await fs.readFile(src);
    if (data.length !== file.bytes || !nameMatchesBytes(file.path, data)) {
      problems.push(`${file.path}: bytes do not match the manifest or the name`); continue;
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, data);
    copied++;
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`${copied} copied, ${present} already published, under ${ZOOM_DIR}/`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
