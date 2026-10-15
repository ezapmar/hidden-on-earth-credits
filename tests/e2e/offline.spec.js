/* The service worker: once /play/ has been visited, the picker and a first play work with no
   network. sw.js registers only on https or localhost, which is what baseURL is. */
import { expect, test } from "@playwright/test";
import { allLevels, keysOf, levelData, openLevel, openPlay, ring, SMALL, tapTarget } from "./helpers.js";

test.use({ serviceWorkers: "allow" });

async function installWorker(page) {
  await openPlay(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
    }
  });
}

test("installs and precaches the shell, the manifest and every card and fit picture", async ({ page }) => {
  await installWorker(page);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const n of names) for (const r of await (await caches.open(n)).keys()) urls.push(new URL(r.url).pathname);
    return { names, urls };
  });
  expect(cached.names.every((n) => n.startsWith("hoe-"))).toBe(true);
  expect(cached.urls).toContain("/assets/paintings.json");
  expect(cached.urls).toContain("/play/game.js");
  for (const tier of ["card", "fit"]) {
    expect(cached.urls.filter((u) => new RegExp(`/${tier}\\.[0-9a-f]+\\.(avif|webp)$`).test(u)), tier)
      .toHaveLength(allLevels().length);
  }
});

test("the picker and a painting still work offline", async ({ page, context }) => {
  await installWorker(page);
  await context.setOffline(true);

  await page.reload();
  await expect(page.locator("#status")).toBeHidden();
  await expect(page.locator("#home button.card-painting")).toHaveCount(allLevels().length);

  const level = levelData(SMALL);
  await page.getByRole("button", { name: level.titles.en, exact: true }).click();
  await expect.poll(() => page.locator("#painting").evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  await tapTarget(page, level, keysOf(level)[0]);
  await expect(ring(page, keysOf(level)[0])).toHaveCount(1);
});

test("a sharper tier, once seen, is kept for next time", async ({ page }) => {
  await installWorker(page);
  await openLevel(page, SMALL);
  await page.locator("#zoom-in").click();
  await expect.poll(() => page.locator("#painting").getAttribute("src")).toMatch(/\/zoom\./);
  await expect.poll(() => page.evaluate(async () =>
    (await (await caches.open((await caches.keys()).find((n) => n.startsWith("hoe-play-")) ?? "none")).keys()).length,
  )).toBeGreaterThan(0);
});

test("leaves requests outside its patch to the network", async ({ page, context }) => {
  await installWorker(page);
  await context.setOffline(true);
  const res = await page.evaluate(() => fetch("/credits.html").then((r) => r.status, () => "failed"));
  expect(res).toBe("failed");
});
