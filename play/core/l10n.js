/**
 * The game's words, ported from `Support/L10n.swift`. There is one language: English, on every
 * device, menus and item names alike. The child it was made for is learning English, so nothing
 * here is translated and nothing switches on the browser's language.
 */
import { isGrownUp } from "./player.js";
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
    // The profile. One player on this device says who they are; see `partyStore.ts`.
    thisIsMe: "This is me",
    makeProfile: "Who are you?",
    yourName: "What is your name?",
    namePlaceholder: "Your name",
    nameOptional: "You can leave this empty",
    paintersAvatars: "Be a painter",
    animalAvatars: "Be an animal",
    ownPictureAvatar: "Be yourself",
    yourOwnPicture: "Your own picture",
    choosePhoto: "Choose a photo",
    changePhoto: "Choose another",
    forgetMe: "Forget this profile",
    howOld: "How old are you?",
    done: "Done",
    cancel: "Cancel",
    curiousParents: "Curious parents",
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
/**
 * Where the profile is kept, in the words of the device it is kept on. Swift says "this iPad";
 * a phone is not an iPad and the web is neither, so this one string is the platform's to fill
 * in rather than a constant.
 */
export function profileFooter(device) {
    return `Your name and your picture stay on ${device}. Nothing is sent anywhere.`;
}
export function foundAllBy(name) {
    return `You found them all, ${name}!`;
}
/** "Van Gogh, 1853-1890": what a painter's portrait says out loud. */
export function painterAndYears(painter, lived) {
    return `${painter}, ${lived}`;
}
/** "6-8", and for the grown-ups the name the game gives them. */
export function ageBandLabel(band) {
    return isGrownUp(band) ? `${band} \u00b7 ${t("curiousParents")}` : band;
}
