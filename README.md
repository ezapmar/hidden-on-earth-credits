# Hidden on Earth: website

The public site for **Hidden on Earth: Seek & Find**, a seek-and-find game for children played on famous paintings.

**Website:** https://ezapmar.github.io/hidden-on-earth-credits/

- [Home](https://ezapmar.github.io/hidden-on-earth-credits/): what the game is, a playable painting, the method, the paintings.
- [Support](https://ezapmar.github.io/hidden-on-earth-credits/support.html): help and contact. This is the App Store Support URL.
- [Privacy Policy](https://ezapmar.github.io/hidden-on-earth-credits/privacy.html): the app collects no data: no accounts, ads, analytics, tracking, or network connections.
- [Art credits and sources](https://ezapmar.github.io/hidden-on-earth-credits/credits.html): every painting is a public-domain artwork (CC0 museum open-access or Wikimedia Commons).

Plain static HTML, served by Cloudflare from `main`. No build step at serve time, no external requests: fonts (Outfit, Hanken Grotesk, both OFL) are in `assets/fonts/`.

Design follows the brainless family: night, bone and vermilion, flat fills, stepped corners, a woven band between sections and kilim motifs drawn as 15 by 15 knot grids (`site.js`).

The painting list on the home page and the hiding places in the playable painting are copied from the game's `levels.json` (in the `seek-and-find` repo). When a painting or a count changes in the game, change it here too.

The four pictures in *Your collection* are original works by Dünya Üçer, used with the family's permission. They are not published on this site, and the image pipeline below refuses them by default.

## Images

Every painting on the site, and every painting the web game will play, comes out of one script: `tools/build-images.mjs`. It reads the game's `levels.json` and the source paintings beside it, and writes to `assets/img/` plus a manifest at `assets/paintings.json`. Nothing is drawn by hand.

| Output | Size | Used for |
|---|---|---|
| `card` | 320px long edge | picker cards, sticker-book slots, the gallery on the home page |
| `fit` | 1280px long edge | first paint, phones at scale 1 |
| `play` | 2048px long edge | the default playing image; bundled in the app shells |
| `zoom` | 3200px long edge | swapped in past about 1.6x zoom, fetched on demand |
| `thumb-<group>` | 128px square | the HUD card picture, cropped as the game's `ItemGroup.thumbRect` does |
| `sticker` | 384px square | the detail earned for finishing, as `Level.stickerRect` |

`card`, `fit`, thumbs and stickers come as AVIF (primary) and WebP (fallback). `play` and `zoom` are AVIF only: every current browser decodes it, one that cannot still plays at `fit`, and the WebP copies were more than half the catalog's bytes. Nothing is upscaled: a source shorter than a tier gets that tier at its own size, and a tier that would repeat the previous one reuses its file. File names carry a hash of their own bytes, so they can be cached forever and a changed source never collides with a stale copy.

```bash
npm install                      # once; sharp does the encoding
npm run images                   # reads ../seek-and-find/SeekAndFind/Resources/levels.json
npm run images:verify            # every tier present, right size, on the right aspect
```

Both scripts take `--levels <path>` when the game checkout is somewhere else. The build skips a level whose source and encoder settings have not changed, so a re-run after adding one painting takes seconds. A full run is a few minutes.

`levels.json` is the only place a painting's pixel size lives (`aspect`). The build refuses a level whose image does not match it, because a wrong aspect quietly displaces every target in that painting.

**The home page names the hashed files directly** (no build step at serve time). After a re-encode that changes hashes, run `python3 tools/wire-site.py` to repoint `index.html`; `images:verify` fails until that is done.

**Private pictures.** A level in a collection marked `"personal": true` (the family's own drawings) is skipped. This repository is public; those pictures stay in the app bundle. To generate them for the bundle, point the output elsewhere:

```bash
node tools/build-images.mjs --include-private --out ../seek-and-find-web/public/img --manifest ../seek-and-find-web/public/paintings.json
```

## Offline

`sw.js` is a service worker that touches only `assets/img/` and the manifest. On install it stores every painting's `card` and `fit` tiers (about 2 MB), so the picker and a first play work with no network; the `play` and `zoom` tiers are kept as they are used, newest sixteen files. Everything else on the site is left to the browser. Bump `VERSION` in `sw.js` to drop the caches on the next visit.

The app shells (Capacitor, Part Two of the plan) do not rely on this worker: `card` and `play` are bundled files there, and `zoom` goes through the Filesystem plugin.

## The web game, first slice

`play/` is the TypeScript rewrite, at <https://hiddenonearth.ucer.us/play/>: a picker with a
row per collection, the sticker book, and the game itself. Progress and stars are kept in
localStorage under the same two keys the Swift app uses in UserDefaults.
Pinch, drag and the +/- buttons zoom to 4x, and sharper image tiers swap in as the zoom
asks for them. The URL carries the screen, so the browser's Back button works and Android's
hardware back will too: `/play/` is the picker, `?view=book` the sticker book, `?level=<id>` a
painting. `?tier=fit|play|zoom` pins the image tier, which is how to judge sharpness on a device.

Everything that decides an outcome comes from `play/core/`, compiled from the `seek-and-find-web`
repository and verified against 1,425 cases dumped from the Swift game. `play/app.js` is only
glue: load, draw, turn a click into a normalized point, render what the core says happened.

It is served from this origin on purpose. The catalog sends no `Access-Control-Allow-Origin`, so
a game on another host could not `fetch` the manifest; same origin means no CORS surface at all.

Two generated files, neither edited by hand:

```bash
node tools/make-play-data.mjs          # play/levels.json, from the game's levels.json
                                       # (levels in a "personal" collection are never published)
cd ../seek-and-find-web && npm run build && npm run vendor -- ../hidden-on-earth-credits/play/core
```

## Hosting

**Cloudflare serves `main` at https://hiddenonearth.ucer.us/.** Not Cloudflare Pages: the
dashboard's "import a repository" flow creates a **Worker with static assets**, which serves the
same files free with no bandwidth bill and honours the cache headers in `_headers` (GitHub Pages
ignores that file and sends ten-minute caching for everything).

How it is wired:

- **Build.** Workers Builds watches `main`. Build command empty; deploy command
  `npx wrangler deploy`, which takes the Worker name, compatibility date and asset directory
  from `wrangler.jsonc`. Passing those as flags instead works the same.
- **Assets.** The repository root is the asset directory, so the committed files are the served
  files. `.assetsignore` keeps `node_modules` out of the upload: Workers Builds installs
  dependencies before deploying, and wrangler's own `workerd` binary is ~129 MiB, well over the
  25 MiB per-asset limit. Deleting `wrangler.jsonc` does not fail the build, it publishes to a
  Worker named after `package.json` instead, so leave it in place.
- **Domain.** `hiddenonearth.ucer.us` is a Worker custom domain. Cloudflare writes and owns the
  DNS record: a proxied `AAAA` at `100::`, not a CNAME.
- **Rules run first.** A Redirect Rule or Page Rule matching `ucer.us` subdomains is evaluated
  before the Worker and will swallow the whole site. If every path returns the same redirect,
  look there before suspecting the deploy.

Check the deploy from a checkout:

```bash
npm run images:verify -- --base https://hiddenonearth.ucer.us/
```

`--base` is the site root. This fetches every image with HEAD and fails unless each answers 200
with `Cache-Control: immutable`, and the manifest answers with `must-revalidate` and matches the
committed one.

Still open: update the Support URL and Privacy Policy URL in App Store Connect to the new domain
(a metadata edit, no review). Do it once; the domain does not move again. The links at the top of
this file still point at GitHub Pages until that happens.

Do not use R2 or Image Transformations for the catalog: the whole thing is a few megabytes of static files that never change.
