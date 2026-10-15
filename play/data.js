/* Loaded data and the bits every screen needs: image URLs, AVIF support, progress.
 *
 * Two files feed the game. assets/paintings.json is the image manifest the pipeline writes:
 * tiers, thumbs and stickers, with pixel sizes and content-hashed paths. play/levels.json is
 * the game data the manifest does not carry: titles, artists, items and targets, published by
 * tools/make-play-data.mjs with the family's own pictures left out.
 */
import { PlayerProgress, parseLibrary } from "./core/index.js";

export const state = {
  manifest: null,
  library: null,
  progress: null,
  avif: false,
};

/* 1x1 AVIF made by sharp: the same image sw.js probes with. The hand-written one this replaced
   failed to decode in every browser, so the game never left the 1280px `fit` tier. */
const AVIF_1PX =
  "data:image/avif;base64," +
  "AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAA" +
  "AAAAAAAAAA5waXRtAAAAAAABAAAAImlsb2MAAAAAREAAAQABAAAAAAD6AAEAAAAAAAAAGgAAACNpaW5mAAAAAAABAAAA" +
  "FWluZmUCAAAAAAEAAGF2MDEAAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAEAAAABAAAA" +
  "EHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAibWRhdBIACgc4AA5QENBpMg0bAAAAQAAAnjWAT6RQ";

function detectAvif() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width === 1);
    img.onerror = () => resolve(false);
    img.src = AVIF_1PX;
  });
}

export async function loadData() {
  const [manifest, levels, avif] = await Promise.all([
    fetch("../assets/paintings.json").then((r) => r.json()),
    fetch("./levels.json").then((r) => r.json()),
    detectAvif(),
  ]);
  state.manifest = manifest;
  state.library = parseLibrary(levels);
  state.progress = new PlayerProgress(window.localStorage);
  state.avif = avif;
  return state;
}

/* A manifest entry is { avif: {path, bytes}, webp: {path, bytes}, w, h }: the format keys hold
   objects, not strings. Returns both URLs so a page can offer AVIF with a WebP fallback. */
export function imageURLs(entry) {
  if (!entry) return null;
  const url = (f) => (entry[f]?.path ? `../assets/${state.manifest.base}${entry[f].path}` : null);
  return { avif: url("avif"), webp: url("webp") };
}

export const tierURLs = (levelId, tier) => imageURLs(state.manifest.levels[levelId]?.tiers?.[tier]);
export const thumbURLs = (levelId, groupId) => imageURLs(state.manifest.levels[levelId]?.thumbs?.[groupId]);
export const stickerURLs = (levelId) => imageURLs(state.manifest.levels[levelId]?.sticker);

export const levelById = (id) => state.library.levels.find((l) => l.id === id) ?? null;

/** <picture> with the AVIF source first; `alt` only on the img, as it should be. */
export function pictureEl(urls, alt = "", className = "") {
  const pic = document.createElement("picture");
  if (urls?.avif) {
    const s = document.createElement("source");
    s.type = "image/avif";
    s.srcset = urls.avif;
    pic.append(s);
  }
  const img = document.createElement("img");
  img.src = urls?.webp ?? urls?.avif ?? "";
  img.alt = alt;
  img.loading = "lazy";
  img.decoding = "async";
  if (className) img.className = className;
  pic.append(img);
  return pic;
}

/* The Swift rows: a collection with paintings, the personal one regardless, then a catch-all
   for paintings naming no known collection. The personal collection is never published, so
   here it simply has no levels and the "add your own" card stands in for the whole row. */
export function collectionRows({ includeEmptyPersonal = true } = {}) {
  const { collections, levels } = state.library;
  const known = new Set(collections.map((c) => c.id));
  const rows = [];
  for (const c of collections) {
    const inRow = levels.filter((l) => l.collection === c.id);
    if (inRow.length === 0 && !(c.personal && includeEmptyPersonal)) continue;
    rows.push({ collection: c, levels: inRow });
  }
  const rest = levels.filter((l) => !known.has(l.collection ?? ""));
  if (rest.length > 0) {
    rows.push({ collection: { id: "_more", titles: { en: "More paintings", tr: "Daha fazla tablo" }, symbol: "paintpalette.fill" }, levels: rest });
  }
  return rows;
}
