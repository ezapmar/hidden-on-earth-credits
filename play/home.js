/* The picker and the sticker book, ported from LevelPickerView.swift and StickerBookView.swift.
 *
 * Picker: one horizontally scrolling row per collection, a card per painting, a gold star on
 * the finished ones and a progress bar on the half-finished ones. "Your collection" is always
 * there, inviting the family's own pictures while it is empty; those pictures live only in the
 * app bundle and are never published here, so on the web that row holds only the invitation.
 *
 * Sticker book: one sticker per painting on warm paper, grouped by collection. Finished
 * paintings show their sticker, the rest are grey slots, and tapping any slot opens that
 * painting.
 */
import { L10n, totalTargets } from "./core/index.js";
import { collectionRows, pictureEl, state, stickerURLs, tierURLs } from "./data.js";
import { symbolSVG } from "./symbols.js";

// The App Store page for the iOS app. Empty until the app is live: the promo at the foot of
// the picker then says "coming soon" instead of linking to a listing that does not exist yet.
// Set it to the app's URL (https://apps.apple.com/app/id<number>) on release day.
const APP_STORE_URL = "";

const el = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
};

function rowHeader(collection, done, total) {
  const head = el("div", "row-head");
  const badge = el("span", `row-symbol${collection.personal ? " personal" : ""}`);
  badge.append(symbolSVG(collection.symbol));
  head.append(badge, el("h2", null, L10n.pick(collection.titles)));
  if (total > 0 && done > 0) {
    const pill = el("span", `row-count${done === total ? " all" : ""}`);
    pill.append(symbolSVG("star.fill", "symbol star"), el("span", null, `${done} / ${total}`));
    head.append(pill);
  }
  return head;
}

function paintingCard(level, onPick) {
  const { progress } = state;
  const completed = progress.isCompleted(level);
  const found = progress.foundTargets(level).size;
  const total = totalTargets(level);
  const inProgress = !completed && found > 0;

  const card = el("button", `card-painting${completed ? " done" : ""}`);
  card.type = "button";
  card.setAttribute("aria-label", L10n.pick(level.titles));
  card.setAttribute("aria-description", completed ? L10n.t("completed") : L10n.foundSoFar(found, total));

  const art = el("div", "card-art");
  art.append(pictureEl(tierURLs(level.id, "card"), ""));
  if (completed) {
    const star = el("span", "card-star");
    star.append(symbolSVG("star.fill", "symbol star"));
    art.append(star);
  }

  const meta = el("div", "card-meta");
  meta.append(el("h3", null, L10n.pick(level.titles)), el("p", "artist", level.artist));
  meta.append(el("p", `count${completed ? " done" : ""}`,
    inProgress ? L10n.foundSoFar(found, total) : L10n.thingsToFind(total)));
  if (inProgress) {
    const bar = el("div", "bar");
    const fill = el("i");
    fill.style.width = `${(found / Math.max(1, total)) * 100}%`;
    bar.append(fill);
    meta.append(bar);
  }

  card.append(art, meta);
  card.addEventListener("click", () => onPick(level.id));
  return card;
}

function addPictureCard() {
  const card = el("div", "card-painting add");
  const art = el("div", "card-art dashed");
  art.append(symbolSVG("paintpalette.fill", "symbol big"));
  const meta = el("div", "card-meta");
  meta.append(el("h3", null, L10n.t("yourPictureTitle")), el("p", "artist", L10n.t("yourPictureBody")));
  card.append(art, meta);
  return card;
}

