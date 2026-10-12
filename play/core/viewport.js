/**
 * Zoom and pan state for the painting on screen. A verbatim port of `Game/Viewport.swift`:
 * same clamping, same anchor maths, same constants. Every method returns a new value.
 *
 * `scale` 1 means aspect-fit (the whole painting visible). `offset` moves the painting's centre
 * away from the container's centre, in CSS pixels. Every mutation goes through `clamped`, so the
 * painting can never be zoomed out past "fit" or dragged so far that it leaves a gap at an edge.
 */
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
/** One press of the +/- button. */
export const BUTTON_STEP = 1.7;
export const IDENTITY = { scale: 1, offset: { width: 0, height: 0 } };
export function isZoomed(v) {
    return v.scale > 1.001;
}
/** Aspect-fit rectangle for an image inside a container, centred. Mirrors `PaintingLayout.fitRect`. */
export function fitRect(imageSize, container) {
    if (!(imageSize.width > 0) || !(imageSize.height > 0))
        return { x: 0, y: 0, width: 0, height: 0 };
    const scale = Math.min(container.width / imageSize.width, container.height / imageSize.height);
    const w = imageSize.width * scale;
    const h = imageSize.height * scale;
    return { x: (container.width - w) / 2, y: (container.height - h) / 2, width: w, height: h };
}
/** Where the painting sits inside the container. `base` is the aspect-fit rect at scale 1. */
export function frame(v, base, container) {
    const w = base.width * v.scale;
    const h = base.height * v.scale;
    return {
        x: container.width / 2 + v.offset.width - w / 2,
        y: container.height / 2 + v.offset.height - h / 2,
        width: w,
        height: h,
    };
}
/**
 * Centres the painting on any axis where it fits, and otherwise keeps its edges outside the
 * container so no background shows through.
 */
export function clamped(v, base, container) {
    const scale = Math.min(Math.max(v.scale, MIN_SCALE), MAX_SCALE);
    const w = base.width * scale;
    const h = base.height * scale;
    const maxX = Math.max(0, (w - container.width) / 2);
    const maxY = Math.max(0, (h - container.height) / 2);
    let width = Math.min(Math.max(v.offset.width, -maxX), maxX);
    let height = Math.min(Math.max(v.offset.height, -maxY), maxY);
    if (!isZoomed({ scale, offset: { width, height } })) {
        width = 0;
        height = 0;
    }
    return { scale, offset: { width, height } };
}
/** Multiplies the scale while the painting point under `anchor` stays under the finger. */
export function zoomed(v, factor, anchor, base, container) {
    if (!(base.width > 0) || !(base.height > 0))
        return v;
    const newScale = Math.min(Math.max(v.scale * factor, MIN_SCALE), MAX_SCALE);
    const old = frame(v, base, container);
    const nx = (anchor.x - old.x) / old.width;
    const ny = (anchor.y - old.y) / old.height;
    const w = base.width * newScale;
    const h = base.height * newScale;
    const minX = anchor.x - nx * w;
    const minY = anchor.y - ny * h;
    return clamped({ scale: newScale, offset: { width: minX + w / 2 - container.width / 2, height: minY + h / 2 - container.height / 2 } }, base, container);
}
export function panned(v, translation, base, container) {
    return clamped({ scale: v.scale, offset: { width: v.offset.width + translation.width, height: v.offset.height + translation.height } }, base, container);
}
/** Pans so a normalized painting point (0...1) sits at the centre of the container. */
export function centered(v, point, base, container) {
    const w = base.width * v.scale;
    const h = base.height * v.scale;
    return clamped({ scale: v.scale, offset: { width: (0.5 - point.x) * w, height: (0.5 - point.y) * h } }, base, container);
}
/**
 * True when a normalized painting point is on screen, with a little margin so a hint ring near
 * the edge still counts as visible.
 */
export function isVisible(v, point, base, container, margin = 40) {
    const f = frame(v, base, container);
    const px = f.x + point.x * f.width;
    const py = f.y + point.y * f.height;
    return px >= margin && py >= margin && px <= container.width - margin && py <= container.height - margin;
}
