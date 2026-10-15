// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderPicker, renderStickerBook } from "../../play/home.js";
import { allKeys, loadFixture, lvl } from "../fixtures/library.js";

let root, state;
beforeEach(() => {
  state = loadFixture();
  root = document.createElement("main");
  document.body.replaceChildren(root);
});

const text = (n) => n?.textContent.trim().replace(/\s+/g, " ");
const card = (title) => [...root.querySelectorAll(".card-painting")].find((c) => text(c.querySelector("h3")) === title);
const row = (title) => [...root.querySelectorAll("section")].find((s) => text(s.querySelector("h2")) === title);
const finish = (id) => state.progress.markCompleted(lvl(id));
const findSome = (id, n) => state.progress.saveFound(new Set(allKeys(lvl(id)).slice(0, n)), lvl(id));

describe("picker", () => {
  it("shows one row per collection with paintings, plus the personal invitation and the catch-all", () => {
    renderPicker(root, { onPick() {}, onStickers() {} });
    expect([...root.querySelectorAll("section h2")].map(text))
      .toEqual(["Animals", "Winter", "Your collection", "More paintings"]);
  });

  it("shows a card per painting with its title, artist and how many things to find", () => {
    renderPicker(root, { onPick() {}, onStickers() {} });
    expect(root.querySelectorAll("button.card-painting")).toHaveLength(5);
    const ark = card("Noah's Ark");
    expect(text(ark.querySelector(".artist"))).toBe("Painter of Noah's Ark");
    expect(text(ark.querySelector(".count"))).toBe("Find 3 things");
    expect(ark.getAttribute("aria-label")).toBe("Noah's Ark");
    expect(ark.getAttribute("aria-description")).toBe("0 / 3 found");
    expect(ark.querySelector("source").srcset).toBe("../assets/img/ark/card.avif");
  });

  it("calls onPick with the level id when a card is tapped", () => {
    const onPick = vi.fn();
    renderPicker(root, { onPick, onStickers() {} });
    card("Hunters").click();
    expect(onPick).toHaveBeenCalledWith("snow");
  });

  it("shows a progress bar and 'n / m found' on a half-finished painting", () => {
    findSome("snow", 1);
    renderPicker(root, { onPick() {}, onStickers() {} });
    const c = card("Hunters");
    expect(text(c.querySelector(".count"))).toBe("1 / 3 found");
    expect(c.querySelector(".bar i").style.width).toBe(`${(1 / 3) * 100}%`);
    expect(c.classList.contains("done")).toBe(false);
  });

  it("has no progress bar on an untouched painting", () => {
    renderPicker(root, { onPick() {}, onStickers() {} });
    expect(card("Hunters").querySelector(".bar")).toBeNull();
    expect(card("Hunters").querySelector(".card-star")).toBeNull();
  });

  it("marks a finished painting with a gold star and no progress bar", () => {
    finish("zoo");
    renderPicker(root, { onPick() {}, onStickers() {} });
    const c = card("Menagerie");
    expect(c.classList.contains("done")).toBe(true);
    expect(c.querySelector(".card-star svg")).not.toBeNull();
    expect(c.querySelector(".bar")).toBeNull();
    expect(c.querySelector(".count").classList.contains("done")).toBe(true);
    expect(c.getAttribute("aria-description")).toBe("Completed");
  });

  it("shows a row's star count only once something in it is finished, gold when all are", () => {
    renderPicker(root, { onPick() {}, onStickers() {} });
    expect(row("Animals").querySelector(".row-count")).toBeNull();

    finish("ark");
    renderPicker(root, { onPick() {}, onStickers() {} });
    let pill = row("Animals").querySelector(".row-count");
    expect(text(pill)).toBe("1 / 2");
    expect(pill.classList.contains("all")).toBe(false);

    finish("zoo");
    renderPicker(root, { onPick() {}, onStickers() {} });
    pill = row("Animals").querySelector(".row-count");
    expect(text(pill)).toBe("2 / 2");
    expect(pill.classList.contains("all")).toBe(true);
  });

  it("puts the 'add your own picture' card, and only that, in the personal row", () => {
    renderPicker(root, { onPick() {}, onStickers() {} });
    const personal = row("Your collection");
    expect(personal.querySelector(".row-symbol.personal")).not.toBeNull();
    expect(personal.querySelectorAll(".card-painting")).toHaveLength(1);
    const add = personal.querySelector(".card-painting.add");
    expect(add.tagName).toBe("DIV"); // an invitation, not a control, until the web editor exists
    expect(text(add.querySelector("h3"))).toBe("Add your own picture!");
  });

  it("shows the sticker count on the sticker book button and opens the book", () => {
    finish("ark");
    const onStickers = vi.fn();
    renderPicker(root, { onPick() {}, onStickers });
    const book = root.querySelector(".book-button");
    expect(text(book)).toContain("1 / 5");
    expect(book.getAttribute("aria-label")).toBe("Sticker Book, 1 / 5 stickers");
    book.click();
    expect(onStickers).toHaveBeenCalledOnce();
  });

  it("ends with the iOS app promo, saying 'coming soon' until there is a store link", () => {
    renderPicker(root, { onPick() {}, onStickers() {} });
    const promo = root.lastElementChild;
    expect(promo.classList.contains("app-promo")).toBe(true);
    expect(promo.querySelector("a")).toBeNull();
    expect(text(promo.querySelector(".app-badge.soon"))).toBe("Coming soon to the App Store");
  });

  it("replaces what was there on a re-render instead of appending", () => {
    renderPicker(root, { onPick() {}, onStickers() {} });
    renderPicker(root, { onPick() {}, onStickers() {} });
    expect(root.querySelectorAll(".home-bar")).toHaveLength(1);
    expect(root.querySelectorAll(".app-promo")).toHaveLength(1);
  });

  it("escapes titles rather than parsing them as HTML", () => {
    state.library.levels[0] = { ...state.library.levels[0], titles: { en: "<img src=x onerror=alert(1)>" } };
    renderPicker(root, { onPick() {}, onStickers() {} });
    expect(root.querySelector("h3 img")).toBeNull();
  });
});

