# Hidden on Earth: website

The public site for **Hidden on Earth: Seek & Find**, a seek-and-find game for children played on famous paintings.

**Website:** https://ezapmar.github.io/hidden-on-earth-credits/

- [Home](https://ezapmar.github.io/hidden-on-earth-credits/): what the game is, a playable painting, the method, the paintings.
- [Support](https://ezapmar.github.io/hidden-on-earth-credits/support.html): help and contact. This is the App Store Support URL.
- [Privacy Policy](https://ezapmar.github.io/hidden-on-earth-credits/privacy.html): the app collects no data: no accounts, ads, analytics, tracking, or network connections.
- [Art credits and sources](https://ezapmar.github.io/hidden-on-earth-credits/credits.html): every painting is a public-domain artwork (CC0 museum open-access or Wikimedia Commons).

Plain static HTML, served by GitHub Pages from `main`. No build step at serve time, no external requests: fonts (Outfit, Hanken Grotesk, both OFL) are in `assets/fonts/`.

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

Each as AVIF (primary) and WebP (fallback). Nothing is upscaled: a source shorter than a tier gets that tier at its own size, and a tier that would repeat the previous one reuses its file. File names carry a hash of their own bytes, so they can be cached forever and a changed source never collides with a stale copy.

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

## Hosting

GitHub Pages serves `main` today. The plan moves the site to **Cloudflare Pages** at `hiddenonearth.ucer.us`, because Pages serves static files free with no bandwidth bill and honours the cache headers in `_headers` (GitHub Pages ignores that file and sends ten-minute caching for everything).

1. Cloudflare dashboard, Workers & Pages, Create, Pages, connect this repository. Production branch `main`, no build command, output directory `/`.
2. Custom domains, add `hiddenonearth.ucer.us`. Cloudflare adds the CNAME itself when the zone is on Cloudflare.
3. Check the deploy from a checkout:

   ```bash
   npm run images:verify -- --base https://hiddenonearth.ucer.us/
   ```

   This fetches every image with HEAD and fails unless each answers 200 with `Cache-Control: immutable`, and the manifest answers with `must-revalidate` and matches the committed one.
4. Update the Support URL and Privacy Policy URL in App Store Connect to the new domain (a metadata edit, no review). Do it once; the domain does not move again.

Do not use R2 or Image Transformations for the catalog: the whole thing is a few megabytes of static files that never change.
