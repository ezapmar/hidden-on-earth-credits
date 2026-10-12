/**
 * One occurrence of one item group: "dogs#1". Ported from `TargetKey` in `GameSession.swift`.
 *
 * Swift uses a Hashable struct in a `Set`. TypeScript has no value-type sets, so the key IS the
 * storage string and sets are `Set<string>`. That is also the encoding `PlayerProgress` already
 * persists, so there is no second format to keep in step, and it is what travels over the wire
 * if family sync ever lands.
 */
export function targetKey(groupId, index) {
    return `${groupId}#${index}`;
}
/**
 * Splits at the LAST "#", matching Swift's `lastIndex(of:)`, so a group id containing a "#"
 * still round-trips. Returns null when the suffix is not an integer.
 */
export function parseTargetKey(key) {
    const hash = key.lastIndexOf("#");
    if (hash < 0)
        return null;
    const tail = key.slice(hash + 1);
    // Swift's Int(_:) rejects "1.0", "1e3", " 1" and "+1"; keep that strictness.
    if (!/^-?\d+$/.test(tail))
        return null;
    const index = Number.parseInt(tail, 10);
    if (!Number.isSafeInteger(index))
        return null;
    return { groupId: key.slice(0, hash), index };
}
