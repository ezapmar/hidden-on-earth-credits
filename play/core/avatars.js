/**
 * The pictures a player can choose to be. Ported from the `Avatars` half of
 * `Party/PartyResources.swift`. Three kinds, told apart by the stored string:
 *
 * - `"level/group"` — an animal cut out of a painting, which the image pipeline already makes
 *   as an item thumbnail. Only from the public paintings, never from the family's own.
 * - `"painter:vangogh"` — one of the painters whose work is in the game.
 * - `"photo:<file>"` — a picture from this device, kept where only this device can read it.
 *   It never leaves the device and no copy of it is kept anywhere else.
 *
 * The one deliberate difference from Swift: `Avatars` there asks the file system whether a
 * picture is still there and hands back a `URL`. A URL means the DOM, and the core has no DOM,
 * so this takes predicates for "is it still there" and hands back a *description* of the
 * picture — painter file, photo file, or painting and item — which the platform turns into a
 * URL. The resolution rules, including which stand-in an absent picture gets, stay identical.
 */
import { painterName } from "./painters.js";
import { trimmedName } from "./player.js";
import { pick, t } from "./l10n.js";
/** The prefixes that say what kind of picture an avatar string names. */
export const PAINTER_PREFIX = "painter:";
export const PHOTO_PREFIX = "photo:";
export function painterID(avatar) {
    return avatar.startsWith(PAINTER_PREFIX) ? avatar.slice(PAINTER_PREFIX.length) : null;
}
export function photoFile(avatar) {
    return avatar.startsWith(PHOTO_PREFIX) ? avatar.slice(PHOTO_PREFIX.length) : null;
}
export function painterAvatar(id) {
    return PAINTER_PREFIX + id;
}
export function photoAvatar(file) {
    return PHOTO_PREFIX + file;
}
/** "level/group" split, or null when the string does not name an item at all. */
export function itemAvatar(avatar) {
    const slash = avatar.indexOf("/");
    if (slash <= 0 || slash === avatar.length - 1)
        return null;
    return { levelId: avatar.slice(0, slash), groupId: avatar.slice(slash + 1) };
}
export function parseAvatarEntries(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const entry of raw) {
        if (typeof entry !== "object" || entry === null)
            continue;
        const o = entry;
        if (typeof o["id"] !== "string" || o["id"] === "")
            continue;
        const names = {};
        if (typeof o["names"] === "object" && o["names"] !== null) {
            for (const [k, v] of Object.entries(o["names"])) {
                if (typeof v === "string")
                    names[k] = v;
            }
        }
        out.push(Object.keys(names).length > 0 ? { id: o["id"], names } : { id: o["id"] });
    }
    return out;
}
/**
 * FNV-1a, 64 bits, ported from `TitleEngine.hash`. It decides which picture stands in for one
 * that has gone, so the two platforms must agree byte for byte or the same player shows a
 * different animal on the iPad and on the phone. BigInt because the multiply overflows 53 bits
 * on the first byte.
 */
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;
export function hash(text) {
    let h = FNV_OFFSET;
    for (const byte of new TextEncoder().encode(text)) {
        h ^= BigInt(byte);
        h = (h * FNV_PRIME) & MASK64;
    }
    return h;
}
/**
 * The pictures on offer and what they are called. One instance per device, built once the
 * manifests have been read.
 */
export class Avatars {
    #sources;
    #names;
    constructor(sources) {
        this.#sources = sources;
        // The item's own names, replaced by the avatar's where it has some. Built from every item,
        // not only the listed ones, so a player saved with a picture that has since left the list
        // still has a name.
        this.#names = new Map();
        for (const level of sources.library.levels) {
            for (const group of level.items) {
                this.#names.set(`${level.id}/${group.id}`, group.names);
            }
        }
        for (const entry of sources.entries) {
            if (entry.names)
                this.#names.set(entry.id, entry.names);
        }
    }
    /** "level/group", in the order they are offered; only the ones whose picture is there. */
    get all() {
        return this.#sources.entries.map((e) => e.id).filter((id) => this.#picture(id) !== null);
    }
    get painters() {
        return this.#sources.painters;
    }
    painter(id) {
        return this.#sources.painters.find((p) => p.id === id) ?? null;
    }
    /**
     * The picture itself, if it is still there: the painting an animal was cut from can leave the
     * game, a painter can leave `painters.json`, and a photo can be replaced.
     */
    #picture(avatar) {
        const pid = painterID(avatar);
        if (pid !== null) {
            const painter = this.painter(pid);
            return painter ? { kind: "painter", id: painter.id, file: painter.file } : null;
        }
        const file = photoFile(avatar);
        if (file !== null) {
            return this.#sources.hasPhoto(file) ? { kind: "photo", file } : null;
        }
        const item = itemAvatar(avatar);
        if (item === null)
            return null;
        return this.#sources.hasThumb(item.levelId, item.groupId)
            ? { kind: "item", levelId: item.levelId, groupId: item.groupId }
            : null;
    }
    /**
     * `avatar`, or the picture that stands in for it. A player keeps the avatar they chose, but a
     * painting can leave the game and take its animals with it; that player then gets one of the
     * pictures on offer, always the same one, instead of an empty circle.
     */
    resolved(avatar) {
        if (this.#picture(avatar) !== null)
            return avatar;
        const offered = this.all;
        if (offered.length === 0)
            return avatar;
        const index = Number(hash(avatar) % BigInt(offered.length));
        return offered[index] ?? avatar;
    }
    /** The picture to draw for this avatar, stand-in included, or null when there is none. */
    picture(avatar) {
        return this.#picture(this.resolved(avatar));
    }
    /**
     * "Lion" or "Van Gogh", the way the game writes it. A photo the child brought has no name of
     * its own; the profile that chose it has one.
     */
    name(avatar) {
        const pid = painterID(avatar);
        if (pid !== null) {
            const painter = this.painter(pid);
            if (painter)
                return painterName(painter);
        }
        if (photoFile(avatar) !== null)
            return t("yourOwnPicture");
        return pick(this.#names.get(this.resolved(avatar)) ?? {});
    }
    /** The same, for the voice. A picture a child brought themselves has no name of its own. */
    spokenName(avatar) {
        const pid = painterID(avatar);
        if (pid !== null) {
            const painter = this.painter(pid);
            if (painter)
                return painter.names["en"] ?? "";
        }
        if (photoFile(avatar) !== null)
            return "";
        return this.#names.get(this.resolved(avatar))?.["en"] ?? "";
    }
}
/** What to call this player: their name, or what their picture is called. */
export function displayName(avatars, player) {
    const typed = trimmedName(player);
    return typed === "" ? avatars.name(player.avatar) : typed;
}
/**
 * The same, for the voice. A picture a child brought themselves has no name of its own, so this
 * can be empty; what is read aloud then leaves the player out rather than reading a file name.
 */
export function spokenName(avatars, player) {
    const typed = trimmedName(player);
    return typed === "" ? avatars.spokenName(player.avatar) : typed;
}
/** The player inside a sentence: "that one is for **Ada**", "for **the Lion**". */
export function spokenInSentence(avatars, player) {
    const typed = trimmedName(player);
    if (typed !== "")
        return typed;
    const picture = avatars.spokenName(player.avatar);
    return picture === "" ? "someone else" : `the ${picture}`;
}
