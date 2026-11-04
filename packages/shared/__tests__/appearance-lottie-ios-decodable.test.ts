import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #15553 — un film du catalogue d'apparence doit se LIRE sur iOS, pas seulement passer `validateLottie`.
 * iOS lit les couches par `LottieAnimation.from(data:)` (lottie-ios, décodage par dictionnaire) : un élément de
 * forme sans `ty`, un tracé sans `ks`, un groupe sans `it` font échouer TOUT le film, et la couche s'efface sans
 * bruit. Ce témoin applique les mêmes exigences de structure aux films que le catalogue référence, pour qu'un
 * film illisible rougisse ici, avant le simulateur (cas réel : l'éclat de « scintillement », #15158, posé en
 * bézier nu dans un groupe).
 */
const DIR = join(__dirname, '../design/appearance');
const SOURCES = ['avatar-rings/rings.json', 'wallpapers/designs.json', 'banners/designs.json', 'banner-frames/frames.json'];

type Json = Readonly<Record<string, unknown>>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isKeyframes = (value: unknown): boolean => isRecord(value) && 'k' in value;

const REQUIRED: Readonly<Record<string, readonly string[]>> = {
  gr: [],
  sh: ['ks'],
  el: ['p', 's'],
  rc: ['p', 's', 'r'],
  sr: ['p', 'or', 'os', 'r', 'pt'],
  fl: ['c', 'o'],
  st: ['c', 'o', 'w'],
  gf: ['o', 's', 'e', 'g'],
  gs: ['o', 's', 'e', 'g', 'w'],
  tr: [],
  tm: ['s', 'e', 'o'],
  rp: ['c', 'o'],
  rd: ['r'],
  mm: [],
};

function shapeDefects(item: unknown, at: string): string[] {
  if (!isRecord(item)) return [`${at} : élément de forme non objet`];
  const ty = item['ty'];
  if (typeof ty !== 'string') return [`${at} : élément de forme sans « ty » (${Object.keys(item).join(',')})`];
  const required = REQUIRED[ty];
  if (required === undefined) return [`${at} : type de forme « ${ty} » hors de ce que les films du catalogue emploient`];
  const missing = required.filter((key) => !isKeyframes(item[key]) && !(ty.startsWith('g') && key === 'g' && isRecord(item[key]))).map((key) => `${at}/${ty} : « ${key} » absent`);
  if (ty !== 'gr') return missing;
  const items = item['it'];
  if (!Array.isArray(items)) return [...missing, `${at}/gr : « it » absent`];
  return [...missing, ...items.flatMap((child, index) => shapeDefects(child, `${at}/gr[${index}]`))];
}

function layerDefects(layer: unknown, at: string): string[] {
  if (!isRecord(layer)) return [`${at} : couche non objet`];
  const head = ['ty', 'ind', 'ip', 'op', 'st'].filter((key) => !isNumber(layer[key])).map((key) => `${at} : « ${key} » absent`);
  const ks = layer['ks'];
  const transform = isRecord(ks) ? ['o', 'r', 'p', 'a', 's'].filter((key) => !isKeyframes(ks[key])).map((key) => `${at}/ks : « ${key} » absent`) : [`${at} : « ks » absent`];
  const shapes = layer['ty'] === 4 ? (Array.isArray(layer['shapes']) ? layer['shapes'].flatMap((item, index) => shapeDefects(item, `${at}/shapes[${index}]`)) : [`${at} : « shapes » absent`]) : [];
  return [...head, ...transform, ...shapes];
}

function lottieIosDefects(film: unknown): string[] {
  if (!isRecord(film)) return ['film non objet'];
  const head = [typeof film['v'] === 'string' ? [] : ['« v » absent'], ...['fr', 'ip', 'op', 'w', 'h'].map((key) => (isNumber(film[key]) ? [] : [`« ${key} » absent`]))].flat();
  const layers = Array.isArray(film['layers']) ? film['layers'].flatMap((layer, index) => layerDefects(layer, `layers[${index}]`)) : ['« layers » absent'];
  return [...head, ...layers];
}

const referencedFilms = (): readonly string[] =>
  [...new Set(SOURCES.flatMap((file) => [...readFileSync(join(DIR, file), 'utf8').matchAll(/"src": "([0-9a-f]{16}\.json)"/g)].map((match) => match[1]!)))].sort();

describe('les films du catalogue d’apparence se lisent avec lottie-ios', () => {
  it('le témoin refuse un bézier nu dans un groupe, et accepte le même tracé enveloppé', () => {
    const bezier = { c: true, v: [[0, 0], [1, 0], [0, 1]], i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]] };
    const film = (item: unknown) => ({
      v: '5.7.0', fr: 30, ip: 0, op: 30, w: 10, h: 10,
      layers: [{ ty: 4, ind: 1, ip: 0, op: 30, st: 0, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [0, 0, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } }, shapes: [{ ty: 'gr', it: [item, { ty: 'fl', c: { a: 0, k: [1, 1, 1, 1] }, o: { a: 0, k: 100 } }, { ty: 'tr' }] }] }],
    });
    expect(lottieIosDefects(film(bezier))).toHaveLength(1);
    expect(lottieIosDefects(film({ ty: 'sh', ks: { a: 0, k: bezier } }))).toEqual([]);
  });

  it('chaque film référencé — illustrés, Noël, collections Meeshy, fonds et bannières animés — a la structure que lottie-ios décode', () => {
    const films = referencedFilms();
    expect(films.length).toBeGreaterThanOrEqual(106);
    const defects = films.flatMap((src) => lottieIosDefects(JSON.parse(readFileSync(join(DIR, 'lottie', src), 'utf8'))).map((defect) => `${src} ${defect}`));
    expect(defects).toEqual([]);
  });
});
