/**
 * Level data, ported from `Models/Level.swift`.
 *
 * `x`/`y` are 0...1 fractions of the painting's width/height. `r` is the tap tolerance as a
 * fraction of the painting WIDTH, generous on purpose, defaulting to 0.05 exactly as the Swift
 * decoder does. `aspect` is the painting's real pixel size and is required: every target is
 * normalized against the aspect-fit rectangle, so the wrong shape displaces all of them at once.
 */
export const DEFAULT_TARGET_RADIUS = 0.05;
/** Width over height. Mirrors `Aspect.ratio`, including the `max(1, h)` guard. */
export function aspectRatio(a) {
    return a.w / Math.max(1, a.h);
}
export function totalTargets(level) {
    let n = 0;
    for (const g of level.items)
        n += g.targets.length;
    return n;
}
/** The HUD thumbnail crop: an explicit `thumb`, else a box around the first target. */
export function thumbRect(group, ratio) {
    if (group.thumb)
        return group.thumb;
    const t = group.targets[0];
    if (!t)
        return { x: 0, y: 0, w: 0.1, h: 0.1 };
    const w = t.r * 2.2;
    const h = w * ratio; // keep the crop square on screen
    return { x: t.x - w / 2, y: t.y - h / 2, w, h };
}
export function stickerRect(level) {
    if (level.sticker)
        return level.sticker;
    const first = level.items[0];
    if (first)
        return thumbRect(first, aspectRatio(level.aspect));
    return { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
}
/* ------------------------------------------------------------------ parsing */
function fail(what) {
    throw new Error(`levels: ${what}`);
}
function num(v, what) {
    if (typeof v !== "number" || !Number.isFinite(v))
        fail(`${what} must be a finite number`);
    return v;
}
function str(v, what) {
    if (typeof v !== "string")
        fail(`${what} must be a string`);
    return v;
}
function strMap(v, what) {
    if (typeof v !== "object" || v === null)
        fail(`${what} must be an object`);
    const out = {};
    for (const [k, val] of Object.entries(v))
        out[k] = str(val, `${what}.${k}`);
    return out;
}
function cropRect(v, what) {
    if (typeof v !== "object" || v === null)
        fail(`${what} must be an object`);
    const o = v;
    return { x: num(o["x"], `${what}.x`), y: num(o["y"], `${what}.y`), w: num(o["w"], `${what}.w`), h: num(o["h"], `${what}.h`) };
}
function parseTarget(v, what) {
    if (typeof v !== "object" || v === null)
        fail(`${what} must be an object`);
    const o = v;
    // The Swift decoder defaults a missing `r` to 0.05; two targets in levels.json rely on it.
    const r = o["r"] === undefined ? DEFAULT_TARGET_RADIUS : num(o["r"], `${what}.r`);
    return { x: num(o["x"], `${what}.x`), y: num(o["y"], `${what}.y`), r };
}
function parseGroup(v, what) {
    if (typeof v !== "object" || v === null)
        fail(`${what} must be an object`);
    const o = v;
    const targets = o["targets"];
    if (!Array.isArray(targets))
        fail(`${what}.targets must be an array`);
    const group = {
        id: str(o["id"], `${what}.id`),
        names: strMap(o["names"], `${what}.names`),
        targets: targets.map((t, i) => parseTarget(t, `${what}.targets[${i}]`)),
    };
    return o["thumb"] === undefined ? group : { ...group, thumb: cropRect(o["thumb"], `${what}.thumb`) };
}
function parseLevel(v, what) {
    if (typeof v !== "object" || v === null)
        fail(`${what} must be an object`);
    const o = v;
    const aspect = o["aspect"];
    if (typeof aspect !== "object" || aspect === null) {
        // Deliberately loud. The Swift side made `aspect` required for the same reason: guessing
        // it silently displaces every target in the painting.
        fail(`${what}.aspect is required`);
    }
    const a = aspect;
    const items = o["items"];
    if (!Array.isArray(items))
        fail(`${what}.items must be an array`);
    const level = {
        id: str(o["id"], `${what}.id`),
        titles: strMap(o["titles"], `${what}.titles`),
        artist: str(o["artist"], `${what}.artist`),
        imageName: str(o["imageName"], `${what}.imageName`),
        aspect: { w: num(a["w"], `${what}.aspect.w`), h: num(a["h"], `${what}.aspect.h`) },
        items: items.map((g, i) => parseGroup(g, `${what}.items[${i}]`)),
    };
    const withCollection = o["collection"] === undefined
        ? level
        : { ...level, collection: str(o["collection"], `${what}.collection`) };
    return o["sticker"] === undefined
        ? withCollection
        : { ...withCollection, sticker: cropRect(o["sticker"], `${what}.sticker`) };
}
function parseCollection(v, what) {
    if (typeof v !== "object" || v === null)
        fail(`${what} must be an object`);
    const o = v;
    const c = {
        id: str(o["id"], `${what}.id`),
        titles: strMap(o["titles"], `${what}.titles`),
        symbol: str(o["symbol"], `${what}.symbol`),
    };
    if (o["personal"] === undefined)
        return c;
    if (typeof o["personal"] !== "boolean")
        fail(`${what}.personal must be a boolean`);
    return { ...c, personal: o["personal"] };
}
/** Parses the shape of `levels.json` (and of the pipeline's `paintings.json` level data). */
export function parseLibrary(raw) {
    if (typeof raw !== "object" || raw === null)
        fail("root must be an object");
    const o = raw;
    const levels = o["levels"];
    if (!Array.isArray(levels))
        fail("levels must be an array");
    const collections = o["collections"];
    if (collections !== undefined && !Array.isArray(collections))
        fail("collections must be an array");
    return {
        collections: (collections ?? []).map((c, i) => parseCollection(c, `collections[${i}]`)),
        levels: levels.map((l, i) => parseLevel(l, `levels[${i}]`)),
    };
}
