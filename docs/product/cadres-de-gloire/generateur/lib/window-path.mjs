// La fenêtre photo VECTORIELLE d'un cadre (#10254, § 5.2) : le masque sans perte que les sondes magenta et verte
// trouvent (lib/export.mjs) devient un chemin RECTILIGNE posé sur la grille des pixels. Chaque côté longe un bord de
// pixel, donc un `clip` antialiasé (Canvas 2D, Core Graphics) couvre chaque pixel à 0 ou à 1 : le chemin rend le
// masque à l'identique, sans tolérance à dépenser, et le peintre découpe la photo sans décoder d'image.
//
// La grammaire est FERMÉE (`WINDOW_PATH_PATTERN`) : sous-chemins `M x y` suivis de pas relatifs `h`/`v` entiers et
// fermés par `Z`. Chaque contour tourne la fenêtre à sa DROITE (sens horaire à l'écran) ; un trou tourne donc dans
// l'autre sens, et la règle non nulle comme la règle pair-impair le laissent vide.

export const WINDOW_PATH_PATTERN = /^(?:M\d+ \d+(?:[hv]-?\d+)+Z)+$/;

const RIGHT = 0, DOWN = 1, LEFT = 2, UP = 3;
const STEP = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// Les côtés orientés du masque, par sommet de la grille (largeur + 1) × (hauteur + 1) : un bit par direction sortante.
function boundary({ data, width, height }) {
  const stride = width + 1;
  const out = new Uint8Array(stride * (height + 1));
  const on = (x, y) => x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] !== 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!on(x, y)) continue;
      if (!on(x, y - 1)) out[y * stride + x] |= 1 << RIGHT;
      if (!on(x + 1, y)) out[y * stride + x + 1] |= 1 << DOWN;
      if (!on(x, y + 1)) out[(y + 1) * stride + x + 1] |= 1 << LEFT;
      if (!on(x - 1, y)) out[(y + 1) * stride + x] |= 1 << UP;
    }
  }
  return { out, stride };
}

// Un contour, suivi depuis un côté libre : au sommet, on tourne à droite d'abord (la fenêtre reste à droite), puis
// tout droit, puis à gauche. Un pas consommé s'efface : chaque côté appartient à un seul contour.
function trace(out, stride, start, first) {
  const steps = [];
  let vertex = start;
  let dir = first;
  for (;;) {
    out[vertex] &= ~(1 << dir);
    steps.push({ vertex, dir });
    vertex += STEP[dir][0] + STEP[dir][1] * stride;
    if (vertex === start && out[vertex] === 0) return steps;
    const next = [(dir + 1) % 4, dir, (dir + 3) % 4].find((candidate) => (out[vertex] & (1 << candidate)) !== 0);
    if (next === undefined) return steps;
    dir = next;
  }
}

// Les pas unitaires d'un contour fermé, regroupés en côtés : le chemin part d'un COIN, pour que le premier et le
// dernier côté ne soient jamais deux moitiés d'un même segment.
function sides(steps) {
  const corner = steps.findIndex((step, at) => step.dir !== steps[(at + steps.length - 1) % steps.length].dir);
  const rotated = corner <= 0 ? steps : [...steps.slice(corner), ...steps.slice(0, corner)];
  const runs = [];
  for (const step of rotated) {
    const last = runs.at(-1);
    if (last !== undefined && last.dir === step.dir) last.length += 1;
    else runs.push({ vertex: step.vertex, dir: step.dir, length: 1 });
  }
  return runs;
}

const sideText = ({ dir, length }) => (dir === RIGHT ? `h${length}` : dir === LEFT ? `h-${length}` : dir === DOWN ? `v${length}` : `v-${length}`);

/**
 * Le chemin d'un masque binaire (`data[y * width + x] !== 0` : la photo s'y voit), dans le repère de l'image :
 * `origin` est le coin haut-gauche de la boîte du masque. `null` pour un masque vide. Déterministe : les contours se
 * prennent dans l'ordre de balayage de la grille.
 */
export function windowPath({ data, width, height, origin }) {
  const { out, stride } = boundary({ data, width, height });
  const [ox, oy] = origin;
  const parts = [];
  for (let vertex = 0; vertex < out.length; vertex++) {
    while (out[vertex] !== 0) {
      const first = [RIGHT, DOWN, LEFT, UP].find((dir) => (out[vertex] & (1 << dir)) !== 0);
      const runs = sides(trace(out, stride, vertex, first));
      const head = runs[0].vertex;
      parts.push(`M${ox + (head % stride)} ${oy + Math.floor(head / stride)}${runs.slice(0, -1).map(sideText).join('')}Z`);
    }
  }
  return parts.length === 0 ? null : parts.join('');
}

// Les côtés verticaux d'un chemin de la grammaire fermée, avec leur sens (+1 vers le bas) : ce que la règle non
// nulle compte sur une ligne de pixels. Un `Z` qui fermerait en diagonale rend le chemin illisible.
function verticalSides(d) {
  if (!WINDOW_PATH_PATTERN.test(d)) throw new Error(`chemin de fenêtre hors grammaire : ${d.slice(0, 40)}`);
  return [...d.matchAll(/M(\d+) (\d+)((?:[hv]-?\d+)+)Z/g)].flatMap(([, sx, sy, moves]) => {
    const start = [Number(sx), Number(sy)];
    const deltas = [...moves.matchAll(/([hv])(-?\d+)/g)].map(([, axis, n]) => (axis === 'h' ? [Number(n), 0] : [0, Number(n)]));
    const closing = [start];
    for (const [dx, dy] of deltas) closing.push([closing.at(-1)[0] + dx, closing.at(-1)[1] + dy]);
    closing.push(start);
    return closing.slice(1).flatMap((to, at) => {
      const from = closing[at];
      if (from[0] !== to[0] && from[1] !== to[1]) throw new Error(`chemin de fenêtre fermé en diagonale : ${d.slice(0, 40)}`);
      return from[0] === to[0] && from[1] !== to[1] ? [{ x: from[0], y0: Math.min(from[1], to[1]), y1: Math.max(from[1], to[1]), sign: to[1] > from[1] ? 1 : -1 }] : [];
    });
  });
}

/** Le masque que le chemin découpe sur la boîte `origin` + `width` × `height` (règle non nulle, centre des pixels). */
export function rasterizeWindowPath(d, { origin, width, height }) {
  const [ox, oy] = origin;
  const edges = verticalSides(d);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const center = oy + y + 0.5;
    const crossings = edges.filter((edge) => edge.y0 < center && center < edge.y1).sort((a, b) => a.x - b.x);
    let winding = 0;
    let next = 0;
    for (let x = 0; x < width; x++) {
      while (next < crossings.length && crossings[next].x <= ox + x) winding += crossings[next++].sign;
      data[y * width + x] = winding === 0 ? 0 : 1;
    }
  }
  return data;
}
