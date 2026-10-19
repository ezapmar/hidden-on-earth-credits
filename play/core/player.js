/**
 * Who plays on this device. Ported from `Party/Player.swift`, the profile half of it: the
 * iPad app also keeps finished games played together, and nothing here plays together yet, so
 * `GameEvent`, `Award` and `PartyRecord` are deliberately not ported.
 *
 * The shapes that are here match Swift field for field, because the two platforms have to
 * describe a profile the same way or the first family-sync message is a migration.
 */
/**
 * How old a player is, to the nearest handful of years. A band, never a birthdate: nothing
 * here says who the player is.
 *
 * The strings are the stored values, as Swift's `AgeBand.RawValue` is.
 */
export const AGE_BANDS = ["3-5", "6-8", "9-12", "13-17", "18+"];
/** Youngest first, mirroring `AgeBand.order`. */
export function bandOrder(band) {
    const i = AGE_BANDS.indexOf(band);
    return i < 0 ? 0 : i;
}
export function isGrownUp(band) {
    return band === "18+";
}
export function isAgeBand(value) {
    return typeof value === "string" && AGE_BANDS.includes(value);
}
/** What this player typed, with the spaces either side taken off; empty when nothing. */
export function trimmedName(player) {
    return player.name?.trim() ?? "";
}
/**
 * A random id. `crypto.randomUUID` needs a secure context, which the Capacitor shell and the
 * site both are, but a plain `http://` page on a phone is not, so there is a fallback: an id
 * only has to be unique within one device's roster.
 */
export function newPlayerID() {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === "function")
        return c.randomUUID();
    if (c && typeof c.getRandomValues === "function") {
        const bytes = c.getRandomValues(new Uint8Array(16));
        return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}
export function makePlayer(fields) {
    const typed = fields.name?.trim() ?? "";
    const player = {
        id: fields.id ?? newPlayerID(),
        avatar: fields.avatar,
        band: fields.band,
        recent: [...(fields.recent ?? [])],
    };
    if (typed !== "")
        player.name = typed;
    return player;
}
/** One roster entry as it was written, turned into a `Player`, or null if it cannot be read. */
export function parsePlayer(raw) {
    if (typeof raw !== "object" || raw === null)
        return null;
    const o = raw;
    if (typeof o["id"] !== "string" || o["id"] === "")
        return null;
    if (typeof o["avatar"] !== "string" || o["avatar"] === "")
        return null;
    if (!isAgeBand(o["band"]))
        return null;
    const recent = Array.isArray(o["recent"]) ? o["recent"].filter((v) => typeof v === "string") : [];
    return makePlayer({
        id: o["id"],
        name: typeof o["name"] === "string" ? o["name"] : null,
        avatar: o["avatar"],
        band: o["band"],
        recent,
    });
}
