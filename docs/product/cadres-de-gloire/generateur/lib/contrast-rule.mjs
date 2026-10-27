// La règle de LISIBILITÉ des textes d'un cadre (#10265, prompt § 5.2 et § 7 L3), partagée par l'export (lib/export.mjs,
// qui inscrit `contrast` au contrat) et la garde de CI (lib/contrast.mjs). Pure : des images RGBA { data, width, height }.
//
// Deux mesures, sur les pixels de glyphe d'un emplacement (le rendu « à plat » de son texte principal, une couleur par
// emplacement) :
//   - SOUS le glyphe (`underGlyphContrastOf`) : le remplissage déclaré, à son opacité, contre ce que la scène peint
//     dessous sans aucun texte — la mesure que l'export inscrit au contrat (`contrast`), effets non comptés ;
//   - AU BORD du glyphe, effet compris (`edgeContrastOf`) : la couleur réelle du remplissage à chaque pixel de bord,
//     contre ce qui l'ENTOURE de 1 à 3 px — la scène finale où le remplissage des textes principaux est retiré (leur
//     anticrénelage ne contamine donc rien) mais où restent leur contour, leurs ombres et leurs lueurs. C'est là que
//     l'œil sépare la lettre de son fond : un contour sombre y compte, une lueur de la couleur du texte n'y sauve rien.
//     Pour chaque pixel de bord, le meilleur des trois pas : la séparation que l'œil trouve juste au-delà.
// Les deux rendent le 5e centile des rapports (le pire, à 5 % de pixels près) et le minimum.
// Le verdict : `tenu` au seuil (4,5:1, 3:1 au-dessus de 24 px — le calcul de packages/design-tokens/scripts/check-jetons.mjs),
// `effet` quand l'emplacement DÉCLARE un effet (une copie posée sous lui, ou un contour) et que la mesure au bord tient
// le seuil, sinon `bas`.

export const MIN_CONTRAST = 4.5;
export const MIN_CONTRAST_LARGE = 3;
export const LARGE_TEXT_PX = 24;
const SEARCH_MARGIN = 8;
const EDGE_STEPS = [1, 2, 3];
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const minContrastFor = (size) => (size > LARGE_TEXT_PX ? MIN_CONTRAST_LARGE : MIN_CONTRAST);

export const luminance = (r, g, b) => {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const ratioOf = (la, lb) => (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
export const contrastRatio = (a, b) => ratioOf(luminance(...a), luminance(...b));

export const rgbOf = (css) => {
  const m = /rgba?\(([^)]+)\)/.exec(css ?? '');
  if (m) return m[1].split(',').slice(0, 3).map((v) => Number.parseFloat(v));
  const h = /^#([0-9a-f]{6})/i.exec(css ?? '');
  return h ? [0, 2, 4].map((i) => Number.parseInt(h[1].slice(i, i + 2), 16)) : null;
};
export const fillColors = (fill) => (fill?.solid ? [rgbOf(fill.solid)] : (fill?.stops ?? []).map((s) => rgbOf(s.color))).filter(Boolean);

/** La couleur à plat du i-ème emplacement dans le rendu des masques : une par emplacement, jamais celle d'un décor. */
export const flatColor = (i) => [20 + (i % 8) * 30, 20 + Math.floor(i / 8) * 30, 200];

const round2 = (v) => Math.round(v * 100) / 100;
const summary = (ratios, extra = {}) => {
  if (ratios.length === 0) return null;
  const sorted = [...ratios].sort((x, y) => x - y);
  return { contrast: round2(sorted[Math.floor(sorted.length * 0.05)]), contrastMin: round2(sorted[0]), ...extra };
};

const windowOf = ({ width, height }, [bx, by, bw, bh]) => ({
  x0: Math.max(0, bx - SEARCH_MARGIN), x1: Math.min(width, bx + bw + SEARCH_MARGIN),
  y0: Math.max(0, by - SEARCH_MARGIN), y1: Math.min(height, by + bh + SEARCH_MARGIN),
});

const glyphTest = ({ data }, color) => (p) => data[p + 3] === 255 && data[p] === color[0] && data[p + 1] === color[1] && data[p + 2] === color[2];
const premultiplied = ({ data }, p) => {
  const a = data[p + 3] / 255;
  return [data[p] * a, data[p + 1] * a, data[p + 2] * a];
};

/** Le remplissage déclaré contre ce qui est DESSOUS (la scène sans texte) : la mesure du contrat. */
export function underGlyphContrastOf({ mask, color, under, slot }) {
  const colors = fillColors(slot.fill);
  if (colors.length === 0) return null;
  const op = slot.opacity;
  const inGlyph = glyphTest(mask, color);
  const { x0, x1, y0, y1 } = windowOf(mask, slot.bbox);
  const ratios = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const p = (y * mask.width + x) * 4;
    if (!inGlyph(p)) continue;
    const back = premultiplied(under, p);
    const lb = luminance(...back);
    ratios.push(Math.min(...colors.map((c) => ratioOf(luminance(...c.map((v, k) => v * op + back[k] * (1 - op))), lb))));
  }
  return summary(ratios, { glyphPixels: ratios.length });
}

