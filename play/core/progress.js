/**
 * What the child has done so far. Ported from `Game/PlayerProgress.swift`, with localStorage in
 * place of UserDefaults.
 *
 * The two key names and the "dogs#1" target encoding are kept deliberately: family sync would
 * have to send this over the wire, and inventing a second format now means maintaining two.
 */
import { totalTargets } from "./level.js";
import { parseTargetKey } from "./targetKey.js";
const COMPLETED_KEY = "completedLevelIDs";
const PARTIAL_KEY = "partialFoundTargets"; // level id -> ["dogs#0", "moon#0"]
export function memoryStore() {
    const m = new Map();
    return {
        getItem: (k) => m.get(k) ?? null,
        setItem: (k, v) => void m.set(k, v),
        removeItem: (k) => void m.delete(k),
    };
}
function readJSON(store, key) {
    const raw = store.getItem(key);
    if (raw === null)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        // A corrupt entry must not cost the child her stars on every later save, so treat it as
        // absent rather than throwing out of the constructor.
        return null;
    }
}
export class PlayerProgress {
    #store;
    #completed;
    #partial;
    constructor(store) {
        this.#store = store;
        const completed = readJSON(store, COMPLETED_KEY);
        this.#completed = new Set(Array.isArray(completed) ? completed.filter((v) => typeof v === "string") : []);
        this.#partial = new Map();
        const partial = readJSON(store, PARTIAL_KEY);
        if (typeof partial === "object" && partial !== null && !Array.isArray(partial)) {
            for (const [levelId, keys] of Object.entries(partial)) {
                if (!Array.isArray(keys))
                    continue;
                const valid = keys.filter((k) => typeof k === "string" && parseTargetKey(k) !== null);
                this.#partial.set(levelId, new Set(valid));
            }
        }
    }
    get completed() {
        return this.#completed;
    }
    isCompleted(level) {
        return this.#completed.has(level.id);
    }
    /** Targets already found in an unfinished painting; empty when never started or already done. */
    foundTargets(level) {
        return this.#partial.get(level.id) ?? new Set();
    }
    /**
     * Remembers the found targets of a painting in progress. A full set means the painting is
     * finished, so nothing partial is kept for it.
     */
    saveFound(found, level) {
        if (found.size === 0 || found.size >= totalTargets(level)) {
            if (!this.#partial.has(level.id))
                return;
            this.#partial.delete(level.id);
        }
        else {
            const current = this.#partial.get(level.id);
            if (current && current.size === found.size && [...found].every((k) => current.has(k)))
                return;
            this.#partial.set(level.id, new Set(found));
        }
        this.#writePartial();
    }
    markCompleted(level) {
        this.saveFound(new Set(), level);
        if (this.#completed.has(level.id))
            return;
        this.#completed.add(level.id);
        this.#write(COMPLETED_KEY, JSON.stringify([...this.#completed].sort()));
    }
    /** Clears every star and every half-finished painting. */
    reset() {
        this.#completed = new Set();
        this.#partial = new Map();
        this.#store.removeItem(COMPLETED_KEY);
        this.#store.removeItem(PARTIAL_KEY);
    }
    #writePartial() {
        const out = {};
        for (const [levelId, keys] of [...this.#partial].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
            out[levelId] = [...keys].sort();
        }
        this.#write(PARTIAL_KEY, JSON.stringify(out));
    }
    /**
     * localStorage throws when the quota is full and in some private windows, and this runs inside
     * the tap handler. The target the child just found is already in memory by the time the write
     * happens, so a failed write costs the saving and not the tap: she keeps her star for the rest
     * of the session, and the next write that gets through carries the whole state with it.
     */
    #write(key, value) {
        try {
            this.#store.setItem(key, value);
        }
        catch {
            // Nothing to do here: the memory is right, and the storage is the platform's problem.
        }
    }
}
