/* tools/make-play-data.mjs is what keeps the family's pictures out of a public repository and the
   demo to its fixed list. It is run here against a game catalogue built from the committed demo
   plus the things it must refuse, never against ../seek-and-find. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readRepoJSON, readRepoText, repoPath } from "../fixtures/repo.js";

const committed = readRepoJSON("play/levels.json");
const personalCollection = committed.collections.find((c) => c.personal).id;

let dir;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "play-data-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** The game's levels.json as the Swift repo holds it: the demo, plus more, plus build-only fields. */
function gameCatalogue({ drop = [] } = {}) {
  const extra = (id, collection) => ({
    id, collection, titles: { en: id }, artist: "Someone", imageName: id, aspect: { w: 100, h: 100 },
    items: [{ id: "thing", names: { en: "Thing" }, targets: [{ x: 0.5, y: 0.5, r: 0.05 }] }],
  });
  return {
    collections: committed.collections,
    levels: [
      ...committed.levels
        .filter((l) => !drop.includes(l.id))
        // Fields the game keeps for the image build; none of them may be published.
        .map((l) => ({ ...l, source: `Sources/${l.id}.jpg`, license: "CC0" })),
      extra("dunya_drawing", personalCollection),
      extra("not_in_demo", "animals"),
    ],
  };
}

function run(catalogue, ...args) {
  const levels = path.join(dir, "levels.json");
  writeFileSync(levels, JSON.stringify(catalogue));
  const res = spawnSync(process.execPath, [repoPath("tools/make-play-data.mjs"), "--levels", levels, ...args], { encoding: "utf8" });
  return { ...res, out: path.join(dir, "out.json") };
}

describe("make-play-data", () => {
  it("reproduces the committed play/levels.json byte for byte", () => {
    const out = path.join(dir, "out.json");
    const res = run(gameCatalogue(), "--out", out);
    expect(res.status, res.stderr).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(readRepoText("play/levels.json"));
  });

  it("refuses the personal collection's pictures and holds back what is not in the demo", () => {
    const out = path.join(dir, "out.json");
    const res = run(gameCatalogue(), "--out", out);
    const ids = JSON.parse(readFileSync(out, "utf8")).levels.map((l) => l.id);
    expect(ids).not.toContain("dunya_drawing");
    expect(ids).not.toContain("not_in_demo");
    expect(res.stdout).toMatch(/refused 1 personal: dunya_drawing/);
    expect(res.stdout).toMatch(/held back 1 not in the demo list/);
  });

  it("publishes only what the game needs to play", () => {
    const out = path.join(dir, "out.json");
    run(gameCatalogue(), "--out", out);
    const text = readFileSync(out, "utf8");
    expect(text).not.toContain("Sources/");
    expect(text).not.toContain("license");
  });

  it("--check passes on an up-to-date copy and writes nothing", () => {
    const out = path.join(dir, "out.json");
    run(gameCatalogue(), "--out", out);
    const before = readFileSync(out, "utf8");
    const res = run(gameCatalogue(), "--out", out, "--check");
    expect(res.status).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(before);
  });

  it("--check fails on a stale copy, and on a missing one", () => {
    const out = path.join(dir, "out.json");
    writeFileSync(out, "{}\n");
    let res = run(gameCatalogue(), "--out", out, "--check");
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/out of date/);
    expect(readFileSync(out, "utf8")).toBe("{}\n");

    res = run(gameCatalogue(), "--out", path.join(dir, "nothing.json"), "--check");
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/does not exist/);
  });

  it("stops when the demo list names a painting the game no longer has", () => {
    const res = run(gameCatalogue({ drop: ["hokusai_great_wave"] }), "--out", path.join(dir, "out.json"));
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/not in the game: hokusai_great_wave/);
  });

  it("rejects an unknown argument", () => {
    const res = run(gameCatalogue(), "--frobnicate");
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/unknown argument --frobnicate/);
  });
});
