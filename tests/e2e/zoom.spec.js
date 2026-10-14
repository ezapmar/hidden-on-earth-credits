import { expect, test } from "@playwright/test";
import { keysOf, levelData, openLevel, ring, screenPoint, SMALL, stageScale, tapTarget, targetOf } from "./helpers.js";

const level = levelData(SMALL);
const STEP = 1.7; // Viewport.BUTTON_STEP
const MAX = 4; // Viewport.MAX_SCALE

const zoomIn = (page) => page.locator("#zoom-in");
const zoomOut = (page) => page.locator("#zoom-out");
const zoomFit = (page) => page.locator("#zoom-fit");
const paintingSrc = (page) => page.locator("#painting").getAttribute("src");

/** Two-finger touch through CDP, which Chromium turns into pointer events like a real pinch. */
async function pinch(page, centre, from, to, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const pts = (d) => [{ x: centre.x - d / 2, y: centre.y, id: 1 }, { x: centre.x + d / 2, y: centre.y, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(from) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(from + ((to - from) * i) / steps) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("zoom buttons", () => {
  test("only zoom in is offered at fit", async ({ page }) => {
    await openLevel(page, SMALL);
    expect(await stageScale(page)).toBe(1);
    await expect(zoomIn(page)).toBeEnabled();
    await expect(zoomOut(page)).toBeDisabled();
    await expect(zoomFit(page)).toBeDisabled();
  });

  test("+ zooms one step about the centre, and − and ▢ come back", async ({ page }) => {
    await openLevel(page, SMALL);
    const before = await page.locator("#stage").boundingBox();
    await zoomIn(page).click();

    expect(await stageScale(page)).toBeCloseTo(STEP, 5);
    const after = await page.locator("#stage").boundingBox();
    expect(after.width / before.width).toBeCloseTo(STEP, 2);
    // About the centre: the painting's centre has not moved.
    expect(after.x + after.width / 2).toBeCloseTo(before.x + before.width / 2, 0);
    expect(after.y + after.height / 2).toBeCloseTo(before.y + before.height / 2, 0);
    await expect(zoomOut(page)).toBeEnabled();
    await expect(zoomFit(page)).toBeEnabled();

    await zoomOut(page).click();
    expect(await stageScale(page)).toBeCloseTo(1, 5);
    await expect(zoomOut(page)).toBeDisabled();
  });

  test("zoom stops at 4x", async ({ page }) => {
    await openLevel(page, SMALL);
    for (let i = 0; i < 5; i++) if (await zoomIn(page).isEnabled()) await zoomIn(page).click();
    expect(await stageScale(page)).toBeCloseTo(MAX, 5);
    await expect(zoomIn(page)).toBeDisabled();
  });

  test("▢ goes straight back to the whole painting", async ({ page }) => {
    await openLevel(page, SMALL);
    await zoomIn(page).click();
    await zoomIn(page).click();
    await zoomFit(page).click();
    expect(await stageScale(page)).toBe(1);
  });

  test("a zoom button press is not taken for a tap on the painting", async ({ page }) => {
    await openLevel(page, SMALL);
    await zoomIn(page).click();
    await expect(page.locator("#miss")).not.toHaveClass(/go/);
  });
});

test.describe("wheel and trackpad", () => {
  test("the wheel zooms about the cursor", async ({ page }) => {
    await openLevel(page, SMALL);
    const t = targetOf(level, keysOf(level)[0]);
    const at = await screenPoint(page, t);
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -300);
    await expect.poll(() => stageScale(page)).toBeGreaterThan(1.2);
    // The point under the cursor stays under the cursor (unless the clamp had to move it).
    const now = await screenPoint(page, t);
    expect(Math.abs(now.x - at.x)).toBeLessThan(3);
    expect(Math.abs(now.y - at.y)).toBeLessThan(3);
  });

  test("never zooms out past the whole painting", async ({ page }) => {
    await openLevel(page, SMALL);
    await page.mouse.move(400, 400);
    await page.mouse.wheel(0, 2000);
    expect(await stageScale(page)).toBe(1);
  });
});

test.describe("panning", () => {
  test("dragging pans the painting when zoomed, and is not a tap", async ({ page }) => {
    await openLevel(page, SMALL);
    await zoomIn(page).click();
    const before = await page.locator("#stage").boundingBox();
    const v = await page.locator("#viewport").boundingBox();
    const c = { x: v.x + v.width / 2, y: v.y + v.height / 2 };
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 80, c.y + 40, { steps: 6 });
    await page.mouse.up();

    const after = await page.locator("#stage").boundingBox();
    expect(after.x - before.x).toBeGreaterThan(40);
    await expect(page.locator("#miss")).not.toHaveClass(/go/);
    await expect(page.locator("#stage .ring")).toHaveCount(0);
  });

  test("dragging at fit scale does not move the painting", async ({ page }) => {
    await openLevel(page, SMALL);
    const before = await page.locator("#stage").boundingBox();
    const v = await page.locator("#viewport").boundingBox();
    await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2);
    await page.mouse.down();
    await page.mouse.move(v.x + v.width / 2 + 120, v.y + v.height / 2, { steps: 6 });
    await page.mouse.up();
    expect(await page.locator("#stage").boundingBox()).toEqual(before);
  });

  test("the painting cannot be dragged off screen", async ({ page }) => {
    await openLevel(page, SMALL);
    await zoomIn(page).click();
    const v = await page.locator("#viewport").boundingBox();
    await page.mouse.move(v.x + 20, v.y + 20);
    await page.mouse.down();
    await page.mouse.move(v.x + v.width - 20, v.y + v.height - 20, { steps: 10 });
    await page.mouse.up();
    const s = await page.locator("#stage").boundingBox();
    // Zoomed past the viewport, the painting still covers it: its left edge is not inside.
    expect(s.x).toBeLessThanOrEqual(v.x + 1);
  });

  test("a tiny wobble while tapping still counts as a tap", async ({ page }) => {
    await openLevel(page, SMALL);
    const key = keysOf(level)[0];
    const p = await screenPoint(page, targetOf(level, key));
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 4, p.y + 3, { steps: 3 });
    await page.mouse.up();
    await expect(ring(page, key)).toHaveCount(1);
  });
});

