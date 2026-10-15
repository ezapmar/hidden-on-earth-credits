/* Shared steps for the browser tests. Targets come from the committed play/levels.json, so a tap
   lands exactly where the game says the thing is, at any viewport size or zoom. */
import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";

const LIBRARY = JSON.parse(readFileSync(new URL("../../play/levels.json", import.meta.url), "utf8"));

export const levelData = (id) => LIBRARY.levels.find((l) => l.id === id);
export const allLevels = () => LIBRARY.levels;
export const keysOf = (level) => level.items.flatMap((g) => g.targets.map((_, i) => `${g.id}#${i}`));
export const totalOf = (level) => keysOf(level).length;

/** Four targets in four groups: the quickest painting to finish. */
export const SMALL = "avercamp_winter_landscape";

export function targetOf(level, key) {
  const hash = key.lastIndexOf("#");
  return level.items.find((g) => g.id === key.slice(0, hash)).targets[Number(key.slice(hash + 1))];
}

/** A normalized point clear of every target by a wide margin, so a tap there is a miss. */
export function emptySpot(level) {
  const ratio = level.aspect.w / level.aspect.h;
  const targets = level.items.flatMap((g) => g.targets);
  let best = null, bestGap = -Infinity;
  for (let x = 0.05; x <= 0.95; x += 0.05) {
    for (let y = 0.05; y <= 0.95; y += 0.05) {
      const gap = Math.min(...targets.map((t) => Math.hypot(x - t.x, (y - t.y) / ratio) - (t.r ?? 0.05)));
      if (gap > bestGap) { bestGap = gap; best = { x, y }; }
    }
  }
  return best;
}

/** Seeds localStorage before any page script runs, under the Swift app's two keys. */
export async function seedProgress(page, { completed = [], partial = {} } = {}) {
  await page.addInitScript(([c, p]) => {
    if (sessionStorage.getItem("__seeded")) return; // once per test, not on every reload
    sessionStorage.setItem("__seeded", "1");
    localStorage.setItem("completedLevelIDs", JSON.stringify(c));
    localStorage.setItem("partialFoundTargets", JSON.stringify(p));
  }, [completed, partial]);
}

export const readProgress = (page) => page.evaluate(() => ({
  completed: JSON.parse(localStorage.getItem("completedLevelIDs") ?? "[]"),
  partial: JSON.parse(localStorage.getItem("partialFoundTargets") ?? "{}"),
}));

/** Opens /play/ (with an optional query) and waits for the catalogue to load. */
export async function openPlay(page, query = "") {
  await page.goto(`/play/${query}`);
  await expect(page.locator("#status")).toBeHidden();
}

/** Opens a painting and waits until the stage has been measured and the painting has loaded. */
export async function openLevel(page, id, extra = "") {
  await openPlay(page, `?level=${id}${extra}`);
  await expect(page.locator("#game")).toBeVisible();
  await expect.poll(() => page.locator("#painting").evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect.poll(async () => (await page.locator("#stage").boundingBox())?.width ?? 0).toBeGreaterThan(100);
}

/** Screen coordinates of a normalized painting point, through whatever zoom and pan apply. */
export async function screenPoint(page, p) {
  const box = await page.locator("#stage").boundingBox();
  return { x: box.x + p.x * box.width, y: box.y + p.y * box.height };
}

export async function tapAt(page, p) {
  const s = await screenPoint(page, p);
  await page.mouse.click(s.x, s.y);
}

export async function tapTarget(page, level, key) {
  await tapAt(page, targetOf(level, key));
}

export const hudCard = (page, groupId) => page.locator(`#hud .card[data-group="${groupId}"]`);
export const ring = (page, key) => page.locator(`#stage .ring[data-key="${key}"]`);
export const stageScale = (page) =>
  page.locator("#stage").evaluate((el) => Number(el.style.getPropertyValue("--s") || 1));
