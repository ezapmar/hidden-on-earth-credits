/* Hidden on Earth site: the brainless family's kilim motifs drawn as knot grids, the woven
   band, and the playable painting. Motif code follows brainless/docs/site.js. */
(function () {
  var P = { night:'#0A1825', ink:'#042538', cream:'#FBDEA5', bone:'#F9EBDB',
            madder:'#CB221F', vermilion:'#F24B1E', orange:'#F97327',
            saffron:'#FBA335', marigold:'#FBB94B', teal:'#0C9794', sage:'#9BB38D' };
  var NS = 'http://www.w3.org/2000/svg';

  function cell(svg, x, y, fill) {
    var r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', 1); r.setAttribute('height', 1);
    r.setAttribute('fill', fill); r.setAttribute('shape-rendering', 'crispEdges');
    svg.appendChild(r);
  }

  /* Each motif is a 15 by 15 knot grid, the way a kilim is counted. */
  var grids = {
    horn: [
      '.cc.........cc.',
      'c..c.......c..c',
      'c...c.....c...c',
      '.c..cc...cc..c.',
      '.....c...c.....',
      '.....cc.cc.....',
      '......ccc......',
      '.......c.......',
      '.......c.......',
      '......ccc......',
      '.....ccAcc.....',
      '....cc.A.cc....',
      '...cc..A..cc...',
      '..cc...A...cc..',
      '.......A.......'
    ],
    figure: [
      '......ccc......',
      '......cAc......',
      '......ccc......',
      '.......c.......',
      '..c..ccccc..c..',
      '..cc.ccAcc.cc..',
      '...ccccAcccc...',
      '......cAc......',
      '.....ccccc.....',
      '....ccAAAcc....',
      '...cccAAAccc...',
      '..cccccAccccc..',
      '.cccc..c..cccc.',
      '.cc.........cc.',
      '.c...........c.'
    ]
  };

  function drawGrid(svg, grid, c, a) {
    for (var y = 0; y < grid.length; y++)
      for (var x = 0; x < grid[y].length; x++) {
        var ch = grid[y][x];
        if (ch === 'c') cell(svg, x, y, c);
        else if (ch === 'A') cell(svg, x, y, a);
      }
  }

  function drawEye(svg, c) {
    for (var y = 0; y < 15; y++) for (var x = 0; x < 15; x++) {
      var d = Math.abs(x - 7) + Math.abs(y - 7);
      if (d > 7) continue;
      var fill = d > 5 ? c : d > 3 ? null : d > 1 ? c : P.teal;
      if (d === 6) fill = null;
      if (fill) cell(svg, x, y, fill);
    }
  }

  function drawStar(svg, c) {
    for (var y = 0; y < 15; y++) for (var x = 0; x < 15; x++) {
      var dx = Math.abs(x - 7), dy = Math.abs(y - 7);
      var inDiamond = dx + dy <= 7 && dx + dy >= 5;
      var inSquare = Math.max(dx, dy) <= 4 && Math.max(dx, dy) >= 3;
      var centre = dx + dy <= 1;
      if (inDiamond || inSquare) cell(svg, x, y, c);
      else if (centre) cell(svg, x, y, P.vermilion);
    }
  }

  function drawTree(svg, c) {
    for (var y = 1; y < 15; y++) cell(svg, 7, y, c);
    for (var y = 2; y < 13; y += 3) {
      for (var i = 1; i <= 4; i++) { cell(svg, 7 - i, y + i, c); cell(svg, 7 + i, y + i, c); }
    }
    cell(svg, 7, 0, P.vermilion); cell(svg, 6, 1, P.vermilion); cell(svg, 8, 1, P.vermilion);
  }

  function motifGround() {
    return getComputedStyle(document.documentElement).getPropertyValue('--motif-ground').trim() || P.cream;
  }

  function drawMotif(svg) {
    var kind = svg.getAttribute('data-motif');
    var onNight = svg.getAttribute('data-ground') === 'night';
    var colourName = svg.getAttribute('data-colour');
    var c = colourName ? P[colourName] : (onNight ? P.cream : motifGround());
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (kind === 'eye') drawEye(svg, c);
    else if (kind === 'star') drawStar(svg, c);
    else if (kind === 'tree') drawTree(svg, c);
    else if (kind === 'horn') drawGrid(svg, grids.horn, c, P.saffron);
    else if (kind === 'figure') drawGrid(svg, grids.figure, c, P.madder);
  }

  /* The woven band: a row of small eyes in alternating dyes, on a thin thread. */
  function drawBand(svg, seed) {
    var h = 15, unit = 15;
    var dyes = [P.madder, P.saffron, P.teal, P.orange, P.marigold];
    var ground = motifGround();
    var w = Math.max(svg.clientWidth || 0, 320);
    var cols = Math.ceil(w / unit) + 1;
    svg.setAttribute('viewBox', '0 0 ' + (cols * unit) + ' ' + h);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var line1 = document.createElementNS(NS, 'rect');
    line1.setAttribute('x', 0); line1.setAttribute('y', 1); line1.setAttribute('width', cols * unit); line1.setAttribute('height', 1);
    line1.setAttribute('fill', ground); svg.appendChild(line1);
    var line2 = line1.cloneNode(); line2.setAttribute('y', 13); svg.appendChild(line2);
    for (var i = 0; i < cols; i++) {
      var dye = dyes[(i + seed) % dyes.length];
      var cx = i * unit + 7;
      for (var y = 3; y <= 11; y++) for (var x = i * unit; x < i * unit + unit; x++) {
        var d = Math.abs(x - cx) + Math.abs(y - 7);
        if (d > 4) continue;
        if (d === 4) cell(svg, x, y, ground);
        else if (d >= 2) cell(svg, x, y, dye);
        else cell(svg, x, y, ground);
      }
    }
  }

  function drawAll() {
    var motifs = document.querySelectorAll('svg[data-motif]');
    for (var i = 0; i < motifs.length; i++) drawMotif(motifs[i]);
    var bands = document.querySelectorAll('svg.band');
    for (var j = 0; j < bands.length; j++) drawBand(bands[j], j);
  }
  drawAll();
  var resizeTimer;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawAll, 150); });
  if (window.matchMedia) {
    try { window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', drawAll); } catch (e) {}
  }
  new MutationObserver(drawAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* The playable painting. Targets are the game's own, from levels.json: x and y are fractions
     of the painting, r is the tap tolerance as a fraction of its width. */
  var stage = document.getElementById('stage');
  if (!stage) return;
  var ITEMS = [
    { id: 'monkeys', name: 'Monkeys', targets: [
      { x: 0.257, y: 0.363, r: 0.06 }, { x: 0.41, y: 0.604, r: 0.07 }, { x: 0.677, y: 0.396, r: 0.06 },
      { x: 0.747, y: 0.317, r: 0.05 }, { x: 0.67, y: 0.771, r: 0.08 } ] },
    { id: 'snake', name: 'Snake', targets: [ { x: 0.283, y: 0.727, r: 0.06 } ] },
    { id: 'flowers', name: 'White flowers', targets: [
      { x: 0.089, y: 0.532, r: 0.04 }, { x: 0.182, y: 0.624, r: 0.04 },
      { x: 0.303, y: 0.633, r: 0.04 }, { x: 0.449, y: 0.675, r: 0.04 } ] }
  ];
  var win = document.getElementById('win'), miss = document.getElementById('miss');
  var hintTimer = null, hintEl = null;

  function place(el, t, d) {
    el.style.left = (t.x * 100) + '%'; el.style.top = (t.y * 100) + '%';
    if (d) el.style.width = (d * 100) + '%';
  }
  function clearHint() {
    if (hintEl) { hintEl.remove(); hintEl = null; }
    clearTimeout(hintTimer);
  }
  function update() {
    var left = 0;
    ITEMS.forEach(function (it) {
      var found = it.targets.filter(function (t) { return t.found; }).length;
      var card = document.querySelector('.card[data-item="' + it.id + '"]');
      card.querySelector('.count').textContent = found + ' / ' + it.targets.length;
      if (found === it.targets.length) card.setAttribute('data-done', '1'); else card.removeAttribute('data-done');
      left += it.targets.length - found;
    });
    if (left === 0) setTimeout(function () { win.hidden = false; }, 500);
  }
  stage.addEventListener('click', function (e) {
    if (!win.hidden) return;
    var box = stage.getBoundingClientRect();
    var px = (e.clientX - box.left) / box.width, py = (e.clientY - box.top) / box.height;
    var best = null, bestD = Infinity;
    ITEMS.forEach(function (it) { it.targets.forEach(function (t) {
      if (t.found) return;
      var dx = px - t.x, dy = (py - t.y) * box.height / box.width;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d <= t.r && d < bestD) { best = t; bestD = d; }
    }); });
    if (best) {
      best.found = true;
      if (hintEl && hintEl.target === best) clearHint();
      var ring = document.createElement('span');
      ring.className = 'ring'; place(ring, best, best.r * 2);
      stage.insertBefore(ring, win);
      update();
    } else {
      /* no penalty, as in the game: a soft ripple and nothing else */
      place(miss, { x: px, y: py });
      miss.classList.remove('go'); void miss.offsetWidth; miss.classList.add('go');
    }
  });
  document.getElementById('hint').addEventListener('click', function () {
    var rest = [];
    ITEMS.forEach(function (it) { it.targets.forEach(function (t) { if (!t.found) rest.push(t); }); });
    if (!rest.length) return;
    clearHint();
    var t = rest[Math.floor(Math.random() * rest.length)];
    hintEl = document.createElement('span');
    hintEl.className = 'hintring'; hintEl.target = t; place(hintEl, t, t.r * 2);
    stage.insertBefore(hintEl, win);
    hintTimer = setTimeout(clearHint, 3000);
  });
  document.getElementById('again').addEventListener('click', function (e) {
    e.stopPropagation();
    ITEMS.forEach(function (it) { it.targets.forEach(function (t) { t.found = false; }); });
    var rings = stage.querySelectorAll('.ring');
    for (var i = 0; i < rings.length; i++) rings[i].remove();
    win.hidden = true; update();
  });
  /* tapping a card says the word, in English, as the game does */
  var cards = document.querySelectorAll('.card[data-item]');
  for (var c = 0; c < cards.length; c++) cards[c].addEventListener('click', function () {
    if (!window.speechSynthesis) return;
    var u = new SpeechSynthesisUtterance(this.querySelector('.name').textContent);
    u.lang = 'en-US'; u.rate = 0.9;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  });
})();

/* Offline: the service worker keeps every painting's card and fit tiers, and the play and
   zoom tiers of the ones opened. It only touches assets/img/ and the manifest; see sw.js. */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
