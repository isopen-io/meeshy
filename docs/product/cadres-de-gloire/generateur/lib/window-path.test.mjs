// Témoins de la fenêtre VECTORIELLE (#10254) : le masque sans perte que les sondes trouvent devient un chemin
// rectiligne « M…Z » sur la grille des pixels, que le peintre web (Path2D) et iOS découpent sans décoder d'image.
// La preuve est au pixel : le chemin rastérisé (règle non nulle, centre des pixels) rend le masque à l'identique.
// Usage : node --test lib/window-path.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WINDOW_PATH_PATTERN, rasterizeWindowPath, windowPath } from './window-path.mjs';

const maskOf = (rows) => {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => [...row].forEach((cell, x) => { data[y * width + x] = cell === '#' ? 1 : 0; }));
  return { data, width, height };
};

const roundTrip = (mask, origin = [0, 0]) => {
  const d = windowPath({ ...mask, origin });
  const back = rasterizeWindowPath(d, { origin, width: mask.width, height: mask.height });
  return { d, back };
};

test('un rectangle plein est un seul sous-chemin de quatre côtés', () => {
  const mask = maskOf(['####', '####', '####']);
  assert.equal(windowPath({ ...mask, origin: [128, 528] }), 'M128 528h4v3h-4Z');
});

test('la fenêtre se lit dans le repère de l\'image : l\'origine de la boîte décale le chemin', () => {
  const mask = maskOf(['..', '.#']);
  assert.equal(windowPath({ ...mask, origin: [10, 20] }), 'M11 21h1v1h-1Z');
});

test('une arche (coins en escalier) se rastérise au masque, pixel pour pixel', () => {
  const mask = maskOf(['..####..', '.######.', '########', '########', '########']);
  const { d, back } = roundTrip(mask, [5, 7]);
  assert.match(d, WINDOW_PATH_PATTERN);
  assert.deepEqual([...back], [...mask.data]);
});

test('un trou dans la fenêtre tourne en sens inverse : la règle non nulle le laisse vide', () => {
  const mask = maskOf(['#####', '#...#', '#.#.#', '#...#', '#####']);
  const { d, back } = roundTrip(mask);
  assert.equal(d.match(/M/g).length, 3);
  assert.deepEqual([...back], [...mask.data]);
});

test('deux fenêtres disjointes et deux pixels en diagonale restent exacts', () => {
  const mask = maskOf(['##..##', '##..##', '......', '#.....', '.#....']);
  const { back } = roundTrip(mask);
  assert.deepEqual([...back], [...mask.data]);
});

test('un disque de rayon 60 tient au masque et le chemin reste compact', () => {
  const size = 121;
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data[y * size + x] = (x + 0.5 - 60.5) ** 2 + (y + 0.5 - 60.5) ** 2 <= 60 ** 2 ? 1 : 0;
  const mask = { data, width: size, height: size };
  const { d, back } = roundTrip(mask);
  assert.deepEqual([...back], [...data]);
  assert.ok(d.length < 4 * 4 * size, `chemin de ${d.length} caractères`);
});

test('le chemin est déterministe : deux exports du même masque rendent la même chaîne', () => {
  const mask = maskOf(['.###.', '#####', '##.##', '#####']);
  assert.equal(windowPath({ ...mask, origin: [3, 4] }), windowPath({ ...mask, origin: [3, 4] }));
});

test('un masque vide n\'a pas de chemin', () => {
  assert.equal(windowPath({ ...maskOf(['...', '...']), origin: [0, 0] }), null);
});

test('la grammaire est FERMÉE : seuls M, h, v et Z entiers ; tout autre tracé SVG est refusé', () => {
  assert.match('M128 528h824v948h-824Z', WINDOW_PATH_PATTERN);
  assert.match('M0 0h2v2h-2ZM5 5h1v1h-1Z', WINDOW_PATH_PATTERN);
  for (const bad of ['M0 0L5 5Z', 'M0 0h2v2h-2', 'M0 0c1 1 2 2 3 3Z', 'M0.5 0h2v2h-2Z', 'M0 0h2v2h-2Z<script>', '']) assert.doesNotMatch(bad, WINDOW_PATH_PATTERN);
});
