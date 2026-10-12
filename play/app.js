/* The first slice of the TypeScript rewrite, running in a browser.
 *
 * Everything that decides an outcome comes from core/, compiled from the seek-and-find-web
 * repository and verified against 1,425 cases dumped from the Swift game. This file is only
 * glue: load the data, draw the painting, turn a click into a normalized point, and render
 * what the core says happened.
 *
 * No zoom yet. The viewport module is ported and tested but not wired to pointer events; that
 * is the next piece. Until then the painting is shown aspect-fit at scale 1.
 */
import { GameSession, PlayerProgress, parseLibrary, L10n, Viewport, Tiers } from "./core/index.js";

const $ = (id) => document.getElementById(id);
const area = $("viewport"), stage = $("stage"), painting = $("painting");
const hud = $("hud"), win = $("win"), miss = $("miss");

/* The ring a child sees is never smaller than this, so neither is the tap tolerance.
   Same constant and the same reasoning as TargetMarker.minDiameter in the Swift app. */
const MIN_RING_PX = 44;

let session = null, level = null, manifest = null, library = null, progress = null;
let hintTimer = null, missTimer = null;

/* ---------------------------------------------------------------- the viewport
 *
 * Mirrors GameView.swift. `committed` is the viewport between gestures. A gesture in flight
 * is described by raw values and the reference they are measured from, so committing can bake
 * the result and let a still-running gesture carry on from there instead of replaying it.
 *
 *   live = committed.zoomed(by: pinchRaw / pinchRef, at: anchor).panned(by: dragRaw - dragRef)
 *
 * All of the maths is the ported Viewport module, which is property-tested. This file only
 * turns pointer events into those four numbers.
 */
let committed = Viewport.IDENTITY;
let base = { x: 0, y: 0, width: 0, height: 0 };
let container = { width: 0, height: 0 };

let pinchRaw = 1, pinchRef = 1, pinchAnchor = { x: 0, y: 0 };
let dragRaw = { width: 0, height: 0 }, dragRef = { width: 0, height: 0 };

/** A real tap moves less than this, so taps still reach the hit test. */
const DRAG_THRESHOLD = 12;

function liveViewport() {
  const drag = { width: dragRaw.width - dragRef.width, height: dragRaw.height - dragRef.height };
  const zoomed = Viewport.zoomed(committed, pinchRaw / pinchRef, pinchAnchor, base, container);
  return Viewport.panned(zoomed, drag, base, container);
}

/** Bakes the in-flight values in and re-baselines, so a gesture still running does not replay. */
function commitGestures() {
  committed = liveViewport();
  pinchRef = pinchRaw;
  dragRef = { ...dragRaw };
}

function measure() {
  const r = area.getBoundingClientRect();
  container = { width: r.width, height: r.height };
  base = Viewport.fitRect({ width: level.aspect.w, height: level.aspect.h }, container);
  stage.style.width = `${base.width}px`;
  stage.style.height = `${base.height}px`;
  committed = Viewport.clamped(committed, base, container);
  render();
}

function render() {
  const v = liveViewport();
  // translate(-50%,-50%) centres the base box; the rest is the viewport, exactly as
  // Viewport.frame computes it. One composited transform, no layout.
  stage.style.transform =
    `translate(-50%, -50%) translate(${v.offset.width}px, ${v.offset.height}px) scale(${v.scale})`;
  // Rings are drawn inside the stage, so they scale with it. Divide the stroke and the pixel
  // floor by the scale to keep both constant on screen.
  stage.style.setProperty("--s", String(v.scale));
  for (const el of stage.querySelectorAll(".ring, .hintring")) {
    const t = targetOf(el.dataset.key);
    if (t) el.style.width = `${ringWidthFraction(t, v.scale) * 100}%`;
  }
  chooseTier(v.scale);
  const zoomed = Viewport.isZoomed(v);
  $("zoom-in").disabled = v.scale >= Viewport.MAX_SCALE - 1e-6;
  $("zoom-out").disabled = !zoomed;
  $("zoom-fit").disabled = !zoomed;
}

async function boot() {
  try {
    const [m, l] = await Promise.all([
      fetch("../assets/paintings.json").then((r) => r.json()),
      fetch("./levels.json").then((r) => r.json()),
    ]);
    manifest = m;
    library = parseLibrary(l);
  } catch (e) {
    $("status").textContent = `Could not load the catalogue: ${e.message}`;
    return;
  }

  progress = new PlayerProgress(window.localStorage);
  avifOK = await detectAvif();

  const picker = $("picker");
  for (const lv of library.levels) {
    const o = document.createElement("option");
    o.value = lv.id;
    picker.append(o);
  }
  picker.addEventListener("change", () => load(picker.value));
  refreshPicker();

  const wanted = new URLSearchParams(location.search).get("level");
  const start = library.levels.find((l) => l.id === wanted) ?? library.levels[0];
  picker.value = start.id;
  load(start.id);
}

