// Les MISES EN PAGE de Mee et Meo d'un cadre (#10277, prompt § 5.7) — la partie PURE, sans navigateur : quelles mises
// en page un cadre essaie en plus de celle qu'il dessine, où ses oiseaux partent, comment chacun s'écarte de la photo
// (le moins possible), et laquelle sert par défaut. Le détecteur (lib/overlap-measure.mjs) rend chaque mise en page
// trouvée ici et ne déclare que celles qu'il valide ; la règle elle-même reste lib/overlap-rule.mjs.
//
// Coordonnées en pixels de l'image finale (1080×1920, le repère de design 540×960 × 2).
import { verdict } from './overlap-rule.mjs';

/** L'ordre du contrat partagé (`GLORY_FRAME_BIRD_LAYOUTS`, packages/shared/types/glory-frame-format.ts). */
export const BIRD_LAYOUTS = ['pied', 'perches', 'cotes', 'ruban', 'duo', 'libre', 'selfie'];

/** Ce que le générateur sait poser sur n'importe quel cadre. `ruban` et `libre` ne se posent que là où ils sont dessinés. */
const GENERATED = ['pied', 'perches', 'cotes', 'duo', 'selfie'];

const DESIGN_TO_FINAL = 2;

// Les places canoniques de lib/base.py (MEE_LAYOUTS), en repère de design : x, y, largeur, miroir, rotation.
const NOMINAL = {
  pied: [[98, 700, 150, false, -6], [442, 700, 150, true, 6]],
  perches: [[118, 92, 120, false, -10], [422, 92, 120, true, 10]],
  cotes: [[40, 430, 140, false, 18], [500, 470, 140, true, -18]],
  duo: [[270, 700, 200, false, 0]],
  selfie: [[420, 640, 190, true, 0]],
};

const DEFAULT_POSES = { mee: 'mee-coucou', meo: 'meo-salut', pair: 'duo-coucou' };

