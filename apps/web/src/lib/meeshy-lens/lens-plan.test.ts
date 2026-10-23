import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseLens, type Lens, type LensLayer } from '@meeshy/shared/types/lens-format';

import { anchorPointOf, anchorScaleOf, facePointOf } from './face-anchor';
import { lensLutOf, planLens, type LensDrawOp, type LensLevel } from './lens-plan';

/**
 * CE QU'UNE LENS PEINT SUR UNE IMAGE (W14, #11320) — le plan lit une lens du
 * contrat MeeshyLens v1 (S15) telle que `parseLens` la rend, sur les vecteurs
 * PARTAGÉS avec iOS, et la pose sur la boîte du visage.
 */
type Vector = { readonly name: string; readonly input: unknown };

const VECTORS = fileURLToPath(new URL('../../../../../packages/shared/fixtures/lens-v1/vectors.json', import.meta.url));
const GOLDEN = fileURLToPath(new URL('./goldens/aurore-polaire.plan.json', import.meta.url));

const sharedLens = (): Lens => {
  const vectors = (JSON.parse(readFileSync(VECTORS, 'utf8')) as { readonly vectors: readonly Vector[] }).vectors;
  const outcome = parseLens(vectors[0]?.input);
  if (outcome.status !== 'ok') throw new Error(`vecteur partagé illisible : ${outcome.status}`);
  return outcome.lens;
};

const FRAME = { width: 1280, height: 720 };
const FACE = { x: 520, y: 160, width: 240, height: 312 };

const lensOf = (layers: readonly LensLayer[], fallbacks?: Lens['fallbacks']): Lens => ({ ...sharedLens(), layers, triggers: [], ...(fallbacks === undefined ? {} : { fallbacks }) });

const plan = (lens: Lens, options: { readonly face?: typeof FACE; readonly languages?: readonly string[]; readonly level?: LensLevel; readonly t?: number } = {}): readonly LensDrawOp[] =>
  planLens({ lens, frame: FRAME, face: options.face ?? FACE, languages: options.languages ?? ['fr'], level: options.level ?? 'full', t: options.t ?? 0 });

const ofKind = <K extends LensDrawOp['kind']>(ops: readonly LensDrawOp[], kind: K): readonly Extract<LensDrawOp, { readonly kind: K }>[] =>
  ops.filter((op): op is Extract<LensDrawOp, { readonly kind: K }> => op.kind === kind);

describe('les points du visage, sur la boîte', () => {
  test('le bout du nez est au centre de la boîte, aux trois cinquièmes de sa hauteur', () => {
    expect(facePointOf('nose-tip', FACE)).toEqual({ x: 640, y: 160 + 0.6 * 312 });
  });

  test('l’œil GAUCHE de la personne est à DROITE de l’image envoyée (jamais en miroir)', () => {
    expect(facePointOf('left-eye', FACE).x).toBeGreaterThan(640);
    expect(facePointOf('right-eye', FACE).x).toBeLessThan(640);
  });

  test('une ancre d’écran est en fractions de l’image, une ancre de visage décalée en largeurs de visage', () => {
    expect(anchorPointOf({ type: 'screen', x: 0.5, y: 0.9 }, FRAME, FACE)).toEqual({ x: 640, y: 648 });
    expect(anchorPointOf({ type: 'face', point: 'nose-tip', dx: 0.5, dy: -0.25 }, FRAME, FACE)).toEqual({ x: 640 + 120, y: 160 + 0.6 * 312 - 60 });
  });

  test('l’unité de taille : la largeur du visage, sinon le petit côté de l’image', () => {
    expect(anchorScaleOf({ type: 'face', point: 'mouth' }, FRAME, FACE)).toBe(240);
    expect(anchorScaleOf({ type: 'screen', x: 0, y: 0 }, FRAME, FACE)).toBe(720);
  });
});

describe('planLens — la lens du vecteur partagé', () => {
  test('la LUT passe en premier, puis les couches dans leur ordre', () => {
    expect(plan(sharedLens()).map((op) => op.kind)).toEqual(['lut', 'frame', 'sticker', 'sticker', 'text', 'particles']);
  });

  test('le golden : le plan à 1280 × 720, visage au centre, à t = 1 000 ms', () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as unknown;
    expect(JSON.parse(JSON.stringify(plan(sharedLens(), { t: 1000 })))).toEqual(golden);
  });

  test('un sticker ancré au visage SUIT la boîte ; un sticker d’écran ne bouge pas', () => {
    const moved = { ...FACE, x: FACE.x + 100, y: FACE.y + 40 };
    const [crownA, starA] = ofKind(plan(sharedLens()), 'sticker');
    const [crownB, starB] = ofKind(plan(sharedLens(), { face: moved }), 'sticker');
    expect((crownB?.x ?? 0) - (crownA?.x ?? 0)).toBeCloseTo(100);
    expect((crownB?.y ?? 0) - (crownA?.y ?? 0)).toBeCloseTo(40);
    expect(starB).toEqual(starA);
  });

  test('un visage plus grand agrandit le sticker qui lui est ancré', () => {
    const near = { ...FACE, width: FACE.width * 2 };
    const [crown] = ofKind(plan(sharedLens(), { face: near }), 'sticker');
    expect(crown?.size).toBeCloseTo(0.6 * 480);
  });
});

