/* SF Symbols do not exist on the web, so each collection's symbol becomes a small inline SVG.
   This is the schema change the plan flagged: levels.json names an Apple symbol, and anything
   not in this table falls back to the palette. */
const PATHS = {
  "pawprint.fill":
    "M7 9a2.2 2.6 0 1 0 0-5.2A2.2 2.6 0 0 0 7 9Zm10 0a2.2 2.6 0 1 0 0-5.2A2.2 2.6 0 0 0 17 9ZM3.6 14.6a2 2.4 0 1 0 0-4.8 2 2.4 0 0 0 0 4.8Zm16.8 0a2 2.4 0 1 0 0-4.8 2 2.4 0 0 0 0 4.8ZM12 11c-2.6 0-5 2.6-5 5.4 0 2 1.4 3.1 3 3.1 1 0 1.5-.4 2-.4s1 .4 2 .4c1.6 0 3-1.1 3-3.1 0-2.8-2.4-5.4-5-5.4Z",
  snowflake:
    "M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M12 5.5 9.5 3M12 5.5 14.5 3M12 18.5 9.5 21M12 18.5l2.5 2.5M5.2 9.8 4.4 6.4M5.2 9.8 1.9 10.6M18.8 14.2l.8 3.4M18.8 14.2l3.3-.8M5.2 14.2l-3.3.8M5.2 14.2l-.8 3.4M18.8 9.8l.8-3.4M18.8 9.8l3.3.8",
  "moon.stars.fill":
    "M15.5 2.5A8.5 8.5 0 1 0 21 13.2a7 7 0 0 1-5.5-10.7ZM19 3l.6 1.6L21 5.2l-1.4.6L19 7.4l-.6-1.6L17 5.2l1.4-.6ZM16.5 8l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4Z",
  "figure.2.and.child.holdinghands":
    "M6 4.4a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2Zm12 0a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2ZM12 10.8a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6ZM4.2 6h3.6l1.6 4.6-1.3.5L7 8.6V22H5v-6.4H4.8V22H3V9l-1 2.3-1.3-.6ZM16.2 6h3.6l2.5 4.7-1.3.6-1-1.9V22h-2v-6.4H17.8V22h-2V8.6l-1.1 2.5-1.3-.5ZM10.4 12.4h3.2l1.7 3.6-1.2.6-.9-1.7V22h-1.4v-4h-.6v4h-1.4v-7.1l-.9 1.7-1.2-.6Z",
  "water.waves":
    "M2 7.5c2.5 0 2.5 1.6 5 1.6s2.5-1.6 5-1.6 2.5 1.6 5 1.6 2.5-1.6 5-1.6M2 13c2.5 0 2.5 1.6 5 1.6S9.5 13 12 13s2.5 1.6 5 1.6S19.5 13 22 13M2 18.5c2.5 0 2.5 1.6 5 1.6s2.5-1.6 5-1.6 2.5 1.6 5 1.6 2.5-1.6 5-1.6",
  "leaf.fill":
    "M20.5 3.2c.4 6.2-1 10.6-4.2 13.2-2.6 2.1-6 2.5-8.6 1.5l-2.3 2.6-1.5-1.3 2.3-2.6C4.6 14 4.4 10.4 6.3 7.8 8.8 4.4 13.6 3 20.5 3.2Zm-4.3 3.3C12 7 9.2 8.6 7.9 11c-1 1.9-.9 4 .1 5.6l7.1-8 .9.8-7 7.9c1.8.6 4 .2 5.8-1.3 2.1-1.7 3.2-4.6 3.4-9.5Z",
  "fork.knife":
    "M6 2v7.5a2.5 2.5 0 0 0 2 2.45V22h2v-10.05a2.5 2.5 0 0 0 2-2.45V2h-1.6v6.4H9.1V2H7.5v6.4H6.2V2Zm11 0c-1.7 1-2.6 3-2.6 5.6 0 2 .7 3.3 1.9 3.9V22H18V2Z",
  "paintpalette.fill":
    "M12 2C6.5 2 2 5.9 2 10.8c0 4.8 4.3 8.1 8.3 8.1 1.7 0 2.4-.9 2.4-1.9 0-.7-.4-1.2-.4-1.8 0-.8.6-1.4 1.5-1.4h1.9c3.5 0 6.3-2.5 6.3-6C22 4.6 17.6 2 12 2ZM6.4 11.6a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Zm3.2-4.4a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Zm5 0a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Zm3.3 4a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z",
  "star.fill": "m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9Z",
  "book.closed.fill":
    "M5 2.5h12.5A1.5 1.5 0 0 1 19 4v16a1.5 1.5 0 0 1-1.5 1.5H5A2 2 0 0 1 3 19.5v-15A2 2 0 0 1 5 2.5Zm0 15.2a.8.8 0 0 0 0 1.6h11.4v-1.6Z",
};

const STROKE_ONLY = new Set(["snowflake", "water.waves"]);

export function symbolSVG(name, className = "symbol") {
  const d = PATHS[name] ?? PATHS["paintpalette.fill"];
  const stroke = STROKE_ONLY.has(name);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  // classList.add rejects a token with a space in it, so split before adding.
  for (const c of className.split(/\s+/).filter(Boolean)) svg.classList.add(c);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  if (stroke) {
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
  } else {
    path.setAttribute("fill", "currentColor");
  }
  svg.append(path);
  return svg;
}