/** Le mot de mise en page du manifeste (« perchés (Mee coucou…) », « côtés », « selfie : … »), ramené à la liste fermée. */
export function drawnLayoutOf(prose, birdCount) {
  const word = (prose ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[\s(,:]/)[0] ?? '';
  if (word === 'selfie') return 'selfie';
  if (birdCount === 1) return 'duo';
  return { pied: 'pied', perches: 'perches', cotes: 'cotes', ruban: 'ruban', duo: 'duo' }[word] ?? 'libre';
}

/**
 * Les mises en page qu'un cadre ESSAIE en plus de la sienne. Aucune quand son décor tient à ses oiseaux : une lueur
 * qui les suit (`data-follows-bird`) ou les queues d'un ruban tenues au bec resteraient à la place dessinée.
 */
export function layoutsToTry({ drawn, tied }) {
  if (tied || drawn === 'ruban') return [];
  return GENERATED.filter((layout) => layout !== drawn);
}

const firstPose = (birds, prefix) => birds.map((bird) => bird.pose).find((pose) => pose?.startsWith(prefix) && !pose.includes('selfie'));

/** Les poses d'une mise en page générée : celles que le cadre dessine, jamais une pose de selfie hors du selfie. */
export function posesFor(drawnBirds) {
  return {
    mee: firstPose(drawnBirds, 'mee-') ?? DEFAULT_POSES.mee,
    meo: firstPose(drawnBirds, 'meo-') ?? DEFAULT_POSES.meo,
    pair: firstPose(drawnBirds, 'duo-') ?? DEFAULT_POSES.pair,
  };
}

/** Les ancres de départ d'une mise en page générée : pose, centre, largeur de la boîte carrée, rotation, miroir. */
export function nominalAnchors(layout, poses) {
  const spots = NOMINAL[layout];
  if (!spots) throw new Error(`mise en page non générée : ${layout}`);
  const posesOf = { duo: [poses.pair], selfie: ['meo-selfie'] }[layout] ?? [poses.mee, poses.meo];
  return spots.map(([x, y, size, flip, rotate], at) => ({
    pose: posesOf[at],
    center: [x * DESIGN_TO_FINAL, y * DESIGN_TO_FINAL],
    size: size * DESIGN_TO_FINAL,
    rotate,
    flip,
  }));
}

const round4 = (value) => Math.round(value * 10_000) / 10_000;

/**
 * Où le DESSIN d'une pose tient dans la boîte carrée de son ancre (unités de la boîte, 0 à 1) : l'image de la pose,
 * rognée à son contenu, y est ajustée sans déformation (`xMidYMid meet`, lib/base.py bird()).
 */
export function artRect([width, height]) {
  if (width >= height) return [0, round4((1 - height / width) / 2), 1, round4(height / width)];
  return [round4((1 - width / height) / 2), 0, round4(width / height), 1];
}

/**
 * Ce qu'un corps d'oiseau (pixels opaques relatifs à son centre, `[x0, y0, x1, y1, …]`) recouvre, déplacé de
 * (`dx`, `dy`) et mis à l'échelle : pixels de photo, profondeur dans la fenêtre, pixels hors de la carte (marge
 * comprise), pixels sur un texte ou le blason, pixels sur un visage.
 */
export function scoreBody(body, [cx, cy], { dx, dy, scale }, ctx, stopAbove = Infinity) {
  const { win, dist, clear, width, height, margin = 0, faces = [] } = ctx;
  let overlap = 0, depth = 0, outside = 0, covered = 0, face = 0;
  const seen = new Set();
  for (let k = 0; k < body.length; k += 2) {
    const x = Math.round(cx + dx + body[k] * scale);
    const y = Math.round(cy + dy + body[k + 1] * scale);
    const key = y * width + x;
    if (seen.has(key)) continue;
    seen.add(key);
    if (x < margin || y < margin || x >= width - margin || y >= height - margin) {
      outside++;
      continue;
    }
    if (win[key]) {
      overlap++;
      depth = Math.max(depth, dist[key]);
      if (overlap > stopAbove) break;
    }
    if (clear[key]) covered++;
    if (faces.some(([fx, fy, fr]) => (x - fx) ** 2 + (y - fy) ** 2 <= fr * fr)) face++;
  }
  return { overlap, depth, outside, covered, face };
}

const SCALES = [1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58];
// Réduire un oiseau coûte plus que le déplacer : 6 % de taille pèsent autant que 48 px de déplacement.
const SHRINK_COST = 800;
// Un oiseau peut effleurer le bord d'une boîte de texte ou du blason (3 % de son corps), jamais la couvrir.
const CLEAR_SLACK = 0.03;
// Par oiseau, sous la règle (250 px² et 6 px de design pour le cadre) avec une marge, pour que deux oiseaux tiennent
// ensemble et que le Chromium de la CI, dont l'antialiasing diffère d'un pixel, juge pareil.
const TARGET = { overlap: 100 * 4, depth: 4 * 2 };

function candidates({ direction, step, maxShift, scales, everywhere }) {
  const [ux, uy] = direction;
  const around = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const outward = [[ux, 0], [0, uy], [ux, uy], [ux, uy / 2], [ux / 2, uy], [ux, -uy / 2], [-ux / 2, uy], [0, -uy], [-ux, 0]];
  const dirs = (everywhere ? around : outward).map(([a, b]) => {
    const n = Math.hypot(a, b) || 1;
    return [a / n, b / n];
  });
  const list = [];
  for (let d = 0; d <= maxShift; d += step) {
    for (const scale of scales) {
      for (const [a, b] of d === 0 ? [[0, 0]] : dirs) list.push({ dx: Math.round(a * d), dy: Math.round(b * d), scale, cost: d + SHRINK_COST * (1 - scale) });
    }
  }
  return list.sort((p, q) => p.cost - q.cost);
}

function windowCentroid({ win, width }) {
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < win.length; i++) {
    if (!win[i]) continue;
    sx += i % width;
    sy += Math.floor(i / width);
    n++;
  }
  return n ? [sx / n, sy / n] : [0, 0];
}

/**
 * La plus petite correction (déplacement, réduction) qui pose un oiseau HORS de la photo — ou, pour le selfie, DANS la
 * photo mais hors de tout visage —, sans sortir de la carte ni couvrir un texte ; `null` quand aucune ne tient.
 */
export function placeBody(body, center, ctx, options = {}) {
  const { target = TARGET, step = 4, maxShift = 320, scales = SCALES, selfie = false } = options;
  const [wx, wy] = windowCentroid(ctx);
  const direction = [Math.sign(center[0] - wx) || 1, Math.sign(center[1] - wy) || 1];
  const pixels = body.length / 2;
  const fits = (move) => {
    const s = scoreBody(body, center, move, ctx, selfie ? Infinity : target.overlap);
    if (s.outside > 0 || s.face > 0 || s.covered > CLEAR_SLACK * pixels) return false;
    if (!selfie) return s.overlap <= target.overlap && s.depth <= target.depth;
    const x = Math.round(center[0] + move.dx);
    const y = Math.round(center[1] + move.dy);
    return ctx.win[y * ctx.width + x] === 1;
  };
  const found = candidates({ direction, step, maxShift, scales, everywhere: selfie }).find(fits);
  return found ? { dx: found.dx, dy: found.dy, scale: found.scale } : null;
}

