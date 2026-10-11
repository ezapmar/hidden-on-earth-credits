#!/usr/bin/env python3
"""Point index.html at the pipeline's tiers: gallery cards, the playable painting, its HUD
thumbs and its sticker. Idempotent: re-run after the pipeline whenever a hash changes."""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
m = json.load(open(ROOT / 'assets/paintings.json'))
L = m['levels']
IMG = 'assets/' + m['base']          # assets/img/
html = (ROOT / 'index.html').read_text()

GALLERY_SIZES = '(min-width: 1080px) 240px, (min-width: 640px) 45vw, calc(100vw - 40px)'
STAGE_SIZES = '(min-width: 900px) 770px, calc(100vw - 40px)'


def tier(level, t, f):
    return IMG + L[level]['tiers'][t][f]['path']


def picture(level, alt, width, height, sizes, small, large, lazy=True, cls=None):
    attrs = f' width="{width}" height="{height}"' + (' loading="lazy"' if lazy else '')
    return (
        f'<picture{" class=" + chr(34) + cls + chr(34) if cls else ""}>\n'
        f'            <source type="image/avif" srcset="{tier(level, small, "avif")} {L[level]["tiers"][small]["w"]}w, {tier(level, large, "avif")} {L[level]["tiers"][large]["w"]}w" sizes="{sizes}">\n'
        f'            <img src="{tier(level, large, "webp")}" srcset="{tier(level, small, "webp")} {L[level]["tiers"][small]["w"]}w, {tier(level, large, "webp")} {L[level]["tiers"][large]["w"]}w" sizes="{sizes}" alt="{alt}"{attrs}>\n'
        f'          </picture>'
    )


# 1. gallery cards: <img src="assets/art/X.webp" alt="..." width="720" height="H" loading="lazy">
#    or an already-rewritten <picture>...</picture> block for X.
n = 0
def gallery(match):
    global n
    level, alt = match.group(1), match.group(2)
    if level not in L:
        sys.exit(f'{level}: not in the manifest')
    n += 1
    fit = L[level]['tiers']['fit']
    return picture(level, alt, fit['w'], fit['h'], GALLERY_SIZES, 'card', 'fit')

html = re.sub(r'<img src="assets/art/([a-z_]+)\.webp" alt="([^"]*)" width="\d+" height="\d+" loading="lazy">', gallery, html)
html = re.sub(r'<picture>\n\s*<source type="image/avif" srcset="assets/img/([a-z_]+)/card\.[^"]*" sizes="[^"]*">\n\s*<img src="[^"]*" srcset="[^"]*" sizes="[^"]*" alt="([^"]*)" width="\d+" height="\d+" loading="lazy">\n\s*</picture>', gallery, html)

# 2. the playable painting
demo = 'rousseau_tropical_forest'
play = L[demo]['tiers']['play']
alt = 'Tropical Forest with Monkeys, Henri Rousseau, 1910: a dense green jungle with red flowers and monkeys among the leaves'
stage_pic = picture(demo, alt, play['w'], play['h'], STAGE_SIZES, 'fit', 'play', lazy=False)
html, k = re.subn(r'<img src="assets/art/demo_tropical_forest\.webp" alt="[^"]*" width="\d+" height="\d+">', stage_pic, html)
if k == 0:
    html, k = re.subn(r'<picture>\n\s*<source type="image/avif" srcset="assets/img/rousseau_tropical_forest/fit\.[^"]*" sizes="[^"]*">\n\s*<img src="[^"]*" srcset="[^"]*" sizes="[^"]*" alt="[^"]*" width="\d+" height="\d+">\n\s*</picture>', stage_pic, html)
assert k == 1, 'stage image not found'

# 3. the sticker on the win screen
st = L[demo]['sticker']
sticker = (f'<picture class="sticker">\n'
           f'            <source type="image/avif" srcset="{IMG + st["avif"]["path"]}">\n'
           f'            <img src="{IMG + st["webp"]["path"]}" alt="" width="{m["sticker"]}" height="{m["sticker"]}" loading="lazy">\n'
           f'          </picture>')
html, k = re.subn(r'<div class="sticker" style="[^"]*"></div>', sticker, html)
if k == 0:
    html, k = re.subn(r'<picture class="sticker">.*?</picture>', sticker, html, flags=re.S)
assert k == 1, 'sticker not found'

# 4. HUD thumbs: site.js ids monkeys/snake/flowers map to the level's monkeys/snake/white_flowers
thumbs = {'monkeys': 'monkeys', 'snake': 'snake', 'flowers': 'white_flowers'}
for site_id, group in thumbs.items():
    t = L[demo]['thumbs'][group]
    pic = (f'<picture class="thumb">\n'
           f'            <source type="image/avif" srcset="{IMG + t["avif"]["path"]}">\n'
           f'            <img src="{IMG + t["webp"]["path"]}" alt="" width="{m["thumb"]}" height="{m["thumb"]}" loading="lazy">\n'
           f'          </picture>')
    pat_old = rf'(<button class="card" type="button" data-item="{site_id}"[^>]*>\n\s*)<span class="thumb" style="[^"]*"></span>'
    pat_new = rf'(<button class="card" type="button" data-item="{site_id}"[^>]*>\n\s*)<picture class="thumb">.*?</picture>'
    html, k = re.subn(pat_old, lambda mm: mm.group(1) + pic, html)
    if k == 0:
        html, k = re.subn(pat_new, lambda mm: mm.group(1) + pic, html, flags=re.S)
    assert k == 1, f'thumb {site_id} not found'

(ROOT / 'index.html').write_text(html)
print(f'gallery cards rewritten: {n}; stage, sticker and {len(thumbs)} thumbs updated')
