/**
 * State for one play-through of one level. Ported from `Game/GameSession.swift`.
 *
 * One deliberate difference: the three `Task.sleep` timers in the Swift version (1.2s to stop
 * celebrating, 0.5s to stop nudging, 3s to drop a hint) do NOT live here. The core stays
 * synchronous and testable; the view schedules the clears by calling `clearCelebrating`,
 * `clearNudged` and `clearHint`. Everything that decides an outcome is unchanged.
 */
import { totalTargets } from "./level.js";
import { targetKey } from "./targetKey.js";
const MISS = { kind: "miss" };
export class GameSession {
    level;
    #all;
    #total;
    #found;
    /** Target currently highlighted by the hint button, if any. */
    hinted = null;
    /** Target that was just found; drives the bounce and star burst. */
    celebrating = null;
    /** An already-found target the child tapped again; gives a small wiggle so the tap isn't dead. */
    nudged = null;
    constructor(level, found = []) {
        this.level = level;
        // Order matters: items order, then target index. `tap` breaks distance ties by first-seen,
        // so the port must walk the targets in exactly the order Swift's `allTargets` builds them.
        const all = [];
        for (const group of level.items) {
            group.targets.forEach((target, i) => all.push({ key: targetKey(group.id, i), target }));
        }
        this.#all = all;
        this.#total = totalTargets(level);
        // Keep only keys that still exist, in case the level's targets changed since they were saved.
        const valid = new Set(all.map((t) => t.key));
        this.#found = new Set([...found].filter((k) => valid.has(k)));
    }
    get found() {
        return this.#found;
    }
    get isComplete() {
        return this.#found.size === this.#total;
    }
    isFound(key) {
        return this.#found.has(key);
    }
    foundCount(group) {
        let n = 0;
        for (let i = 0; i < group.targets.length; i++)
            if (this.#found.has(targetKey(group.id, i)))
                n++;
        return n;
    }
    isGroupComplete(group) {
        return this.foundCount(group) === group.targets.length;
    }
    get remaining() {
        return this.#all.filter((t) => !this.#found.has(t.key)).map((t) => t.key);
    }
    /**
     * Handles a tap at a normalized (0...1) point on the painting. Wrong taps are never penalized.
     *
     * `minRadius` is a floor on the tap tolerance, in the same normalized width units as
     * `Target.r`. The ring a child sees is never drawn smaller than a fixed number of pixels, so
     * without a matching floor here she can tap inside the ring on a small target and still get a
     * miss. Only the view knows how many pixels the painting currently spans, so the view passes it.
     */
    tap(point, ratio, minRadius = 0) {
        if (this.isComplete)
            return MISS;
        // Distances in "width units" so a circle stays a circle on non-square paintings.
        let bestUnfound = null;
        let bestUnfoundDistance = Infinity;
        let bestAny = null;
        let bestAnyDistance = Infinity;
        for (const entry of this.#all) {
            const t = entry.target;
            const dx = point.x - t.x;
            const dy = (point.y - t.y) / ratio;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > Math.max(t.r, minRadius))
                continue;
            // Strictly less than, so a tie keeps the first in order, as Swift's `min(by:)` does.
            if (d < bestAnyDistance) {
                bestAnyDistance = d;
                bestAny = entry;
            }
            if (!this.#found.has(entry.key) && d < bestUnfoundDistance) {
                bestUnfoundDistance = d;
                bestUnfound = entry;
            }
        }
        // Prefer an unfound target when circles overlap.
        if (bestUnfound) {
            this.#markFound(bestUnfound.key);
            return { kind: "found", key: bestUnfound.key };
        }
        if (bestAny) {
            this.nudged = bestAny.key;
            return { kind: "alreadyFound", key: bestAny.key };
        }
        return MISS;
    }
    #markFound(key) {
        this.#found.add(key);
        if (this.hinted === key)
            this.hinted = null;
        this.celebrating = key;
    }
    /**
     * Pulses one unfound target. Random so repeated taps feel playful; the generator is injectable
     * so tests are deterministic.
     */
    showHint(random = Math.random) {
        const remaining = this.remaining;
        if (remaining.length === 0)
            return null;
        const i = Math.min(remaining.length - 1, Math.floor(random() * remaining.length));
        const key = remaining[i] ?? null;
        this.hinted = key;
        return key;
    }
    /** The view calls these when its timers fire; the Swift version used `Task.sleep`. */
    clearCelebrating(key) {
        if (this.celebrating === key)
            this.celebrating = null;
    }
    clearNudged(key) {
        if (this.nudged === key)
            this.nudged = null;
    }
    clearHint(key) {
        if (this.hinted === key)
            this.hinted = null;
    }
}
