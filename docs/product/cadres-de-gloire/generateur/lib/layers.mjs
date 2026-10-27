// La lecture d'un cadre DANS la page : chaque élément du corps reçoit une nature (data-k), puis on n'affiche qu'un
// ensemble de natures pour rendre une couche. Les natures :
//   photo, photo-bg     la photo factice et son fond d'atmosphère (lib/base.py, photo())
//   backdrop            un décor dessiné AVANT la photo (donc derrière elle)
//   grade-<n>           le décor, découpé en PASSES consécutives de même mode de fusion (normal, screen,
//                       multiply…) : hors de la fenêtre elles forment `decor`, dans la fenêtre chaque passe est une
//                       couche `grade` posée sur la photo dans l'ordre du SVG, avec son mode
//   front:<rang>        un décor dessiné après le premier ancrage (blason, plaque, oiseau), en PASSES ordonnées
//                       comme le grade : chaque suite d'éléments entre deux ancrages prend le rang de l'ancrage
//                       qu'elle PRÉCÈDE — `under-birds` (la lueur posée sous chaque oiseau en fait partie),
//                       `under-plate`, `under-crest` — et la suite qui suit le dernier ancrage est `over-birds`.
//                       Une lueur dessinée après la plaque reste ainsi AU-DESSUS d'elle, et le liseré dessiné
//                       avant elle, dessous.
//   crest, plate, birds le blason, le panneau de la plaque, Mee et Meo posés (lib/base.py, bird()) ; une image
//                       de Mee hors d'un oiseau posé (frappée sur une pièce, en hologramme) est une ILLUSTRATION
//                       du décor, comptée à part (`art`)
//   text                tout `<text>` (et ses tspan, textPath) : un emplacement vivant
//   baked               un `<text>` de décor NEUTRE (markBaked) : cuit dans la couche decor, jamais un emplacement
// Un élément de définition (masque, motif, filtre, dégradé…) n'est jamais touché : seul ce qui se PEINT l'est.

export const KINDS = ['photo', 'photo-bg', 'backdrop', 'grade-<n>', 'front:<rang>', 'crest', 'plate', 'birds', 'text', 'baked'];
export const isFront = (kind) => kind.startsWith('front:');

export function classify() {
  const DEFS = new Set(['defs', 'mask', 'clippath', 'pattern', 'filter', 'lineargradient', 'radialgradient', 'symbol', 'marker', 'style', 'title', 'desc', 'metadata']);
  const CONTAINERS = new Set(['g', 'a', 'svg', 'switch']);
  const root = document.querySelector('g[data-layer="root"]');
  if (!root) throw new Error('cadre sans <g data-layer="root"> : régénérer avec lib/base.py instrumenté');
  const all = [];
  const walk = (el) => {
    for (const child of el.children) {
      if (DEFS.has(child.tagName.toLowerCase())) continue;
      all.push(child);
      walk(child);
    }
  };
  walk(root);
  const layerOf = (el) => el.closest('[data-layer]:not([data-layer="root"])')?.getAttribute('data-layer') ?? null;
  const blendOf = (el) => {
    for (let n = el; n && n !== root; n = n.parentElement) {
      const mode = getComputedStyle(n).mixBlendMode;
      if (mode !== 'normal') return mode;
    }
    return 'normal';
  };
  const tagged = all.map((el) => {
    if (el.closest('text')) return 'text';
    const layer = layerOf(el);
    if (layer === 'birds') return 'birds';
    if (layer === 'photo' || layer === 'photo-bg' || layer === 'crest' || layer === 'plate') return layer;
    return null;
  });
  const first = (pred) => tagged.findIndex(pred);
  const firstPhoto = first((k) => k === 'photo' || k === 'photo-bg');
  const firstAnchor = first((k) => k === 'crest' || k === 'plate' || k === 'birds');
  const ANCHORS = new Set(['crest', 'plate', 'birds']);
  const nextAnchor = new Array(all.length).fill(null);
  for (let i = all.length - 2; i >= 0; i--) nextAnchor[i] = ANCHORS.has(tagged[i + 1]) ? tagged[i + 1] : nextAnchor[i + 1];
  const RANKS = { crest: 'under-crest', plate: 'under-plate', birds: 'under-birds' };
  const blends = all.map((el, i) => (tagged[i] || CONTAINERS.has(el.tagName.toLowerCase()) ? 'normal' : blendOf(el)));
  const runs = [];
  all.forEach((el, i) => {
    const kind = tagged[i] ?? (() => {
      if (CONTAINERS.has(el.tagName.toLowerCase())) return 'group';
      if (firstPhoto >= 0 && i < firstPhoto) return 'backdrop';
      if (firstAnchor >= 0 && i > firstAnchor) return `front:${nextAnchor[i] ? RANKS[nextAnchor[i]] : 'over-birds'}`;
      if (runs.at(-1)?.blend !== blends[i]) runs.push({ kind: `grade-${runs.length}`, blend: blends[i] });
      return runs.at(-1).kind;
    })();
    el.setAttribute('data-k', kind);
  });
  const order = {};
  all.forEach((el, i) => {
    const k = el.getAttribute('data-k');
    if (k !== 'group' && order[k] === undefined) order[k] = i;
  });
  return { order, runs, count: all.length };
}

