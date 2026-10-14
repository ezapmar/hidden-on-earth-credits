// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectionRows, imageURLs, levelById, loadData, pictureEl, state, stickerURLs, thumbURLs, tierURLs,
} from "../../play/data.js";
import { loadFixture, MANIFEST, RAW_LEVELS } from "../fixtures/library.js";

describe("image URLs", () => {
  it("resolves both formats against the manifest base, relative to /play/", () => {
    loadFixture();
    expect(tierURLs("ark", "card")).toEqual({ avif: "../assets/img/ark/card.avif", webp: "../assets/img/ark/card.webp" });
  });

  it("returns null for the format a tier does not carry (play and zoom are AVIF only)", () => {
    loadFixture();
    expect(tierURLs("ark", "play")).toEqual({ avif: "../assets/img/ark/play.avif", webp: null });
  });

  it("returns null for anything the manifest does not know", () => {
    loadFixture();
    expect(tierURLs("nope", "card")).toBeNull();
    expect(tierURLs("ark", "zoom")).toBeNull();
    expect(thumbURLs("ark", "nope")).toBeNull();
    expect(stickerURLs("nope")).toBeNull();
    expect(imageURLs(undefined)).toBeNull();
  });

  it("finds thumbs per item group and the sticker per level", () => {
    loadFixture();
    expect(thumbURLs("ark", "owl").avif).toBe("../assets/img/ark/thumb-owl.avif");
    expect(stickerURLs("snow").webp).toBe("../assets/img/snow/sticker.webp");
  });
});

describe("levelById", () => {
  it("finds a level or returns null", () => {
    loadFixture();
    expect(levelById("zoo").titles.en).toBe("Menagerie");
    expect(levelById("missing")).toBeNull();
  });
});

describe("pictureEl", () => {
  it("puts the AVIF source first and the WebP on the img", () => {
    const pic = pictureEl({ avif: "a.avif", webp: "a.webp" }, "A painting", "x");
    expect(pic.tagName).toBe("PICTURE");
    const [source, img] = pic.children;
    expect(source.tagName).toBe("SOURCE");
    expect(source.type).toBe("image/avif");
    expect(source.srcset).toBe("a.avif");
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("a.webp");
    expect(img.alt).toBe("A painting");
    expect(img.className).toBe("x");
    expect(img.loading).toBe("lazy");
  });

  it("falls back to the AVIF on the img when there is no WebP", () => {
    const pic = pictureEl({ avif: "a.avif", webp: null });
    expect(pic.querySelector("img").getAttribute("src")).toBe("a.avif");
  });

  it("leaves out the <source> when there is no AVIF", () => {
    const pic = pictureEl({ avif: null, webp: "a.webp" });
    expect(pic.querySelector("source")).toBeNull();
  });

  it("does not throw on missing URLs", () => {
    const pic = pictureEl(null);
    expect(pic.querySelector("img").getAttribute("src")).toBe("");
    expect(pic.querySelector("img").hasAttribute("class")).toBe(false);
  });
});

describe("collectionRows", () => {
  it("keeps the collection order and the levels' order inside each row", () => {
    loadFixture();
    const rows = collectionRows();
    expect(rows.map((r) => r.collection.id)).toEqual(["animals", "winter", "family", "_more"]);
    expect(rows[0].levels.map((l) => l.id)).toEqual(["ark", "zoo"]);
  });

  it("drops an empty collection but keeps the empty personal one as an invitation", () => {
    loadFixture();
    const ids = collectionRows().map((r) => r.collection.id);
    expect(ids).not.toContain("empty");
    expect(ids).toContain("family");
    expect(collectionRows().find((r) => r.collection.id === "family").levels).toEqual([]);
  });

  it("leaves the empty personal row out when asked (the sticker book)", () => {
    loadFixture();
    expect(collectionRows({ includeEmptyPersonal: false }).map((r) => r.collection.id)).not.toContain("family");
  });

  it("gathers levels naming no known collection, or none, into a last catch-all row", () => {
    loadFixture();
    const more = collectionRows().at(-1);
    expect(more.collection.id).toBe("_more");
    expect(more.collection.titles.en).toBe("More paintings");
    expect(more.levels.map((l) => l.id)).toEqual(["stray", "loose"]);
  });

  it("lists every level exactly once", () => {
    loadFixture();
    const ids = collectionRows().flatMap((r) => r.levels.map((l) => l.id));
    expect(ids.sort()).toEqual(RAW_LEVELS.levels.map((l) => l.id).sort());
  });

  it("has no catch-all row when every level has a home", () => {
    loadFixture();
    state.library = { ...state.library, levels: state.library.levels.filter((l) => l.collection === "animals") };
    expect(collectionRows().map((r) => r.collection.id)).not.toContain("_more");
  });
});

describe("loadData", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubBrowser({ avif }) {
    vi.stubGlobal("fetch", vi.fn(async (url) => ({
      json: async () => (String(url).includes("paintings.json") ? MANIFEST : RAW_LEVELS),
    })));
    // jsdom never decodes images, so stand in for the AVIF probe.
    vi.stubGlobal("Image", class {
      set src(_) {
        queueMicrotask(() => (avif ? (this.width = 1, this.onload()) : this.onerror()));
      }
    });
  }

  it("fetches the manifest and the levels, and parses them", async () => {
    stubBrowser({ avif: true });
    const s = await loadData();
    expect(fetch).toHaveBeenCalledWith("../assets/paintings.json");
    expect(fetch).toHaveBeenCalledWith("./levels.json");
    expect(s.manifest).toBe(MANIFEST);
    expect(s.library.levels).toHaveLength(RAW_LEVELS.levels.length);
    expect(s.avif).toBe(true);
  });

  it("records a browser without AVIF", async () => {
    stubBrowser({ avif: false });
    expect((await loadData()).avif).toBe(false);
  });

  it("reads progress from localStorage, under the Swift app's keys", async () => {
    localStorage.setItem("completedLevelIDs", JSON.stringify(["zoo"]));
    stubBrowser({ avif: true });
    const s = await loadData();
    expect(s.progress.isCompleted(s.library.levels.find((l) => l.id === "zoo"))).toBe(true);
    localStorage.clear();
  });

  it("rejects when the catalogue is malformed, so app.js can say so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ levels: [{ id: "x" }] }) })));
    vi.stubGlobal("Image", class { set src(_) { queueMicrotask(() => this.onerror()); } });
    await expect(loadData()).rejects.toThrow(/levels/);
  });
});
