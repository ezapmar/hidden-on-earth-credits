import { expect, test } from "@playwright/test";
import {
  allLevels, emptySpot, hudCard, keysOf, levelData, openLevel, readProgress, ring, seedProgress, SMALL, tapAt, tapTarget, totalOf,
} from "./helpers.js";

const level = levelData(SMALL);
const keys = keysOf(level);
const groupOf = (key) => level.items.find((g) => key.startsWith(`${g.id}#`));

/** Records what would have been read aloud, instead of speaking. */
async function captureSpeech(page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    const synth = { speak: (u) => window.__spoken.push({ text: u.text, lang: u.lang }), cancel() {} };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  });
}
const spoken = (page) => page.evaluate(() => window.__spoken.map((s) => s.text));

test.describe("finding things", () => {
  test("starts with a HUD card per item, nothing found", async ({ page }) => {
    await openLevel(page, SMALL);
    await expect(page.locator("#hud .card")).toHaveCount(level.items.length);
    for (const g of level.items) {
      await expect(hudCard(page, g.id).locator(".name")).toHaveText(g.names.en);
      await expect(hudCard(page, g.id).locator(".count")).toHaveText(`0 / ${g.targets.length}`);
    }
    await expect(page.locator("#stage .ring")).toHaveCount(0);
    await expect(page.locator("#win")).toBeHidden();
  });

  test("a tap on a target circles it, counts it and saves it", async ({ page }) => {
    await openLevel(page, SMALL);
    const key = keys[0];
    await tapTarget(page, level, key);

    await expect(ring(page, key)).toHaveCount(1);
    const g = groupOf(key);
    await expect(hudCard(page, g.id).locator(".count")).toHaveText(`1 / ${g.targets.length}`);
    expect((await readProgress(page)).partial).toEqual({ [SMALL]: [key] });
  });

  test("a tap near the edge of the tolerance still counts", async ({ page }) => {
    await openLevel(page, SMALL);
    const key = keys[1];
    const g = groupOf(key);
    const t = g.targets[Number(key.split("#")[1])];
    await tapAt(page, { x: t.x + t.r * 0.9, y: t.y }); // r is in painting widths
    await expect(ring(page, key)).toHaveCount(1);
  });

  test("tapping a found thing again does nothing but wiggle", async ({ page }) => {
    await openLevel(page, SMALL);
    await tapTarget(page, level, keys[0]);
    await expect(ring(page, keys[0])).toHaveCount(1);
    await tapTarget(page, level, keys[0]);
    await expect(page.locator("#stage .ring")).toHaveCount(1);
    expect((await readProgress(page)).partial[SMALL]).toEqual([keys[0]]);
  });

  test("a wrong tap shows a ripple and costs nothing", async ({ page }) => {
    await openLevel(page, SMALL);
    await tapAt(page, emptySpot(level));
    await expect(page.locator("#miss")).toHaveClass(/go/);
    await expect(page.locator("#stage .ring")).toHaveCount(0);
    expect((await readProgress(page)).partial).toEqual({});
    await expect(page.locator("#miss")).not.toHaveClass(/go/, { timeout: 2000 });
  });

  test("a tap beside the painting, in the letterbox, is ignored", async ({ page }) => {
    await openLevel(page, SMALL);
    const box = await page.locator("#stage").boundingBox();
    const area = await page.locator("#viewport").boundingBox();
    // The painting is wider than tall, so there is room above or below it, or at the sides.
    const p = box.y - area.y > 10
      ? { x: box.x + box.width / 2, y: (area.y + box.y) / 2 }
      : { x: (area.x + box.x) / 2, y: box.y + box.height / 2 };
    await page.mouse.click(p.x, p.y);
    await expect(page.locator("#miss")).not.toHaveClass(/go/);
  });

  test("finishing every item marks its HUD card done", async ({ page }) => {
    await openLevel(page, SMALL);
    const g = level.items[0];
    for (let i = 0; i < g.targets.length; i++) await tapTarget(page, level, `${g.id}#${i}`);
    await expect(hudCard(page, g.id)).toHaveAttribute("data-done", "");
    await expect(hudCard(page, level.items[1].id)).not.toHaveAttribute("data-done", "");
  });
});

test.describe("winning", () => {
  test("finding everything shows the win screen, earns the sticker and clears the partial save", async ({ page }) => {
    await openLevel(page, SMALL);
    for (const key of keys) await tapTarget(page, level, key);

    await expect(page.locator("#win")).toBeVisible();
    await expect(page.locator("#win-text")).toHaveText("You found them all!");
    await expect(page.locator("#stage .ring")).toHaveCount(totalOf(level));
    expect(await readProgress(page)).toEqual({ completed: [SMALL], partial: {} });
  });

  test("taps and hints do nothing behind the win screen", async ({ page }) => {
    await seedProgress(page, { partial: { [SMALL]: keys.slice(0, -1) } });
    await openLevel(page, SMALL);
    await tapTarget(page, level, keys.at(-1));
    await expect(page.locator("#win")).toBeVisible();

    await page.locator("#hint").click();
    await expect(page.locator("#stage .hintring")).toHaveCount(0);
  });

  test("Play again starts the painting over but keeps the sticker", async ({ page }) => {
    await seedProgress(page, { partial: { [SMALL]: keys.slice(0, -1) } });
    await openLevel(page, SMALL);
    await tapTarget(page, level, keys.at(-1));
    await page.locator("#again").click();

    await expect(page.locator("#win")).toBeHidden();
    await expect(page.locator("#stage .ring")).toHaveCount(0);
    await expect(hudCard(page, level.items[0].id).locator(".count")).toHaveText(`0 / ${level.items[0].targets.length}`);
    expect((await readProgress(page)).completed).toEqual([SMALL]);

    await tapTarget(page, level, keys[0]);
    await expect(ring(page, keys[0])).toHaveCount(1);
  });

  test("the sticker shows up in the book afterwards", async ({ page }) => {
    await openLevel(page, SMALL);
    for (const key of keys) await tapTarget(page, level, key);
    await expect(page.locator("#win")).toBeVisible();
    await page.locator("#back-home").click();
    await page.locator(".book-button").click();
    await expect(page.locator(".slot.unlocked .slot-name")).toHaveText(level.titles.en);
  });
});

