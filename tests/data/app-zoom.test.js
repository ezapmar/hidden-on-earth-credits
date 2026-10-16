/* assets/zoom holds the iPad app's zoom tier, which the app downloads by the exact name in its
   own manifest. The app's manifest lives in the game repository, so this checks what can be
   checked from here: every file is what its name says, and none is a family picture. */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nameMatchesBytes, ZOOM_DIR } from "../../tools/publish-app-zoom.mjs";
import { readRepoText, repoPath } from "../fixtures/repo.js";

const levels = readdirSync(repoPath(ZOOM_DIR));
const files = levels.flatMap((level) => readdirSync(repoPath(ZOOM_DIR, level)).map((name) => ({ level, name })));

describe("assets/zoom", () => {
  it("holds the app's zoom files", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f.name, f.level).toMatch(/^zoom\.[0-9a-f]{10}\.avif$/);
  });

  it("names every file by the hash of its bytes, so it can be served immutable", () => {
    for (const f of files) {
      expect(nameMatchesBytes(f.name, readFileSync(repoPath(ZOOM_DIR, f.level, f.name))), `${f.level}/${f.name}`).toBe(true);
    }
  });

  it("publishes none of the family's own pictures", () => {
    expect(levels.filter((l) => l.startsWith("yours_"))).toEqual([]);
  });

  it("is served immutable", () => {
    expect(readRepoText("_headers")).toMatch(/\/assets\/zoom\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  });
});
