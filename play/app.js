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
import { GameSession, PlayerProgress, aspectRatio, parseLibrary, totalTargets, L10n } from "./core/index.js";

const $ = (id) => document.getElementById(id);
const stage = $("stage"), painting = $("painting"), hud = $("hud"), win = $("win"), miss = $("miss");

/* The ring a child sees is never smaller than this, so neither is the tap tolerance.
   Same constant and the same reasoning as TargetMarker.minDiameter in the Swift app. */
const MIN_RING_PX = 44;

let session = null, level = null, manifest = null, library = null, progress = null;
let hintTimer = null, missTimer = null;

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
  // The `fit` tier (1280px) is the right one while there is no zoom, and it is the largest
  // tier that still carries a WebP fallback; `play` and `zoom` are AVIF only.
  const art = tierURLs(id, "fit") ?? tierURLs(id, "play");
  $("painting-avif").srcset = art?.avif ?? "";
  painting.src = art?.webp ?? art?.avif ?? "";
  // The stage carries the aspect ratio, not the image: the rings are positioned against it.
  stage.style.setProperty("--ar", `${level.aspect.w} / ${level.aspect.h}`);

  $("status").hidden = true;
  stage.hidden = false;

  buildHUD();
  for (const key of session.found) drawRing(key);
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

function ringWidthFraction(t) {
  // Match the visible ring to the tap tolerance, including the pixel floor.
  const w = stage.getBoundingClientRect().width || 1;
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

stage.addEventListener("click", (e) => {
  if (!session || !win.hidden) return;
  const box = stage.getBoundingClientRect();
  const point = { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  const minRadius = MIN_RING_PX / 2 / box.width;

  const result = session.tap(point, aspectRatio(level.aspect), minRadius);

  if (result.kind === "found") {
    clearHint();
    drawRing(result.key);
    updateHUD();
    progress.saveFound(session.found, level);
    if (navigator.vibrate) navigator.vibrate(12);
    if (session.isComplete) {
      progress.markCompleted(level);
      refreshPicker();
      $("win-text").textContent = L10n.t("foundAll");
      setTimeout(() => (win.hidden = false), 450);
    }
  } else if (result.kind === "alreadyFound") {
    const el = stage.querySelector(`.ring[data-key="${CSS.escape(result.key)}"]`);
    if (el) {
      el.style.transition = "transform .2s";
      el.style.transform = "translate(-50%,-50%) scale(1.15)";
      setTimeout(() => (el.style.transform = ""), 200);
    }
  } else {
    // Wrong taps are never penalized: a soft ripple and nothing else.
    place(miss, point.x, point.y);
    miss.classList.remove("go");
    void miss.offsetWidth;
    miss.classList.add("go");
    clearTimeout(missTimer);
    missTimer = setTimeout(() => miss.classList.remove("go"), 600);
  }
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

window.addEventListener("resize", () => {
  if (!session) return;
  for (const el of stage.querySelectorAll(".ring, .hintring")) {
    const t = targetOf(el.dataset.key);
    if (t) el.style.width = `${ringWidthFraction(t) * 100}%`;
  }
});

boot();