/* A manifest entry is { avif: {path, bytes}, webp: {path, bytes}, w, h }: the format keys hold
   objects, not strings. Returns both URLs so the page can offer AVIF with a WebP fallback;
   `play` and `zoom` are AVIF only, `card`, `fit`, thumbs and stickers carry both. */
/* A finished painting earns a star, as it does on the Swift picker. Completion lives in
   PlayerProgress, not in the session: finishing clears the partial set, so a replay starts
   from an empty board while the star stays. */
function refreshPicker() {
  for (const o of $("picker").options) {
    const lv = library.levels.find((l) => l.id === o.value);
    o.textContent = (progress.isCompleted(lv) ? "\u2605 " : "") + L10n.pick(lv.titles);
  }
}

function imageURLs(entry) {
  if (!entry) return null;
  const url = (f) => (entry[f]?.path ? `../assets/${manifest.base}${entry[f].path}` : null);
  return { avif: url("avif"), webp: url("webp") };
}

function tierURLs(levelId, tier) {
  return imageURLs(manifest.levels[levelId]?.tiers?.[tier]);
}

/* ---------------------------------------------------------------- image tiers
 *
 * `play` (2048px) and `zoom` (3200px) are AVIF only: the WebP copies were more than half the
 * catalogue's bytes and every current browser decodes AVIF. "Every current browser" is not
 * "every browser", though, and a <picture> cannot fall back from a format it does not support
 * when no other source exists. So detect AVIF once, and a browser without it simply stays on
 * `fit`, which carries WebP. Blurrier past 1.6x, but never a broken image.
 */
let avifOK = false;
let shownTier = "fit";
let pendingTier = null;

const AVIF_1PX =
  "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRsc" +
  "gAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAAB" +
  "AAABGgAAAB0AAABEaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABR" +
  "pc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaX" +
  "BtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI=";

function detectAvif() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width === 1);
    img.onerror = () => resolve(false);
    img.src = AVIF_1PX;
  });
}

/* Which tier a zoom level deserves is core logic, in core/tiers.js, with its own tests.
   What is left here is the plumbing: preload, then swap once it has decoded, so the painting
   never blanks mid-game. */
/** `?tier=fit|play|zoom` pins the tier, the way the Swift app takes -showTargets: it is how
    you check on a real device whether a tier is actually sharp enough. */
const pinnedTier = (() => {
  const t = new URLSearchParams(location.search).get("tier");
  return Tiers.TIER_ORDER.includes(t) ? t : null;
})();

function chooseTier(scale) {
  const want = pinnedTier ?? Tiers.tierForScale(scale, avifOK);
  if (!Tiers.isUpgrade(shownTier, want) || pendingTier === want) return;
  const urls = tierURLs(level.id, want);
  const href = urls?.avif ?? urls?.webp;
  if (!href) return;

  pendingTier = want;
  const pre = new Image();
  pre.decoding = "async";
  pre.onload = () => {
    if (pendingTier !== want || !level) return;
    $("painting-avif").srcset = href;
    painting.src = href;
    shownTier = want;
    pendingTier = null;
  };
  pre.onerror = () => { if (pendingTier === want) pendingTier = null; };
  pre.src = href;
}

function useTier(tier) {
  shownTier = tier;
  pendingTier = null;
}

function load(id) {
  level = library.levels.find((l) => l.id === id);
  if (!level) return;
  history.replaceState(null, "", `?level=${encodeURIComponent(id)}`);

  session = new GameSession(level, progress.foundTargets(level));
  clearHint();
  stage.querySelectorAll(".ring").forEach((r) => r.remove());
  win.hidden = true;

  $("title").textContent = L10n.pick(level.titles);
  $("artist").textContent = level.artist;
  painting.alt = `${L10n.pick(level.titles)} by ${level.artist}`;
  // Start on `fit` (1280px, and the largest tier with a WebP fallback). Sharper tiers are
  // swapped in as the zoom asks for them.
  const art = tierURLs(id, "fit");
  $("painting-avif").srcset = art?.avif ?? "";
  painting.src = art?.webp ?? art?.avif ?? "";
  useTier("fit");


  $("status").hidden = true;
  area.hidden = false;
  committed = Viewport.IDENTITY;
  pinchRaw = pinchRef = 1;
  dragRaw = dragRef = { width: 0, height: 0 };
  measure();

  buildHUD();
  for (const key of session.found) drawRing(key);
  render();
  if (session.isComplete) win.hidden = false;
}