test.describe("saving", () => {
  test("a half-finished painting resumes where it was left after a reload", async ({ page }) => {
    await openLevel(page, SMALL);
    await tapTarget(page, level, keys[0]);
    await tapTarget(page, level, keys[2]);
    await expect(page.locator("#stage .ring")).toHaveCount(2);

    await page.reload();
    await expect(page.locator("#game")).toBeVisible();
    await expect(ring(page, keys[0])).toHaveCount(1);
    await expect(ring(page, keys[2])).toHaveCount(1);
    await expect(page.locator("#stage .ring")).toHaveCount(2);
  });

  test("saved keys a painting no longer has are dropped, not counted", async ({ page }) => {
    await seedProgress(page, { partial: { [SMALL]: [keys[0], "unicorn#0", `${level.items[0].id}#99`] } });
    await openLevel(page, SMALL);
    await expect(page.locator("#stage .ring")).toHaveCount(1);
    await expect(ring(page, keys[0])).toHaveCount(1);
  });

  test("progress in one painting leaves the others alone", async ({ page }) => {
    const other = levelData("hokusai_great_wave");
    await seedProgress(page, { partial: { [other.id]: keysOf(other).slice(0, 3) } });
    await openLevel(page, SMALL);
    await tapTarget(page, level, keys[0]);
    expect((await readProgress(page)).partial[other.id]).toEqual(keysOf(other).slice(0, 3).sort());
  });
});

test.describe("hints", () => {
  test("Hint rings one unfound thing for three seconds", async ({ page }) => {
    await page.clock.install();
    await seedProgress(page, { partial: { [SMALL]: keys.slice(0, 2) } });
    await openLevel(page, SMALL);
    // Stop the page's clock, so only runFor moves it and a slow machine cannot drop the hint early.
    await page.clock.pauseAt(new Date(Date.now() + 60_000));

    await page.locator("#hint").click();
    const hint = page.locator("#stage .hintring");
    await expect(hint).toHaveCount(1);
    expect(keys.slice(2)).toContain(await hint.getAttribute("data-key"));

    await page.clock.runFor(2900);
    await expect(hint).toHaveCount(1);
    await page.clock.runFor(200);
    await expect(hint).toHaveCount(0);
  });

  test("pressing Hint again replaces the ring rather than adding one", async ({ page }) => {
    await openLevel(page, SMALL);
    await page.locator("#hint").click();
    await page.locator("#hint").click();
    await expect(page.locator("#stage .hintring")).toHaveCount(1);
  });

  test("finding the hinted thing clears the hint", async ({ page }) => {
    await openLevel(page, SMALL);
    await page.locator("#hint").click();
    const key = await page.locator("#stage .hintring").getAttribute("data-key");
    await tapTarget(page, level, key);
    await expect(page.locator("#stage .hintring")).toHaveCount(0);
    await expect(ring(page, key)).toHaveCount(1);
  });
});

test.describe("words", () => {
  test("tapping a HUD card reads its name aloud, in English", async ({ page }) => {
    await captureSpeech(page);
    await openLevel(page, SMALL);
    await hudCard(page, level.items[0].id).click();
    expect(await page.evaluate(() => window.__spoken)).toEqual([{ text: level.items[0].names.en, lang: "en-US" }]);
  });

  test("finding a thing says its name", async ({ page }) => {
    await captureSpeech(page);
    await openLevel(page, SMALL);
    await tapTarget(page, level, keys[0]);
    await expect.poll(() => spoken(page)).toEqual([groupOf(keys[0]).names.en]);
  });

  test("a wrong tap says nothing", async ({ page }) => {
    await captureSpeech(page);
    await openLevel(page, SMALL);
    await tapAt(page, emptySpot(level));
    await page.waitForTimeout(600);
    expect(await spoken(page)).toEqual([]);
  });

  test("the game works in a browser without speech", async ({ page }) => {
    await page.addInitScript(() => { delete window.speechSynthesis; });
    await openLevel(page, SMALL);
    await hudCard(page, level.items[0].id).click();
    await tapTarget(page, level, keys[0]);
    await expect(ring(page, keys[0])).toHaveCount(1);
  });
});

test("every published painting opens and its first target can be found", async ({ page }) => {
  // A smoke test over the whole demo: catches a level whose image or aspect is wrong enough to
  // move its targets off the painting.
  for (const l of allLevels()) {
    await openLevel(page, l.id);
    const key = keysOf(l)[0];
    await tapTarget(page, l, key);
    await expect(ring(page, key), l.id).toHaveCount(1);
  }
});