/** La mise en page par défaut : la dessinée, sauf le selfie (choisi exprès, H-3) ; alors la première déclarée. */
export function defaultLayoutOf(drawn, declared) {
  if (drawn !== 'selfie' && declared.includes(drawn)) return drawn;
  return BIRD_LAYOUTS.find((layout) => layout !== 'selfie' && declared.includes(layout)) ?? null;
}

const isOk = (layout, validated) => verdict({ ...validated, selfie: layout === 'selfie' }) === 'ok';

/**
 * Ce qu'un cadre DÉCLARE (controle/mises-en-page-<collection>.json, puis l'export et le contrat) : chaque mise en page
 * que le détecteur a validée, ses ancres et son verdict, dans l'ordre du contrat ; celles qu'il refuse, et pourquoi
 * (`hors-regle`, `visage`, `sans-place` quand aucune place hors de la photo n'a été trouvée).
 */
export function frameRecord({ frame, drawn, measured, unplaced }) {
  const kept = measured.filter(({ layout, validated }) => isOk(layout, validated));
  const layouts = Object.fromEntries(BIRD_LAYOUTS.flatMap((id) => {
    const found = kept.find((entry) => entry.layout === id);
    return found ? [[id, { birds: found.birds, validated: found.validated }]] : [];
  }));
  const rejected = Object.fromEntries([
    ...measured.filter(({ layout, validated }) => !isOk(layout, validated)).map(({ layout, validated }) => [layout, verdict({ ...validated, selfie: layout === 'selfie' })]),
    ...unplaced.map((layout) => [layout, 'sans-place']),
  ].sort(([a], [b]) => BIRD_LAYOUTS.indexOf(a) - BIRD_LAYOUTS.indexOf(b)));
  return { frame, drawn, default: defaultLayoutOf(drawn, Object.keys(layouts)), layouts, rejected };
}

const sameAnchors = (a, b) => a.length === b.length && a.every((bird, at) => bird.pose === b[at].pose && bird.flip === b[at].flip
  && Math.abs(bird.rotate - b[at].rotate) <= 0.5 && bird.box.every((v, k) => Math.abs(v - b[at].box[k]) <= 1));

/**
 * La GARDE (overlap.mjs --check) sur un cadre déclaré : la mise en page dessinée déclarée est bien celle du SVG, le
 * défaut existe et n'est jamais selfie, et chaque mise en page déclarée, re-mesurée à ses ancres, est dans la règle.
 */
export function recordFailures(record, { drawnBirds, remeasured }) {
  if (!record) return ['absent de controle/mises-en-page : relancer `node lib/overlap.mjs`'];
  const failures = [];
  const drawn = record.layouts[record.drawn];
  if (drawn && !sameAnchors(drawn.birds, drawnBirds)) failures.push(`ancres de « ${record.drawn} » périmées (lib/anchors.json a bougé) : relancer \`node lib/overlap.mjs\``);
  if (!record.default || record.default === 'selfie' || !record.layouts[record.default]) failures.push(`mise en page par défaut invalide : ${record.default}`);
  for (const [layout, validated] of Object.entries(remeasured)) {
    if (record.layouts[layout] && !isOk(layout, validated)) failures.push(`${layout} : ${verdict({ ...validated, selfie: layout === 'selfie' })} (overlap ${validated.overlap}, depth ${validated.depth}, face ${validated.face})`);
  }
  return failures;
}

/**
 * `birds` de l'export (lib/export.mjs) : les mises en page DÉCLARÉES du cadre, chacune avec ses ancres et son verdict
 * (`validated`). Un relevé absent, ou dont les ancres dessinées ne sont plus celles du SVG, arrête l'export.
 */
export function exportedBirds(record, drawnBirds) {
  const failures = recordFailures(record, { drawnBirds, remeasured: {} });
  if (failures.length > 0) throw new Error(`${record?.frame ?? 'cadre'} : ${failures.join(' ; ')}`);
  return { default: record.default, drawn: record.drawn, layouts: record.layouts };
}