test.describe("tapping while zoomed", () => {
  test("finds the thing under the finger at any zoom", async ({ page }) => {
    await openLevel(page, SMALL);
    for (const [i, key] of keysOf(level).entries()) {
      if (await zoomFit(page).isEnabled()) await zoomFit(page).click();
      // Zoom over the target, so it stays under the cursor, by a different amount each time.
      const at = await screenPoint(page, targetOf(level, key));
      await page.mouse.move(at.x, at.y);
      await page.mouse.wheel(0, -150 * (i + 1));
      await expect.poll(() => stageScale(page)).toBeGreaterThan(1.1);
      await tapTarget(page, level, key);
      await expect(ring(page, key), `${key} at ${await stageScale(page)}x`).toHaveCount(1);
    }
  });

  test("a ring is never drawn smaller than 44px on screen, at any zoom", async ({ page }) => {
    await openLevel(page, SMALL);
    const key = keysOf(level)[0];
    const t = targetOf(level, key);
    await tapTarget(page, level, key);
    for (let z = 0; z < 3; z++) {
      await ring(page, key).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const painting = await page.locator("#stage").boundingBox();
      const drawn = (await ring(page, key).boundingBox()).width;
      // Matches the tap tolerance: the target's own circle, or the 44px floor if that is bigger.
      expect(drawn).toBeCloseTo(Math.max(t.r * 2 * painting.width, 44), 0);
      await zoomIn(page).click();
    }
  });
});