function targetOf(key) {
  const hash = key.lastIndexOf("#");
  const group = level.items.find((g) => g.id === key.slice(0, hash));
  return group?.targets[Number(key.slice(hash + 1))] ?? null;
}

function place(el, x, y, widthFraction) {
  el.style.left = `${x * 100}%`;
  el.style.top = `${y * 100}%`;
  if (widthFraction !== undefined) el.style.width = `${widthFraction * 100}%`;
}

function ringWidthFraction(t, scale = 1) {
  // Match the visible ring to the tap tolerance, including the pixel floor. The floor is in
  // screen pixels, so at higher zoom it covers less of the painting, which is right: zoomed
  // in, the real radius is already generous.
  const w = (base.width || stage.getBoundingClientRect().width || 1) * scale;
  return Math.max(t.r * 2, MIN_RING_PX / w);
}

function drawRing(key, className = "ring") {
  const t = targetOf(key);
  if (!t) return null;
  const el = document.createElement("span");
  el.className = className;
  el.dataset.key = key;
  place(el, t.x, t.y, ringWidthFraction(t));
  stage.insertBefore(el, miss);
  return el;
}

function buildHUD() {
  hud.replaceChildren();
  const thumbs = manifest.levels[level.id]?.thumbs ?? {};
  for (const group of level.items) {
    const card = document.createElement("button");
    card.className = "card";
    card.dataset.group = group.id;

    const thumb = imageURLs(thumbs[group.id]);
    if (thumb?.avif || thumb?.webp) {
      const pic = document.createElement("picture");
      if (thumb.avif) {
        const src = document.createElement("source");
        src.type = "image/avif";
        src.srcset = thumb.avif;
        pic.append(src);
      }
      const img = document.createElement("img");
      img.src = thumb.webp ?? thumb.avif;
      img.alt = "";
      pic.append(img);
      card.append(pic);
    }
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = L10n.pick(group.names);
    const count = document.createElement("span");
    count.className = "count";
    card.append(name, count);

    // Tapping a card reads the word aloud, in English, as the game does.
    card.addEventListener("click", () => speak(L10n.spokenName(group.names)));
    hud.append(card);
  }
  updateHUD();
}

function updateHUD() {
  for (const group of level.items) {
    const card = hud.querySelector(`.card[data-group="${CSS.escape(group.id)}"]`);
    if (!card) continue;
    const found = session.foundCount(group);
    card.querySelector(".count").textContent = `${found} / ${group.targets.length}`;
    card.toggleAttribute("data-done", session.isGroupComplete(group));
  }
}

function speak(text) {
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function clearHint() {
  clearTimeout(hintTimer);
  stage.querySelectorAll(".hintring").forEach((e) => e.remove());
  if (session) session.hinted = null;
}

/* ------------------------------------------------------------------ gestures
 *
 * Pointer Events, composed the way GameView.swift composes MagnifyGesture with DragGesture.
 * Two fingers pinch and pan together; one finger pans only when already zoomed, because a
 * one-finger slide at fit scale would otherwise commit a no-op with a confusing clamp jump.
 * Anything that moves less than the threshold and lifts is a tap.
 */
const pointers = new Map();
let gesture = null; // { startMid, startDist, downPoint, moved, pointerId }

const localPoint = (e) => {
  const r = area.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
const midOf = (pts) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});
const distOf = ([a, b]) => Math.hypot(a.x - b.x, a.y - b.y);

/** Re-baselines on every change in finger count, so adding or lifting one never jumps. */
function rebaseline() {
  commitGestures();
  pinchRaw = pinchRef = 1;
  dragRaw = dragRef = { width: 0, height: 0 };
  const pts = [...pointers.values()];
  if (pts.length === 0) {
    gesture = null;
    return;
  }
  const mid = midOf(pts);
  gesture = {
    startMid: mid,
    startDist: pts.length >= 2 ? distOf(pts) : 0,
    downPoint: mid,
    moved: 0,
    pointerId: pts.length === 1 ? [...pointers.keys()][0] : null,
  };
  // The pinch anchor is where the gesture began and stays put for its duration, as
  // MagnifyGesture.startAnchor does.
  if (pts.length >= 2) pinchAnchor = mid;
}

area.addEventListener("pointerdown", (e) => {
  if (!session) return;
  // Controls inside the viewport keep their own clicks. Capturing the pointer here would
  // redirect pointerup away from the button, and the browser then never synthesises a click
  // on it, so the zoom buttons would appear dead to a real finger or mouse.
  if (e.target instanceof Element && e.target.closest("button")) return;
  area.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, localPoint(e));
  rebaseline();
});