/** La couleur réelle du remplissage, au bord du glyphe, contre ce qui l'entoure (contour et effets compris). */
export function edgeContrastOf({ mask, color, fills, around, slot }) {
  const op = slot.opacity;
  const inGlyph = glyphTest(mask, color);
  const { width, height } = mask;
  const { x0, x1, y0, y1 } = windowOf(mask, slot.bbox);
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  const ratios = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const p = (y * width + x) * 4;
    if (!inGlyph(p)) continue;
    const fill = [fills.data[p], fills.data[p + 1], fills.data[p + 2]];
    for (const [dx, dy] of DIRECTIONS) {
      if (!inside(x + dx, y + dy) || inGlyph(((y + dy) * width + x + dx) * 4)) continue;
      const seen = EDGE_STEPS
        .map((d) => [x + dx * d, y + dy * d])
        .filter(([qx, qy]) => inside(qx, qy) && !inGlyph((qy * width + qx) * 4))
        .map(([qx, qy]) => {
          const out = premultiplied(around, (qy * width + qx) * 4);
          return ratioOf(luminance(...fill.map((v, k) => v * op + out[k] * (1 - op))), luminance(...out));
        });
      if (seen.length) ratios.push(Math.max(...seen));
    }
  }
  return summary(ratios, { edgePixels: ratios.length });
}

/** Un effet DÉCLARÉ : une copie du texte posée avec lui (ombre, lueur), ou un contour. */
export const declaresEffect = (slot) => (slot.effects?.length ?? 0) > 0 || Boolean(slot.stroke);

export function verdictOf({ size, contrast, withEffect, effect }) {
  const min = minContrastFor(size);
  if ((contrast ?? 0) >= min) return 'tenu';
  return effect && (withEffect ?? 0) >= min ? 'effet' : 'bas';
}

/** `fresh` : bas et hors du cliquet — rouge ; `tolerated` : bas et listé ; `solved` : listé, et plus bas ici. */
export function judgeContrast(rows, listed) {
  const known = new Set(listed);
  const low = rows.filter((row) => row.verdict === 'bas');
  const lowIds = new Set(low.map((row) => row.id));
  return {
    fresh: low.filter((row) => !known.has(row.id)),
    tolerated: low.filter((row) => known.has(row.id)),
    solved: [...known].filter((id) => !lowIds.has(id)).sort(),
  };
}

/** Les `<text>` d'un même `data-slot` : le principal est le dernier texte plein, les autres sont ses effets. */
export function slotsOf(texts) {
  const groups = new Map();
  texts.forEach((t) => groups.set(t.slot, [...(groups.get(t.slot) ?? []), t]));
  return [...groups.entries()].map(([slot, members]) => {
    const plain = members.filter((t) => !t.filter && t.opacity >= 0.5);
    const main = (plain.length ? plain : members).at(-1);
    const effects = members.filter((t) => t !== main).map((t) => ({
      dx: round2(t.matrix[4] + t.x - main.matrix[4] - main.x),
      dy: round2(t.matrix[5] + t.baseline - main.matrix[5] - main.baseline),
      fill: t.fill, stroke: t.stroke, opacity: t.opacity, filter: t.filter, under: t.index < main.index,
    }));
    return { slot, main, effects };
  });
}
