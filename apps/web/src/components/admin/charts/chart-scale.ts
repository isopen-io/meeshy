/**
 * LES MESURES PURES DES GRAPHIQUES (#8876) — échelles, graduations, tracés. Aucune
 * dépendance, aucun DOM : tout ce qui se calcule se teste ici, et les composants
 * ne font que poser le résultat.
 */

/** Une échelle linéaire `domaine → image`. Un domaine réduit à un point rend le milieu de l'image — jamais une division par zéro. */
export function linearScale(domain: readonly [number, number], range: readonly [number, number]): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return () => (r0 + r1) / 2;
  return (value) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

/** Le pas « rond » (1, 2, 5 × 10ⁿ) le plus proche au-dessus de `raw`. */
function niceStep(raw: number): number {
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  const fraction = raw / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * Les graduations d'un axe de 0 à `max` : environ `count` intervalles, sur des
 * pas ronds, la dernière graduation couvrant `max`. Un maximum nul ou illisible
 * rend `[0, 1]` — un axe vide reste un axe.
 */
export function niceTicks(max: number, count: number): readonly number[] {
  if (!Number.isFinite(max) || max <= 0 || count < 1) return [0, 1];
  const step = niceStep(max / count);
  const ticks: number[] = [];
  for (let value = 0; value < max + step; value += step) {
    ticks.push(Math.round(value * 1e9) / 1e9);
    if (value >= max) break;
  }
  return ticks;
}

/** Le tracé d'une courbe (`M x y L x y …`) dans une boîte `width × height`, avec `padding` px de marge — l'axe y va vers le haut. */
export function sparkPath(values: readonly number[], width: number, height: number, padding = 2): string {
  if (values.length === 0) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const x = linearScale([0, Math.max(values.length - 1, 1)], [padding, width - padding]);
  const y = linearScale([min, max], [height - padding, padding]);
  const round = (value: number): number => Math.round(value * 100) / 100;
  return values.map((value, index) => `${index === 0 ? 'M' : 'L'}${round(x(index))} ${round(y(value))}`).join(' ');
}

export type StackSegment = { readonly value: number; readonly start: number; readonly end: number; readonly share: number };

/** Les parts d'un tout, bout à bout : `start` et `end` en fractions de 0 à 1. Un total nul rend des segments sans largeur. */
export function stackSegments(values: readonly number[]): readonly StackSegment[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  let cursor = 0;
  return values.map((raw) => {
    const value = Math.max(0, raw);
    const share = total === 0 ? 0 : value / total;
    const segment = { value, start: cursor, end: cursor + share, share };
    cursor += share;
    return segment;
  });
}

const polar = (radius: number, turn: number): { readonly x: number; readonly y: number } => ({
  x: radius + radius * Math.sin(turn * 2 * Math.PI),
  y: radius - radius * Math.cos(turn * 2 * Math.PI),
});

/**
 * L'arc d'un anneau, de `start` à `end` (fractions de tour, 0 en haut, sens
 * horaire), de rayon extérieur `radius` et d'épaisseur `thickness`. Centré sur
 * `(radius, radius)` : la boîte de dessin est un carré de `2 × radius`. Un arc
 * de tour complet se trace en deux demi-arcs (un arc SVG dont les extrémités
 * coïncident disparaît).
 */
export function arcPath(start: number, end: number, radius: number, thickness: number): string {
  const inner = radius - thickness;
  const round = (value: number): number => Math.round(value * 100) / 100;
  const at = (r: number, turn: number): string => {
    const point = polar(r, turn);
    return `${round(point.x + (radius - r))} ${round(point.y + (radius - r))}`;
  };
  if (end - start >= 0.9999) {
    return [
      `M${at(radius, 0)}`,
      `A${radius} ${radius} 0 1 1 ${at(radius, 0.5)}`,
      `A${radius} ${radius} 0 1 1 ${at(radius, 1)}`,
      `L${at(inner, 1)}`,
      `A${inner} ${inner} 0 1 0 ${at(inner, 0.5)}`,
      `A${inner} ${inner} 0 1 0 ${at(inner, 0)}`,
      'Z',
    ].join(' ');
  }
  const large = end - start > 0.5 ? 1 : 0;
  return [
    `M${at(radius, start)}`,
    `A${radius} ${radius} 0 ${large} 1 ${at(radius, end)}`,
    `L${at(inner, end)}`,
    `A${inner} ${inner} 0 ${large} 0 ${at(inner, start)}`,
    'Z',
  ].join(' ');
}

export type Peak = { readonly index: number; readonly value: number };

/** Le point le plus haut — le premier en cas d'égalité ; `null` sans aucun point. */
export function peakOf(points: readonly { readonly value: number }[]): Peak | null {
  return points.reduce<Peak | null>(
    (best, point, index) => (best === null || point.value > best.value ? { index, value: point.value } : best),
    null,
  );
}

export type CategoryDatum = { readonly key: string; readonly label: string; readonly value: number };

/**
 * Garde les `limit` premières catégories et replie toutes les suivantes dans
 * UNE catégorie « Autres » (clé `others`, valeur sommée) : une légende de plus de
 * cinq couleurs ne se lit plus. L'ordre reçu est conservé — c'est à l'appelant de
 * présenter ses catégories dans un ordre STABLE, pour que la couleur suive
 * l'entité et qu'un filtre ne repeigne pas les survivantes.
 */
export function foldIntoOthers(items: readonly CategoryDatum[], limit: number, othersLabel: string): readonly CategoryDatum[] {
  if (items.length <= limit) return items;
  const rest = items.slice(limit).reduce((sum, item) => sum + item.value, 0);
  return [...items.slice(0, limit), { key: 'others', label: othersLabel, value: rest }];
}
