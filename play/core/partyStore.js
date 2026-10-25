/**
 * The players on this device and which of them made a profile. Ported from
 * `Party/PartyStore.swift`, the roster half of it: nothing on the web plays together yet, so
 * the finished games — `sessions/*.json` and the album — are not ported, while the fields that
 * order them (`device`, `next`) are kept so adding them later is not a migration.
 *
 * Swift writes `players.json` into the app's own folder. Here the same JSON lives under one
 * localStorage key, which is this device's own storage in exactly the same sense: same origin
 * only, no network, and cleared with the app's data. Nothing here is sent anywhere, and the
 * roster holds no birthdate and no time of day. The one player who made a profile may have
 * typed a name into it; that name stays in this storage like everything else.
 */
import { makePlayer, newPlayerID, parsePlayer } from "./player.js";
import { photoFile } from "./avatars.js";
const ROSTER_KEY = "partyRoster";
const CURRENT_SCHEMA = 1;
function emptyRoster() {
    return { schema: CURRENT_SCHEMA, device: newPlayerID(), next: 1, players: [] };
}
function readRoster(store) {
    const raw = store.getItem(ROSTER_KEY);
    if (raw === null)
        return null;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        // A corrupt roster must not throw out of the constructor and take the picker with it.
        return null;
    }
    if (typeof parsed !== "object" || parsed === null)
        return null;
    const o = parsed;
    const players = Array.isArray(o["players"])
        ? o["players"].map(parsePlayer).filter((p) => p !== null)
        : [];
    const roster = {
        schema: typeof o["schema"] === "number" ? o["schema"] : CURRENT_SCHEMA,
        device: typeof o["device"] === "string" && o["device"] !== "" ? o["device"] : newPlayerID(),
        next: typeof o["next"] === "number" && o["next"] >= 1 ? o["next"] : 1,
        players,
    };
    // An id pointing at a player who is no longer in the roster is the same as no profile.
    if (typeof o["me"] === "string" && players.some((p) => p.id === o["me"]))
        roster.me = o["me"];
    return roster;
}
export class PartyStore {
    #store;
    #onPhotosInUse;
    #roster;
    constructor(store, options = {}) {
        this.#store = store;
        this.#onPhotosInUse = options.onPhotosInUse;
        const saved = readRoster(store);
        this.#roster = saved ?? emptyRoster();
        if (saved === null)
            this.#save();
    }
    /** This device's own id, which orders finished games from two devices. */
    get device() {
        return this.#roster.device;
    }
    get players() {
        return this.#roster.players;
    }
    player(id) {
        return this.#roster.players.find((p) => p.id === id) ?? null;
    }
    // MARK: Players
    /** A player for a game played together: a picture and an age band, and nothing to type. */
    addPlayer(avatar, band) {
        const player = makePlayer({ avatar, band });
        this.#roster.players.push(player);
        this.#save();
        return player;
    }
    remove(player) {
        this.#roster.players = this.#roster.players.filter((p) => p.id !== player.id);
        if (this.#roster.me === player.id)
            delete this.#roster.me;
        this.#save();
    }
    // MARK: The profile
    /**
     * Whoever made a profile on this device: one player, with a name if they typed one. They are
     * an ordinary player too, so they can be picked for a game played together and the shelf
     * shows what they have collected.
     */
    get me() {
        const id = this.#roster.me;
        return id === undefined ? null : this.player(id);
    }
    /**
     * Writes the profile, making the player the first time. The same player is kept and edited
     * after that, so changing the picture or the age does not lose the titles they have already
     * been given.
     */
    setMe(fields) {
        const typed = fields.name?.trim() ?? "";
        const existing = this.me;
        const player = existing
            ? { ...existing, avatar: fields.avatar, band: fields.band }
            : makePlayer({ avatar: fields.avatar, band: fields.band });
        if (typed === "")
            delete player.name;
        else
            player.name = typed;
        const i = this.#roster.players.findIndex((p) => p.id === player.id);
        if (i >= 0)
            this.#roster.players[i] = player;
        else
            this.#roster.players.push(player);
        this.#roster.me = player.id;
        this.#save();
        return player;
    }
    /** Forgets every player, the profile and its picture with them. */
    reset() {
        this.#roster = { ...emptyRoster(), device: this.#roster.device, next: this.#roster.next };
        this.#store.removeItem(ROSTER_KEY);
        this.#onPhotosInUse?.(new Set());
    }
    #save() {
        // The roster in memory is already what the screen shows. localStorage throws when the quota
        // is full and in some private windows, and that must not take the profile screen down with
        // it, nor the constructor on a device that has never had a roster written: the write is lost,
        // the roster is not, and the next save writes all of it again.
        try {
            this.#store.setItem(ROSTER_KEY, JSON.stringify(this.#roster));
        }
        catch {
            // Nothing to do here: the memory is right, and the storage is the platform's problem.
        }
        const used = new Set();
        for (const player of this.#roster.players) {
            const file = photoFile(player.avatar);
            if (file !== null)
                used.add(file);
        }
        this.#onPhotosInUse?.(used);
    }
}
