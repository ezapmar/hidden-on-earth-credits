/**
 * Minimal localization, ported from `Support/L10n.swift`: Turkish when the device language is
 * Turkish, English otherwise.
 *
 * Fixes one thing from the Swift version, as the plan calls for: `L10n.lang` was a `static let`,
 * so the language could not change once read. Here it is settable, which the web needs anyway
 * (a tab survives a language change; an app launch does not).
 */
function detect() {
    const nav = typeof navigator === "undefined" ? undefined : navigator;
    const tag = nav?.languages?.[0] ?? nav?.language ?? "en";
    return tag.slice(0, 2).toLowerCase() === "tr" ? "tr" : "en";
}
let current = detect();
export function language() {
    return current;
}
export function setLanguage(lang) {
    current = lang;
}
export function isTurkish() {
    return current === "tr";
}
/** The Swift `pick`: current language, then English, then any value, then empty. */
export function pick(dict) {
    return dict[current] ?? dict["en"] ?? Object.values(dict)[0] ?? "";
}
/** Read aloud by text-to-speech: English regardless of the UI language, on purpose. */
export function spokenName(names) {
    return names["en"] ?? pick(names);
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
const TR = {
    hint: "İpucu",
    foundAll: "Hepsini buldun!",
    nextPiece: "Sıradaki Tabloya Geç!",
    playAgain: "Tekrar Oyna",
    noLevels: "Tablo bulunamadı",
    speakHint: "Adını sesli okur",
    pickPainting: "Bir tablo seç!",
    paintings: "Tablolar",
    completed: "Tamamlandı",
    morePaintings: "Daha fazla tablo",
    yourPictureTitle: "Kendi resmini ekle!",
    yourPictureBody: "Bir büyüğünden sevdiğin bir fotoğrafı eklemesini iste. Sonra içinde saklananları bul!",
    stickerBook: "Çıkartma Defteri",
    newSticker: "Yeni çıkartma!",
    stickerLocked: "Bu çıkartma için tabloyu bitir",
    zoomIn: "Yakınlaştır",
    zoomOut: "Uzaklaştır",
    zoomReset: "Tümünü göster",
    rotateToPlay: "Oynamak için telefonu yan çevir",
};
export function t(key) {
    return isTurkish() ? TR[key] : EN[key];
}
export function thingsToFind(n) {
    return isTurkish() ? `${n} şey bul` : `Find ${n} things`;
}
export function foundSoFar(found, total) {
    return isTurkish() ? `${found} / ${total} bulundu` : `${found} / ${total} found`;
}
export function stickersCollected(n, total) {
    return isTurkish() ? `${n} / ${total} çıkartma` : `${n} / ${total} stickers`;
}
