import { expect, test } from "@playwright/test";
import { allLevels, keysOf, levelData, openPlay, seedProgress, SMALL, totalOf } from "./helpers.js";

test.describe("picker", () => {
  test("lists every published painting, grouped in rows", async ({ page }) => {
    await openPlay(page);
    await expect(page).toHaveTitle(/Hidden on Earth/);
    await expect(page.locator("body")).toHaveAttribute("data-screen", "home");
    await expect(page.locator("#home button.card-painting")).toHaveCount(allLevels().length);
    await expect(page.locator("#home section h2").first()).toHaveText("Animals");
    await expect(page.locator("#home section h2").filter({ hasText: "Your collection" })).toHaveCount(1);
  });

  test("loads every card picture", async ({ page }) => {
    await openPlay(page);
    const cards = page.locator("#home .card-art img");
    await expect(cards).toHaveCount(allLevels().length);
    for (const img of await cards.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
    }
  });

  test("shows saved progress: a star on a finished painting, a bar on a started one", async ({ page }) => {
    const started = levelData("hokusai_great_wave");
    await seedProgress(page, { completed: [SMALL], partial: { [started.id]: keysOf(started).slice(0, 2) } });
    await openPlay(page);

    const done = page.getByRole("button", { name: levelData(SMALL).titles.en, exact: true });
    await expect(done).toHaveClass(/done/);
    await expect(done.locator(".card-star")).toBeVisible();

    const half = page.getByRole("button", { name: started.titles.en, exact: true });
    await expect(half.locator(".count")).toHaveText(`2 / ${totalOf(started)} found`);
    await expect(half.locator(".bar")).toBeVisible();

    await expect(page.locator(".book-button")).toContainText(`1 / ${allLevels().length}`);
  });

  test("survives corrupt saved progress", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("completedLevelIDs", "{not json");
      localStorage.setItem("partialFoundTargets", "[1,2,3]");
    });
    await openPlay(page);
    await expect(page.locator("#home button.card-painting")).toHaveCount(allLevels().length);
    await expect(page.locator(".book-button")).toContainText(`0 / ${allLevels().length}`);
  });

  test("tells the player when the catalogue cannot load", async ({ page }) => {
    await page.route("**/assets/paintings.json", (r) => r.fulfill({ status: 500, body: "nope" }));
    await page.goto("/play/");
    await expect(page.locator("#status")).toContainText("Could not load the catalogue");
    await expect(page.locator("#home")).toBeHidden();
  });

  test("ends with the iOS app promo", async ({ page }) => {
    await openPlay(page);
    await expect(page.locator(".app-promo")).toContainText("download the iOS app");
  });
});

test.describe("sticker book", () => {
  test("shows earned stickers and locked slots", async ({ page }) => {
    await seedProgress(page, { completed: [SMALL] });
    await openPlay(page, "?view=book");
    await expect(page.locator("body")).toHaveAttribute("data-screen", "book");
    await expect(page.locator(".book-head .lead")).toHaveText(`1 / ${allLevels().length} stickers`);
    await expect(page.locator(".slot.unlocked")).toHaveCount(1);
    await expect(page.locator(".slot.unlocked .slot-name")).toHaveText(levelData(SMALL).titles.en);
    await expect(page.locator(".slot:not(.unlocked)")).toHaveCount(allLevels().length - 1);
    const sticker = page.locator(".slot.unlocked img");
    await expect.poll(() => sticker.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  });
});