describe('planLens — le Prisme du texte', () => {
  const caption = (languages: readonly string[]) => ofKind(plan(sharedLens(), { languages }), 'text')[0];

  test('la première langue du lecteur que la couche porte', () => {
    expect(caption(['de', 'en'])).toMatchObject({ text: 'Happy new year', language: 'en' });
    expect(caption(['es'])).toMatchObject({ text: 'Feliz año', language: 'es' });
  });

  test('aucune langue servie : le français, langue obligatoire du contrat', () => {
    expect(caption(['ar', 'de'])).toMatchObject({ text: 'Bonne année', language: 'fr' });
    expect(caption([])).toMatchObject({ text: 'Bonne année', language: 'fr' });
  });

  test('la police est celle de la couche, à sa taille en hauteur d’image', () => {
    expect(caption(['fr'])?.font).toBe('50px "Fraunces"');
  });
});

describe('planLens — la dégradation', () => {
  test('« reduced » masque ce que la lens nomme dans fallbacks.reduced', () => {
    const ids = plan(sharedLens(), { level: 'reduced' }).map((op) => op.id);
    expect(ids).not.toContain('neige');
    expect(ids).toContain('couronne');
  });

  test('« minimal » masque aussi fallbacks.minimal', () => {
    const ids = plan(sharedLens(), { level: 'minimal' }).map((op) => op.id);
    expect(ids).not.toContain('neige');
    expect(ids).not.toContain('couronne');
    expect(ids).toContain('grade');
  });

  test('sans repli déclaré, « reduced » divise les particules par deux et « minimal » les retire', () => {
    const snow: LensLayer = { kind: 'particles', id: 'flocons', preset: 'snow', density: 'mid' };
    const count = (level: LensLevel) => ofKind(plan(lensOf([snow]), { level }), 'particles')[0]?.dots.length ?? 0;
    expect(count('full')).toBe(24);
    expect(count('reduced')).toBe(12);
    expect(count('minimal')).toBe(0);
  });
});

describe('planLens — les particules sont déterministes', () => {
  const hearts: LensLayer = { kind: 'particles', id: 'coeurs', preset: 'hearts', density: 'low', anchor: { type: 'face', point: 'top-of-head' } };
  const dots = (t: number) => ofKind(plan(lensOf([hearts]), { t }), 'particles')[0]?.dots ?? [];

  test('le même instant donne le même dessin, un autre instant un autre', () => {
    expect(dots(1234)).toEqual(dots(1234));
    expect(dots(1234)).not.toEqual(dots(2234));
  });

  test('ancrées au visage, elles restent dans le champ autour du point', () => {
    const head = facePointOf('top-of-head', FACE);
    dots(500).forEach((dot) => {
      expect(Math.abs(dot.x - head.x)).toBeLessThanOrEqual(FACE.width * 0.6 + 0.01);
      expect(Math.abs(dot.y - head.y)).toBeLessThanOrEqual(FACE.width * 0.6 + 0.01);
      expect(dot.alpha).toBeGreaterThanOrEqual(0);
      expect(dot.alpha).toBeLessThanOrEqual(1);
    });
  });
});

describe('lensLutOf — la LUT que l’étage GPU joue', () => {
  test('la couche LUT de la lens, à son intensité', () => {
    expect(lensLutOf(sharedLens(), 'full')).toEqual({ kind: 'lut', id: 'grade', asset: 'aaaaaaaaaaaaaaaa.png', intensity: 0.8 });
  });

  test('une LUT que la lens masque à ce palier n’est pas jouée', () => {
    const lut: LensLayer = { kind: 'lut', id: 'teinte', asset: 'aaaaaaaaaaaaaaaa.png' };
    expect(lensLutOf(lensOf([lut], { reduced: { hide: ['teinte'] } }), 'reduced')).toBeNull();
    expect(lensLutOf(lensOf([lut], { reduced: { hide: ['teinte'] } }), 'full')).toMatchObject({ intensity: 1 });
  });
});