// `photo` : la photo FIXTURE des cibles (lib/cible.mjs) posée à la place des silhouettes, recadrée en `cover` sur la
// boîte de la fenêtre (`box`, repère de design) — ce que l'app peint par défaut ; le décor la masque hors de la fenêtre.
// Elle arrive APRÈS le chargement de la page, donc rien ne l'attend : son `load` est capturé avant de poser `href`
// (`__loaded`), et `settle` (lib/page.mjs) l'attend avant toute capture (#12801).
export function show({ kinds, probe = null, flatSlots = null, photo = null }) {
  const visible = new Set(kinds);
  const root = document.querySelector('g[data-layer="root"]');
  document.querySelectorAll('[data-probe]').forEach((el) => el.remove());
  const marked = [...root.querySelectorAll('[data-k]')];
  const leafVisible = new Map();
  for (const el of marked) {
    const k = el.getAttribute('data-k');
    if (k === 'group') continue;
    const on = visible.has(k);
    el.style.visibility = on ? 'visible' : 'hidden';
    el.style.display = '';
    leafVisible.set(el, on);
  }
  for (const el of [...marked].reverse()) {
    if (el.getAttribute('data-k') !== 'group') continue;
    const any = [...el.querySelectorAll('[data-k]')].some((d) => leafVisible.get(d));
    el.style.display = any ? '' : 'none';
    leafVisible.set(el, any);
  }
  if (probe) {
    const anchor = root.querySelector('[data-layer="photo-bg"], [data-layer="photo"]');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('data-probe', '1');
    rect.setAttribute('width', '540');
    rect.setAttribute('height', '960');
    rect.setAttribute('fill', probe);
    (anchor?.parentNode ?? root).insertBefore(rect, anchor ?? root.firstChild);
  }
  if (photo) {
    const anchor = root.querySelector('[data-layer="photo"]') ?? root.querySelector('[data-layer="photo-bg"]');
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('data-probe', '1');
    image.setAttribute('decoding', 'sync');
    image.__loaded = new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
    image.setAttribute('href', photo.href);
    const [x, y, w, h] = photo.box;
    image.setAttribute('x', String(x));
    image.setAttribute('y', String(y));
    image.setAttribute('width', String(w));
    image.setAttribute('height', String(h));
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    if (anchor) anchor.after(image);
    else root.prepend(image);
  }
  if (flatSlots) {
    flatSlots.forEach(({ index, color }) => {
      const el = document.querySelectorAll('text[data-slot]')[index];
      el.setAttribute('data-flat', '1');
      el.setAttribute('style', `visibility:visible;display:inline;fill:${color};stroke:none;filter:none;opacity:1`);
      el.querySelectorAll('*').forEach((d) => d.setAttribute('style', `visibility:visible;fill:${color};stroke:none;filter:none;opacity:1`));
      for (let n = el.parentElement; n && n !== root; n = n.parentElement) {
        n.setAttribute('data-flat', '1');
        n.setAttribute('style', 'display:inline;visibility:hidden;filter:none;opacity:1;mask:none');
      }
    });
  }
  const shown = (el) => {
    for (let n = el; n && n !== root; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false;
    return getComputedStyle(el).visibility === 'visible';
  };
  return {
    text: [...root.querySelectorAll('text')].filter((el) => !el.hasAttribute('data-baked')).filter(shown).length,
    baked: [...root.querySelectorAll('text[data-baked]')].filter(shown).length,
    birds: [...root.querySelectorAll('[data-layer="birds"] image')].filter(shown).length,
    art: [...root.querySelectorAll('image')].filter((im) => !im.closest('[data-layer="birds"]')).filter(shown).length,
  };
}

// Les textes de décor NEUTRES (#10256, lib/decor-sorts.mjs) changent de nature : `baked`, une couche que l'export rend
// AVEC le décor — ils y sont cuits et quittent les emplacements que l'app peint.
export function markBaked(slots) {
  const wanted = new Set(slots);
  document.querySelectorAll('text[data-slot]').forEach((el) => {
    if (!wanted.has(el.getAttribute('data-slot'))) return;
    el.setAttribute('data-baked', '1');
    [el, ...el.querySelectorAll('[data-k]')].forEach((node) => node.setAttribute('data-k', 'baked'));
  });
}

// Ce que l'app peindra, lu dans le DOM du cadre : chaque <text> (police, graisse, taille, interlettrage, ancre,
// remplissage résolu, filtre résolu, chemin, matrice), chaque oiseau (pose, boîte carrée du sticker, rotation,
// miroir) et le blason (boîte). Coordonnées en pixels de l'image finale (repère 540×960 × 2).
export function read() {
  const S = 2;
  const root = document.querySelector('g[data-layer="root"]');
  const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
  const resolve = (value) => {
    const m = /url\(["']?#([^"')]+)["']?\)/.exec(value ?? '');
    return m ? document.getElementById(m[1]) : null;
  };
  const paint = (value) => {
    const ref = resolve(value);
    if (!ref) return value && value !== 'none' ? { solid: value } : null;
    const stops = [...ref.querySelectorAll('stop')].map((st) => ({
      offset: Number.parseFloat(st.getAttribute('offset') ?? '0'),
      color: getComputedStyle(st).stopColor,
      opacity: Number.parseFloat(getComputedStyle(st).stopOpacity),
    }));
    const attrs = Object.fromEntries(['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits'].filter((a) => ref.hasAttribute(a)).map((a) => [a, ref.getAttribute(a)]));
    return { gradient: ref.tagName, stops, ...attrs };
  };
  const filterOf = (el) => {
    const chain = [];
    for (let n = el; n && n !== root; n = n.parentElement) {
      const ref = resolve(n.getAttribute('filter'));
      if (ref) chain.push([...ref.children].map((p) => Object.fromEntries([['op', p.tagName], ...[...p.attributes].filter((a) => a.name !== 'result' && a.name !== 'in').map((a) => [a.name, a.value])])));
    }
    return chain.length ? chain : null;
  };
  const opacityOf = (el) => {
    let o = 1;
    for (let n = el; n && n !== root; n = n.parentElement) o *= Number.parseFloat(getComputedStyle(n).opacity);
    return round(o, 3);
  };
  const matrix = (el) => {
    const m = el.getCTM();
    return [m.a, m.b, m.c, m.d, m.e * S, m.f * S].map((v) => round(v, 4));
  };
  const box = (r) => [Math.floor(r.x * S), Math.floor(r.y * S), Math.ceil((r.x + r.width) * S) - Math.floor(r.x * S), Math.ceil((r.y + r.height) * S) - Math.floor(r.y * S)];
  const texts = [...root.querySelectorAll('text[data-slot]')].map((el, index) => {
    const cs = getComputedStyle(el);
    const path = el.querySelector('textPath');
    const pathEl = path && document.getElementById((path.getAttribute('href') ?? path.getAttribute('xlink:href') ?? '').slice(1));
    return {
      index,
      slot: el.getAttribute('data-slot'),
      text: el.textContent,
      x: round(Number.parseFloat(el.getAttribute('x') ?? '0') * S),
      baseline: round(Number.parseFloat(el.getAttribute('y') ?? '0') * S),
      matrix: matrix(el),
      anchor: cs.textAnchor,
      font: {
        family: cs.fontFamily.split(',')[0].replaceAll(/["']/g, '').trim(),
        stack: cs.fontFamily,
        weight: Number.parseInt(cs.fontWeight, 10),
        style: cs.fontStyle,
        size: round(Number.parseFloat(cs.fontSize) * S),
        tracking: cs.letterSpacing === 'normal' ? 0 : round(Number.parseFloat(cs.letterSpacing) * S),
      },
      fill: paint(el.getAttribute('fill') ?? cs.fill),
      stroke: cs.stroke !== 'none' ? { paint: paint(el.getAttribute('stroke') ?? cs.stroke), width: round(Number.parseFloat(cs.strokeWidth) * S), order: cs.paintOrder } : null,
      opacity: opacityOf(el),
      filter: filterOf(el),
      path: pathEl ? { d: pathEl.getAttribute('d'), matrix: matrix(pathEl), startOffset: path.getAttribute('startOffset') } : null,
      bbox: box(el.getBoundingClientRect()),
    };
  });
  const birds = [...root.querySelectorAll('[data-layer="birds"] image')].map((im) => {
    const m = im.getCTM();
    const w = Number.parseFloat(im.getAttribute('width'));
    const h = Number.parseFloat(im.getAttribute('height'));
    const x = Number.parseFloat(im.getAttribute('x')) + w / 2;
    const y = Number.parseFloat(im.getAttribute('y')) + h / 2;
    const cx = (m.a * x + m.c * y + m.e) * S;
    const cy = (m.b * x + m.d * y + m.f) * S;
    const scale = Math.hypot(m.a, m.b);
    const size = w * scale * S;
    const flip = m.a * m.d - m.b * m.c < 0;
    const rotate = (Math.atan2(m.b, m.a) * 180) / Math.PI;
    return {
      pose: im.closest('[data-pose]')?.getAttribute('data-pose') ?? null,
      href: (im.getAttribute('href') ?? im.getAttribute('xlink:href') ?? '').slice(22, 422),
      box: [round(cx - size / 2), round(cy - size / 2), round(size), round(size)],
      rotate: round(flip ? (rotate + 180) % 360 : rotate),
      flip,
      opacity: opacityOf(im),
    };
  });
  const crestGroups = [...root.querySelectorAll('[data-layer="crest"]')];
  const union = crestGroups.map((g) => g.getBoundingClientRect()).reduce((acc, r) => acc
    ? { x: Math.min(acc.x, r.x), y: Math.min(acc.y, r.y), r: Math.max(acc.r, r.x + r.width), b: Math.max(acc.b, r.y + r.height) }
    : { x: r.x, y: r.y, r: r.x + r.width, b: r.y + r.height }, null);
  const crest = union ? { box: box({ x: union.x, y: union.y, width: union.r - union.x, height: union.b - union.y }) } : null;
  const motifs = (document.querySelector('svg')?.getAttribute('data-motifs') ?? '').split(' ').filter(Boolean);
  const art = [...root.querySelectorAll('image')].filter((im) => !im.closest('[data-layer="birds"]')).map((im) => box(im.getBoundingClientRect()));
  return { texts, birds, art, crest, motifs };
}
