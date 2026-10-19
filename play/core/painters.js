/**
 * The painters a player can choose to be. Ported from the `Painters` half of
 * `Party/PartyResources.swift`.
 *
 * Every painter here painted something in the game, so the face in the circle is the hand
 * behind a painting the child has already looked into. `painters.json` is written by
 * `tools/build-painters.mjs` in the credits repository, which also encodes the 256px portraits
 * and writes each file's content-hashed name back into the manifest — so one file carries both
 * the picture and who is in it.
 *
 * Reading the manifest is the platform's job: Swift reaches into the app bundle, the web shell
 * fetches it. This module only turns what came back into painters.
 */
import { pick } from "./l10n.js";
export function painterName(painter) {
    return pick(painter.names);
}
function names(raw) {
    if (typeof raw !== "object" || raw === null)
        return null;
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string")
            out[k] = v;
    }
    return Object.keys(out).length === 0 ? null : out;
}
/**
 * `painters.json`, in the order it lists them. An entry missing anything the circle needs is
 * dropped rather than drawn as a hole: the manifest is built, so a gap is a pipeline bug, and
 * the child should still get seven painters while it is fixed.
 */
export function parsePainters(raw) {
    const root = typeof raw === "object" && raw !== null ? raw : {};
    const list = Array.isArray(root["painters"]) ? root["painters"] : [];
    const painters = [];
    for (const entry of list) {
        if (typeof entry !== "object" || entry === null)
            continue;
        const o = entry;
        const id = o["id"];
        const file = o["file"];
        const n = names(o["names"]);
        if (typeof id !== "string" || id === "")
            continue;
        if (typeof file !== "string" || file === "")
            continue;
        if (n === null)
            continue;
        painters.push({
            id,
            names: n,
            lived: typeof o["lived"] === "string" ? o["lived"] : "",
            work: typeof o["work"] === "string" ? o["work"] : "",
            year: typeof o["year"] === "string" ? o["year"] : "",
            file,
        });
    }
    return painters;
}