describe("sticker book", () => {
  it("counts collected stickers in the lead", () => {
    finish("ark");
    finish("snow");
    renderStickerBook(root, { onPick() {}, onHome() {} });
    expect(text(root.querySelector(".book-head h1"))).toBe("Sticker Book");
    expect(text(root.querySelector(".lead"))).toBe("2 / 5 stickers");
  });

  it("leaves out the empty personal row", () => {
    renderStickerBook(root, { onPick() {}, onHome() {} });
    expect([...root.querySelectorAll("section h2")].map(text)).toEqual(["Animals", "Winter", "More paintings"]);
  });

  it("shows a locked slot for an unfinished painting, without giving away its title", () => {
    findSome("snow", 2);
    renderStickerBook(root, { onPick() {}, onHome() {} });
    const slots = [...root.querySelectorAll(".slot")];
    expect(slots).toHaveLength(5);
    const locked = slots.find((s) => !s.classList.contains("unlocked"));
    expect(text(locked.querySelector(".slot-name"))).toBe("? ? ?");
    expect(locked.getAttribute("aria-label")).toBe("Finish the painting to earn this sticker");
    expect(locked.querySelector("img")).toBeNull();
    expect(root.textContent).not.toContain("Hunters");
  });

  it("shows the sticker and title for a finished painting", () => {
    finish("snow");
    renderStickerBook(root, { onPick() {}, onHome() {} });
    const slot = root.querySelector(".slot.unlocked");
    expect(text(slot.querySelector(".slot-name"))).toBe("Hunters");
    expect(slot.getAttribute("aria-label")).toBe("Hunters");
    expect(slot.querySelector("source").srcset).toBe("../assets/img/snow/sticker.avif");
  });

  it("opens the painting from any slot, locked or not", () => {
    finish("ark");
    const onPick = vi.fn();
    renderStickerBook(root, { onPick, onHome() {} });
    const slots = root.querySelectorAll(".slot");
    slots[0].click();
    slots[1].click();
    expect(onPick.mock.calls).toEqual([["ark"], ["zoo"]]);
  });

  it("goes home from the back button", () => {
    const onHome = vi.fn();
    renderStickerBook(root, { onPick() {}, onHome });
    root.querySelector("button.back").click();
    expect(onHome).toHaveBeenCalledOnce();
    expect(root.querySelector("button.back").getAttribute("aria-label")).toBe("Paintings");
  });
});