test.describe("pinch", () => {
  test.use({ hasTouch: true });

  test("spreading two fingers zooms in, pinching zooms back out", async ({ page }) => {
    await openLevel(page, SMALL);
    const v = await page.locator("#viewport").boundingBox();
    const c = { x: v.x + v.width / 2, y: v.y + v.height / 2 };

    await pinch(page, c, 100, 250);
    const zoomed = await stageScale(page);
    expect(zoomed).toBeGreaterThan(2);
    expect(zoomed).toBeLessThanOrEqual(MAX);

    await pinch(page, c, 250, 100);
    expect(await stageScale(page)).toBeLessThan(zoomed);
    await expect(page.locator("#stage .ring")).toHaveCount(0); // a pinch is never a tap
  });

  test("a one-finger touch on a target finds it", async ({ page }) => {
    await openLevel(page, SMALL);
    const key = keysOf(level)[0];
    const p = await screenPoint(page, targetOf(level, key));
    await page.touchscreen.tap(p.x, p.y);
    await expect(ring(page, key)).toHaveCount(1);
  });
});

test.describe("image tiers", () => {
  test("upgrades from fit to play straight away, and to zoom past 1.6x", async ({ page }) => {
    await openLevel(page, SMALL);
    await expect.poll(() => paintingSrc(page)).toMatch(/\/play\.[0-9a-f]+\.avif$/);
    await zoomIn(page).click(); // 1.7x
    await expect.poll(() => paintingSrc(page)).toMatch(/\/zoom\.[0-9a-f]+\.avif$/);
  });

  test("never drops back to a blurrier tier on zooming out", async ({ page }) => {
    await openLevel(page, SMALL);
    await zoomIn(page).click();
    await expect.poll(() => paintingSrc(page)).toMatch(/\/zoom\./);
    await zoomFit(page).click();
    await page.waitForTimeout(300);
    expect(await paintingSrc(page)).toMatch(/\/zoom\./);
  });

  test("a browser without AVIF stays on fit, which has WebP", async ({ page }) => {
    // Break only the 1px AVIF probe; everything else loads as usual.
    await page.addInitScript(() => {
      const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
      Object.defineProperty(HTMLImageElement.prototype, "src", {
        get() { return src.get.call(this); },
        set(v) { src.set.call(this, String(v).startsWith("data:image/avif") ? "data:," : v); },
      });
    });
    await openLevel(page, SMALL);
    await zoomIn(page).click();
    await page.waitForTimeout(300);
    expect(await paintingSrc(page)).toMatch(/\/fit\.[0-9a-f]+\.webp$/);
  });

  test("?tier=fit pins the tier, even zoomed in", async ({ page }) => {
    await openLevel(page, SMALL, "&tier=fit");
    await zoomIn(page).click();
    await zoomIn(page).click();
    await page.waitForTimeout(300);
    expect(await paintingSrc(page)).toMatch(/\/fit\.[0-9a-f]+\.webp$/);
  });

  test("a sharper tier that fails to load leaves the painting showing", async ({ page }) => {
    await page.route(/\/(play|zoom)\.[0-9a-f]+\.avif$/, (r) => r.fulfill({ status: 404 }));
    await openLevel(page, SMALL);
    await zoomIn(page).click();
    await page.waitForTimeout(300);
    expect(await paintingSrc(page)).toMatch(/\/fit\./);
    expect(await page.locator("#painting").evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("held upright, the game asks to be turned sideways", async ({ page }) => {
    await openLevel(page, SMALL);
    await expect(page.locator("#rotate")).toBeVisible();
    await expect(page.locator("#rotate-text")).toHaveText("Turn your phone sideways to play");
  });

  test("the picker does not ask", async ({ page }) => {
    await page.goto("/play/");
    await expect(page.locator("#home")).toBeVisible();
    await expect(page.locator("#rotate")).toBeHidden();
  });

  test("turned sideways, the prompt goes and the game is playable", async ({ page }) => {
    await openLevel(page, SMALL);
    await page.setViewportSize({ width: 812, height: 375 });
    await expect(page.locator("#rotate")).toBeHidden();
    // The stage is remeasured on resize, so targets are still where the painting says.
    // Upright, the painting is under 375px wide; sideways it is wider. Wait for the remeasure.
    await expect.poll(async () => (await page.locator("#stage").boundingBox()).width).toBeGreaterThan(400);
    const key = keysOf(level)[0];
    const p = await screenPoint(page, targetOf(level, key));
    await page.touchscreen.tap(p.x, p.y);
    await expect(ring(page, key)).toHaveCount(1);
  });
});
