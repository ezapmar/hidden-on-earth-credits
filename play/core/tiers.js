/**
 * Which image tier a given zoom deserves.
 *
 * The pipeline emits four tiers per painting. `card` is for pickers; the other three are what
 * the game shows:
 *
 *   fit   1280px   first paint, and phones at scale 1
 *   play  2048px   the default playing image
 *   zoom  3200px   swapped in past 1.6x
 *
 * `play` and `zoom` are AVIF only: their WebP copies were more than half the catalogue's bytes
 * and every current browser decodes AVIF. Every *current* browser is not every browser, and a
 * <picture> cannot fall back from a format it lacks when no other source exists, so a browser
 * without AVIF stays on `fit`, which carries WebP. Blurrier past 1.6x, never broken.
 */
export const TIER_ORDER = ["fit", "play", "zoom"];
/** Where `fit` starts to show its 1280px. From the plan's arithmetic, not taste. */
export const ZOOM_TIER_SCALE = 1.6;
export function tierForScale(scale, avifSupported) {
    if (!avifSupported)
        return "fit";
    return scale > ZOOM_TIER_SCALE ? "zoom" : "play";
}
/**
 * True when `to` is sharper than `from`. Used to make tier changes one-way: a sharper tier
 * already fetched is already in the browser cache, and dropping back down would flicker the
 * painting on every pinch out.
 */
export function isUpgrade(from, to) {
    return TIER_ORDER.indexOf(to) > TIER_ORDER.indexOf(from);
}
