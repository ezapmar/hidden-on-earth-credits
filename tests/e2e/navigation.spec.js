import { expect, test } from "@playwright/test";
import { levelData, openLevel, openPlay, SMALL } from "./helpers.js";

const title = levelData(SMALL).titles.en;

test("picker → painting → picker, with the URL following along", async ({ page }) => {
  await openPlay(page);
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`\\?level=${SMALL}$`));
  await expect(page.locator("#title")).toHaveText(title);
  await expect(page.locator("body")).toHaveAttribute("data-screen", "game");

  await page.locator("#back-home").click();
  await expect(page).toHaveURL(/\/play\/$/);
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#game")).toBeHidden();
});

test("the browser's Back and Forward buttons move between screens", async ({ page }) => {
  await openPlay(page);
  await page.locator(".book-button").click();
  await expect(page).toHaveURL(/\?view=book$/);
  await page.locator(".slot").first().click();
  await expect(page.locator("#game")).toBeVisible();

  await page.goBack();
  await expect(page.locator("#book")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#home")).toBeVisible();
  await page.goForward();
  await expect(page.locator("#book")).toBeVisible();
});

test("the sticker book's back button returns to the picker", async ({ page }) => {
  await openPlay(page, "?view=book");
  await page.locator("#book button.back").click();
  await expect(page.locator("#home")).toBeVisible();
  await expect(page).toHaveURL(/\/play\/$/);
});

test("a painting can be linked to directly", async ({ page }) => {
  await openLevel(page, SMALL);
  await expect(page.locator("#title")).toHaveText(title);
  await expect(page.locator("#artist")).toHaveText(levelData(SMALL).artist);
  await expect(page.locator("#painting")).toHaveAttribute("alt", `${title} by ${levelData(SMALL).artist}`);
});

test("an unknown painting falls back to the picker rather than a blank screen", async ({ page }) => {
  await openPlay(page, "?level=does_not_exist");
  await expect(page.locator("#home")).toBeVisible();
  await expect(page).toHaveURL(/\/play\/$/);
  // replaceState, not pushState: Back must not bounce the child into the dead link again.
  expect(await page.evaluate(() => history.length)).toBe(2);
});

test("the tier pin survives choosing a painting", async ({ page }) => {
  await openPlay(page, "?tier=zoom");
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`level=${SMALL}&tier=zoom`));
});