// "For more, download the iOS app." The web picker is a demo of a few paintings; the app has
// the whole catalogue and Play Together. It sits at the foot of the picker, never on the game
// or win screen, so nothing asks a child to leave mid-play or at the moment of a reward.
function appPromo() {
  const box = el("aside", "app-promo");
  box.setAttribute("aria-label", "Get the iOS app");
  const icon = el("img", "app-promo-icon");
  icon.src = "/assets/icon-512.webp";
  icon.alt = "";
  icon.width = icon.height = 64;
  const words = el("div", "app-promo-words");
  words.append(el("h2", null, "For more, download the iOS app"),
               el("p", null, "Many more paintings, and Play Together for the whole family round one iPad."));
  let badge;
  if (APP_STORE_URL) {
    badge = el("a", "app-badge");
    badge.href = APP_STORE_URL;
    badge.target = "_blank";
    badge.rel = "noopener";
    badge.append(symbolSVG("ipad", "symbol"), el("span", null, "Download on the App Store"));
  } else {
    badge = el("span", "app-badge soon");
    badge.append(symbolSVG("ipad", "symbol"), el("span", null, "Coming soon to the App Store"));
  }
  words.append(badge);
  box.append(icon, words);
  return box;
}

export function renderPicker(root, { onPick, onStickers }) {
  root.replaceChildren();
  const { library, progress } = state;
  const done = library.levels.filter((l) => progress.isCompleted(l)).length;

  // The same slim bar as the iPad app: logo and name, then the way to the sticker book.
  const header = el("header", "home-bar");
  const logo = el("img", "logo");
  logo.src = "/assets/icon-512.webp";
  logo.alt = "";
  logo.width = logo.height = 42;
  const book = el("button", "book-button");
  book.type = "button";
  book.setAttribute("aria-label", `${L10n.t("stickerBook")}, ${L10n.stickersCollected(done, library.levels.length)}`);
  book.append(symbolSVG("star.fill", "symbol star"), el("span", null, `${done} / ${library.levels.length}`),
              symbolSVG("book.closed.fill"), el("span", "words", L10n.t("stickerBook")));
  book.addEventListener("click", onStickers);
  header.append(logo, el("h1", null, "Hidden on Earth"), el("span", "spacer"), book);
  root.append(header);

  for (const row of collectionRows()) {
    const section = el("section", "row");
    const doneHere = row.levels.filter((l) => progress.isCompleted(l)).length;
    section.append(rowHeader(row.collection, doneHere, row.levels.length));
    const strip = el("div", "strip");
    for (const level of row.levels) strip.append(paintingCard(level, onPick));
    if (row.collection.personal) strip.append(addPictureCard());
    section.append(strip);
    root.append(section);
  }
  root.append(appPromo());
}

export function renderStickerBook(root, { onPick, onHome }) {
  root.replaceChildren();
  const { library, progress } = state;
  const done = library.levels.filter((l) => progress.isCompleted(l)).length;

  const back = el("button", "back");
  back.type = "button";
  back.setAttribute("aria-label", L10n.t("paintings"));
  back.append(symbolSVG("paintpalette.fill"));
  back.addEventListener("click", onHome);

  const header = el("header", "book-head");
  header.append(el("h1", null, L10n.t("stickerBook")),
                el("p", "lead", L10n.stickersCollected(done, library.levels.length)));
  root.append(back, header);

  // The personal row has nothing to show here, so it is left out rather than shown empty.
  for (const row of collectionRows({ includeEmptyPersonal: false })) {
    const section = el("section", "book-row");
    const head = el("div", "row-head");
    const badge = el("span", `row-symbol${row.collection.personal ? " personal" : ""}`);
    badge.append(symbolSVG(row.collection.symbol));
    head.append(badge, el("h2", null, L10n.pick(row.collection.titles)));
    section.append(head);

    const grid = el("div", "grid");
    for (const level of row.levels) {
      const unlocked = progress.isCompleted(level);
      const slot = el("button", `slot${unlocked ? " unlocked" : ""}`);
      slot.type = "button";
      slot.setAttribute("aria-label", unlocked ? L10n.pick(level.titles) : L10n.t("stickerLocked"));
      const disc = el("div", "disc");
      if (unlocked) disc.append(pictureEl(stickerURLs(level.id), ""));
      else disc.append(el("span", "locked", "?"));
      slot.append(disc, el("span", "slot-name", unlocked ? L10n.pick(level.titles) : "? ? ?"));
      slot.addEventListener("click", () => onPick(level.id));
      grid.append(slot);
    }
    section.append(grid);
    root.append(section);
  }
}
