/**
 * The game's words, ported from `Support/L10n.swift`. There is one language: English, on every
 * device, menus and item names alike. The child it was made for is learning English, so nothing
 * here is translated and nothing switches on the browser's language.
 */
/** Data files carry their text under an `en` key, so a level still decodes as a record. */
export function pick(dict) {
    return dict["en"] ?? Object.values(dict)[0] ?? "";
}
/** Read aloud by text-to-speech, the same string the screen shows. */
export function spokenName(names) {
    return pick(names);
}
const EN = {
    hint: "Hint",
    foundAll: "You found them all!",
    nextPiece: "Play Next Art Piece!",
    playAgain: "Play Again",
    noLevels: "No paintings found",
    speakHint: "Reads the name aloud",
    pickPainting: "Pick a painting!",
    paintings: "Paintings",
    completed: "Completed",
    morePaintings: "More paintings",
    yourPictureTitle: "Add your own picture!",
    yourPictureBody: "Ask a grown-up to add a photo you love. Then find the things hiding in it!",
    stickerBook: "Sticker Book",
    newSticker: "New sticker!",
    stickerLocked: "Finish the painting to earn this sticker",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    zoomReset: "Show the whole painting",
    rotateToPlay: "Turn your phone sideways to play",
};
export function t(key) {
    return EN[key];
}
export function thingsToFind(n) {
    return `Find ${n} things`;
}
export function foundSoFar(found, total) {
    return `${found} / ${total} found`;
}
export function stickersCollected(n, total) {
    return `${n} / ${total} stickers`;
}