area.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, localPoint(e));
  const pts = [...pointers.values()];
  const mid = midOf(pts);
  gesture.moved = Math.max(gesture.moved, Math.hypot(mid.x - gesture.downPoint.x, mid.y - gesture.downPoint.y));

  if (pts.length >= 2 && gesture.startDist > 0) {
    pinchRaw = Math.max(0.05, distOf(pts) / gesture.startDist);
    dragRaw = { width: mid.x - gesture.startMid.x, height: mid.y - gesture.startMid.y };
  } else if (pts.length === 1) {
    // Nothing to pan at fit scale, and a tap must not become a drag.
    if (!Viewport.isZoomed(liveViewport()) || gesture.moved < DRAG_THRESHOLD) return;
    dragRaw = { width: mid.x - gesture.startMid.x, height: mid.y - gesture.startMid.y };
  }
  render();
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  const wasSingle = pointers.size === 1;
  const moved = gesture?.moved ?? 0;
  const point = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  rebaseline();
  render();
  if (wasSingle && moved < DRAG_THRESHOLD && point) handleTap(point);
}

area.addEventListener("pointerup", endPointer);
area.addEventListener("pointercancel", endPointer);

/* A trackpad or mouse wheel zooms about the cursor; ctrl+wheel is the pinch gesture. */
area.addEventListener("wheel", (e) => {
  if (!session) return;
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
  committed = Viewport.zoomed(committed, factor, localPoint(e), base, container);
  render();
}, { passive: false });

/** The tap point is read from the live painting box, so it is already zoom-corrected. */
function handleTap(point) {
  if (!session || !win.hidden) return;
  const r = stage.getBoundingClientRect();
  const a = area.getBoundingClientRect();
  const x = (point.x + a.left - r.left) / r.width;
  const y = (point.y + a.top - r.top) / r.height;
  if (x < 0 || y < 0 || x > 1 || y > 1) return; // outside the painting

  // frame.width / frame.height, as the Swift view passes; and the pixel floor measured
  // against the zoomed width, so zooming in shrinks it.
  const result = session.tap({ x, y }, r.width / r.height, MIN_RING_PX / 2 / r.width);

  if (result.kind === "found") {
    clearHint();
    drawRing(result.key);
    updateHUD();
    progress.saveFound(session.found, level);
    if (navigator.vibrate) navigator.vibrate(12);
    const group = level.items.find((g) => result.key.startsWith(`${g.id}#`));
    if (group) setTimeout(() => speak(L10n.spokenName(group.names)), 450);
    if (session.isComplete) {
      progress.markCompleted(level);
      refreshPicker();
      $("win-text").textContent = L10n.t("foundAll");
      setTimeout(() => (win.hidden = false), 450);
    }
  } else if (result.kind === "alreadyFound") {
    const el = stage.querySelector(`.ring[data-key="${CSS.escape(result.key)}"]`);
    if (el) {
      el.animate([{ transform: "translate(-50%,-50%) scale(1)" }, { transform: "translate(-50%,-50%) scale(1.15)" }, { transform: "translate(-50%,-50%) scale(1)" }], { duration: 300 });
    }
  } else {
    // Wrong taps are never penalized: a soft ripple and nothing else.
    place(miss, x, y);
    miss.classList.remove("go");
    void miss.offsetWidth;
    miss.classList.add("go");
    clearTimeout(missTimer);
    missTimer = setTimeout(() => miss.classList.remove("go"), 600);
  }
}

/* The +/- buttons zoom about the centre of the container, as the Swift ones do. */
function zoomByButton(factor) {
  committed = Viewport.zoomed(committed, factor, { x: container.width / 2, y: container.height / 2 }, base, container);
  render();
}
$("zoom-in").addEventListener("click", () => zoomByButton(Viewport.BUTTON_STEP));
$("zoom-out").addEventListener("click", () => zoomByButton(1 / Viewport.BUTTON_STEP));
$("zoom-fit").addEventListener("click", () => {
  committed = Viewport.IDENTITY;
  render();
});

$("hint").addEventListener("click", () => {
  if (!session || !win.hidden) return;
  clearHint();
  const key = session.showHint();
  if (!key) return;
  const el = drawRing(key, "hintring");
  // The core holds no timers; the view owns them. 3 seconds, as in the Swift app.
  hintTimer = setTimeout(() => {
    el?.remove();
    session.clearHint(key);
  }, 3000);
});

$("again").addEventListener("click", () => {
  progress.saveFound(new Set(), level);
  load(level.id);
});

$("reset").addEventListener("click", () => {
  progress.saveFound(new Set(), level);
  load(level.id);
});

new ResizeObserver(() => { if (session) measure(); }).observe(area);

boot();
