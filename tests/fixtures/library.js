/* Small hand-made catalogue for unit tests. The real one is checked in tests/data. */
import { parseLibrary, PlayerProgress, memoryStore } from "../../play/core/index.js";
import { state } from "../../play/data.js";

export const RAW_LEVELS = {
  collections: [
    { id: "animals", titles: { en: "Animals" }, symbol: "pawprint.fill" },
    { id: "winter", titles: { en: "Winter" }, symbol: "snowflake" },
    { id: "empty", titles: { en: "Nothing here" }, symbol: "leaf.fill" },
    { id: "family", titles: { en: "Your collection" }, symbol: "paintpalette.fill", personal: true },
  ],
  levels: [
    level("ark", "animals", "Noah's Ark", [["lion", 2], ["owl", 1]]),
    level("zoo", "animals", "Menagerie", [["duck", 1]]),
    level("snow", "winter", "Hunters", [["dog", 3]]),
    level("stray", "nowhere", "Stray", [["cat", 1]]),
    level("loose", undefined, "Loose", [["fox", 1]]),
  ],
};

function level(id, collection, title, groups) {
  return {
    id,
    ...(collection === undefined ? {} : { collection }),
    titles: { en: title },
    artist: `Painter of ${title}`,
    imageName: id,
    aspect: { w: 400, h: 200 },
    items: groups.map(([g, n]) => ({
      id: g,
      names: { en: g[0].toUpperCase() + g.slice(1) },
      targets: Array.from({ length: n }, (_, i) => ({ x: 0.1 + i * 0.2, y: 0.5, r: 0.05 })),
    })),
  };
}

const entry = (path) => ({ avif: { path: `${path}.avif`, bytes: 1 }, webp: { path: `${path}.webp`, bytes: 1 }, w: 10, h: 10 });

export const MANIFEST = {
  base: "img/",
  levels: Object.fromEntries(
    RAW_LEVELS.levels.map((l) => [l.id, {
      tiers: {
        card: entry(`${l.id}/card`),
        fit: entry(`${l.id}/fit`),
        play: { avif: { path: `${l.id}/play.avif`, bytes: 1 }, w: 20, h: 10 },
      },
      thumbs: Object.fromEntries(l.items.map((g) => [g.id, entry(`${l.id}/thumb-${g.id}`)])),
      sticker: entry(`${l.id}/sticker`),
    }]),
  ),
};

/** Points the shared `state` at the fixture with a fresh, empty progress store. */
export function loadFixture({ store = memoryStore() } = {}) {
  state.manifest = MANIFEST;
  state.library = parseLibrary(RAW_LEVELS);
  state.progress = new PlayerProgress(store);
  state.avif = true;
  return state;
}

export const lvl = (id) => state.library.levels.find((l) => l.id === id);

/** Every target key of a level, as GameSession builds them. */
export const allKeys = (level) => level.items.flatMap((g) => g.targets.map((_, i) => `${g.id}#${i}`));
