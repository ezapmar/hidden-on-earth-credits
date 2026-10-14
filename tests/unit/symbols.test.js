// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { symbolSVG } from "../../play/symbols.js";
import { readRepoJSON } from "../fixtures/repo.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const d = (svg) => svg.querySelector("path").getAttribute("d");

describe("symbolSVG", () => {
  it("draws a decorative 24x24 SVG in the SVG namespace", () => {
    const svg = symbolSVG("star.fill");
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.querySelector("path").namespaceURI).toBe(SVG_NS);
  });

  it("falls back to the palette for an SF Symbol it does not know", () => {
    expect(d(symbolSVG("no.such.symbol"))).toBe(d(symbolSVG("paintpalette.fill")));
  });

  it("splits a class list with spaces (classList.add would throw on it)", () => {
    const svg = symbolSVG("star.fill", "symbol  star big");
    expect([...svg.classList]).toEqual(["symbol", "star", "big"]);
  });

  it("strokes line symbols and fills the rest", () => {
    const line = symbolSVG("snowflake").querySelector("path");
    expect(line.getAttribute("fill")).toBe("none");
    expect(line.getAttribute("stroke")).toBe("currentColor");
    expect(symbolSVG("pawprint.fill").querySelector("path").getAttribute("fill")).toBe("currentColor");
  });

  // A known gap: Still Life is in the demo and shows the palette until someone draws a basket.
  // Delete the entry once PATHS has it; the test fails until you do, so the list cannot rot.
  const KNOWN_MISSING = new Set(["basket.fill"]);

  it("has a drawing for the symbol of every row the picker shows", () => {
    const { collections, levels } = readRepoJSON("play/levels.json");
    const fallback = d(symbolSVG("paintpalette.fill"));
    const shown = collections.filter((c) => !c.personal && levels.some((l) => l.collection === c.id));
    expect(shown.length).toBeGreaterThan(0);
    for (const c of shown) {
      if (c.symbol === "paintpalette.fill") continue;
      const drawn = d(symbolSVG(c.symbol)) !== fallback;
      expect(drawn, `collection "${c.id}" names "${c.symbol}"`).toBe(!KNOWN_MISSING.has(c.symbol));
    }
  });
});
