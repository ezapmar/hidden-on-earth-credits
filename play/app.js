/* Boot and routing.
 *
 * Three screens in one page, the way the Swift app has three views: the picker, the sticker
 * book and the game. The URL carries which one, so the browser's Back button works and a
 * painting can be linked to directly. Android's hardware back is the same gesture, which is
 * why this is history and not a variable.
 *
 *   /play/                 the picker
 *   /play/?view=book       the sticker book
 *   /play/?level=<id>      that painting
 *   &tier=fit|play|zoom    pin the image tier, to judge sharpness on a device
 */
import { loadData, state } from "./data.js";
import { renderPicker, renderStickerBook } from "./home.js";
import { closeLevel, openLevel } from "./game.js";

const $ = (id) => document.getElementById(id);
const screens = { home: $("home"), book: $("book"), game: $("game") };

function show(name) {
  for (const [key, node] of Object.entries(screens)) node.hidden = key !== name;
  document.body.dataset.screen = name;
  // Each screen scrolls on its own; coming back should start at the top.
  if (name !== "game") screens[name].scrollTop = 0;
}

function go(params, { replace = false } = {}) {
  const url = new URL(location.href);
  url.search = params.toString();
  history[replace ? "replaceState" : "pushState"]({}, "", url);
  route();
}

const toHome = () => go(new URLSearchParams());
const toBook = () => go(new URLSearchParams({ view: "book" }));
const toLevel = (id) => {
  const p = new URLSearchParams({ level: id });
  const tier = new URLSearchParams(location.search).get("tier");
  if (tier) p.set("tier", tier);
  go(p);
};

function route() {
  const params = new URLSearchParams(location.search);
  const levelId = params.get("level");

  if (levelId) {
    if (openLevel(levelId, { onBack: toHome })) {
      show("game");
      return;
    }
    // An unknown id should not strand the child on a blank screen.
    go(new URLSearchParams(), { replace: true });
    return;
  }

  closeLevel();
  if (params.get("view") === "book") {
    renderStickerBook(screens.book, { onPick: toLevel, onHome: toHome });
    show("book");
  } else {
    renderPicker(screens.home, { onPick: toLevel, onStickers: toBook });
    show("home");
  }
}

window.addEventListener("popstate", route);

try {
  await loadData();
} catch (e) {
  $("status").textContent = `Could not load the catalogue: ${e.message}`;
  throw e;
}
$("status").hidden = true;
route();
