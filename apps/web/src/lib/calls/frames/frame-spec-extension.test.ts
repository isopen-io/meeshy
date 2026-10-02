import { describe, expect, test } from 'bun:test';

import { captureFrames, RAW_MOOD_FILES } from './frame-catalogue';
import { expandMotif } from './frame-filter';
import { paintFrame } from './frame-paint';
import { medallionRect, polaroidWindow, tornPoints } from './frame-paint-shapes';
import { drewBrandDashes, recorder, written } from './frame-recorder.test-support';
import { titleText } from './frame-text';
import { FrameMoodFileSchema, FrameMotifSchema, TEXT_FORMS_BY_SOURCE, servedSurfaces, type FrameMotif } from './frame-spec';

/**
 * **L'EXTENSION DU FORMAT DES CADRES** (#9197, doc 06 § 3, étape 3.1) — toutes les
 * clés ajoutées sont FACULTATIVES : un cadre qui ne les porte pas se lit et se rend
 * comme avant ; un cadre qui les porte ne sort jamais du vocabulaire fermé.
 */

const base = (): Record<string, unknown> => ({
  layout: { arrangement: 'grid', margin: 0.07, gap: 0.03, top: 0.2, bottom: 0.14 },
  slot: { shape: 'arch', tilt: 'none', tone: 'warm' },
  background: { kind: 'radial', colors: ['#1F1A12', '#0B0B0F'] },
  ornaments: [{ kind: 'bokeh', color: '#C9A45C55', density: 'mid', layer: 'back' }],
  brand: { mark: 'both', place: 'watermark', color: '#C9A45C', size: 'm' },
  names: { show: 'name', style: 'caption', font: 'elegant', color: '#F3E3B5' },
  title: { source: 'group', font: 'calligraphy', color: '#F3E3B5', place: 'top', size: 'l', effect: 'glow' },
});

const motif = (overrides: Record<string, unknown> = {}, look: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'elegant.gala',
  mood: 'elegant',
  name: 'Gala',
  base: { ...base(), ...look },
  variants: { duo: {} },
  ...overrides,
});

const parses = (value: unknown): boolean => FrameMotifSchema.safeParse(value).success;

/** L'exemple du doc 06 § 3, tel quel. */
const GALA = {
  id: 'elegant.gala',
  mood: 'elegant',
  name: 'Gala',
  credits: { author: 'Meeshy', createdAt: '2026-09-29' },
  surfaces: ['capture', 'live'],
  cost: 'standard',
  base: {
    layout: { arrangement: 'grid', margin: 0.07, gap: 0.03, top: 0.2, bottom: 0.14 },
    slot: { shape: 'arch', stroke: { color: '#C9A45C', width: 0.006 }, double: true, tilt: 'none', tone: 'warm', look: [{ id: 'vignette', amount: 0.25 }] },
    background: { kind: 'radial', colors: ['#1F1A12', '#0B0B0F'] },
    border: { kind: 'deco', color: '#C9A45C', width: 0.006, inset: 0.03 },
    ornaments: [
      { kind: 'bokeh', color: '#C9A45C55', density: 'mid', layer: 'back' },
      { kind: 'sparkles', color: '#F3E3B5', density: 'low', layer: 'front', motion: 'loop' },
    ],
    brand: { mark: 'both', place: 'watermark', color: '#C9A45C', size: 'm', font: 'elegant', watermark: { content: 'brand-handle', orientation: 'diagonal-down', opacity: 0.05 } },
    names: { show: 'name', style: 'caption', font: 'elegant', color: '#F3E3B5' },
    title: { source: 'group', font: 'calligraphy', color: '#F3E3B5', place: 'top', size: 'l', effect: 'glow' },
    subtitle: { source: 'datetime', form: 'inline', font: 'elegant', color: '#C9A45C', place: 'top', size: 's', case: 'upper' },
    elements: [{ source: 'place', form: 'city', place: 'bottom-left', font: 'elegant', color: '#C9A45C', size: 's' }],
  },
  variants: { duo: { title: { source: 'names', font: 'calligraphy', color: '#F3E3B5', place: 'top', size: 'l', effect: 'glow' } } },
};

describe('l’extension du format des cadres', () => {
  test('les douze fichiers actuels se lisent sans changement', () => {
    expect(RAW_MOOD_FILES.filter((file) => !FrameMoodFileSchema.safeParse(file).success)).toEqual([]);
  });

  test('l’exemple du doc 06 se lit au schéma', () => {
    const parsed = FrameMotifSchema.safeParse(GALA);
    expect(parsed.success ? null : parsed.error.message).toBeNull();
  });

  test('un cadre sans les nouvelles clés est proposé en capture seulement', () => {
    const frame = captureFrames()[0];
    expect(frame === undefined ? null : servedSurfaces(frame)).toEqual(['capture']);
  });

  test('les clés du motif voyagent jusqu’au cadre déplié', () => {
    const [frame] = expandMotif(FrameMotifSchema.parse(GALA) as FrameMotif);
    expect(frame?.credits).toEqual({ author: 'Meeshy', createdAt: '2026-09-29' });
    expect(frame === undefined ? null : servedSurfaces(frame)).toEqual(['capture', 'live']);
    expect(frame?.cost).toBe('standard');
    expect(frame?.elements?.[0]?.form).toBe('city');
    expect(frame?.title.source).toBe('names');
  });

  test('la signature devient facultative', () => {
    const look = base();
    delete look.brand;
    expect(parses({ ...motif(), base: look })).toBe(true);
  });

  test('les trois nouvelles formes de case', () => {
    ['torn', 'polaroid', 'frame-oval'].forEach((shape) => expect(parses(motif({}, { slot: { shape, tilt: 'none', tone: 'color' } }))).toBe(true));
  });

  test('deux looks au plus, pris dans la bibliothèque Meeshy', () => {
    const slot = (look: unknown): Record<string, unknown> => ({ slot: { shape: 'rect', tilt: 'none', tone: 'color', look } });
    expect(parses(motif({}, slot([{ id: 'oil-paint', size: 0.5 }, { id: 'vignette', amount: 0.3 }])))).toBe(true);
    expect(parses(motif({}, slot([{ id: 'vignette' }, { id: 'bloom' }, { id: 'halftone' }])))).toBe(false);
    expect(parses(motif({}, slot([{ id: 'shader-maison' }])))).toBe(false);
  });

  test('le mouvement d’un ornement', () => {
    const ornament = (motion: string): Record<string, unknown> => ({ ornaments: [{ kind: 'petals', color: '#fff', density: 'low', layer: 'front', motion }] });
    expect(['still', 'loop', 'onAppear'].map((motion) => parses(motif({}, ornament(motion))))).toEqual([true, true, true]);
    expect(parses(motif({}, ornament('bounce')))).toBe(false);
  });

  test('une forme n’est admise que pour SA source', () => {
    const subtitle = (source: string, form: string): Record<string, unknown> => ({ subtitle: { source, form, font: 'elegant', color: '#fff', place: 'top', size: 's' } });
    Object.entries(TEXT_FORMS_BY_SOURCE).forEach(([source, forms]) => forms.forEach((form) => expect(parses(motif({}, subtitle(source, form)))).toBe(true)));
    expect(parses(motif({}, subtitle('time', 'city')))).toBe(false);
    expect(parses(motif({}, subtitle('group', 'digital')))).toBe(false);
  });

  test('six éléments au plus', () => {
    const element = { source: 'time', form: 'digital', place: 'top-right', font: 'elegant', color: '#fff', size: 's' };
    expect(parses(motif({}, { elements: Array.from({ length: 6 }, () => element) }))).toBe(true);
    expect(parses(motif({}, { elements: Array.from({ length: 7 }, () => element) }))).toBe(false);
  });

  test('le filigrane : orientations fermées, opacité plafonnée à 8 %, réservé au placement filigrane', () => {
    const brand = (place: string, watermark: unknown): Record<string, unknown> => ({ brand: { mark: 'wordmark', place, color: '#fff', size: 's', watermark } });
    ['diagonal-up', 'diagonal-down', 'horizontal', 'vertical', 'cross'].forEach((orientation) =>
      expect(parses(motif({}, brand('watermark', { content: 'brand', orientation, opacity: 0.08 })))).toBe(true),
    );
    expect(parses(motif({}, brand('watermark', { content: 'brand', orientation: 'horizontal', opacity: 0.09 })))).toBe(false);
    expect(parses(motif({}, brand('watermark', { content: 'logo', orientation: 'horizontal', opacity: 0.05 })))).toBe(false);
    expect(parses(motif({}, brand('bottom', { content: 'brand', orientation: 'horizontal', opacity: 0.05 })))).toBe(false);
  });

  test('crédits, surfaces et coût', () => {
    expect(parses(motif({ credits: { author: 'Meeshy', createdAt: '2026-09-29', updatedAt: '2026-10-02' } }))).toBe(true);
    expect(parses(motif({ credits: { author: '', createdAt: '2026-09-29' } }))).toBe(false);
    expect(parses(motif({ credits: { author: 'Meeshy', createdAt: '29/09/2026' } }))).toBe(false);
    expect(parses(motif({ surfaces: ['live'] }))).toBe(true);
    expect(parses(motif({ surfaces: [] }))).toBe(false);
    expect(parses(motif({ surfaces: ['live', 'live'] }))).toBe(false);
    expect(parses(motif({ cost: 'rich' }))).toBe(true);
    expect(parses(motif({ cost: 'extreme' }))).toBe(false);
  });

  test('une scène pointe vers les fichiers du pack, jamais ailleurs', () => {
    const scene = (layer: Record<string, unknown>): Record<string, unknown> => ({ scene: [{ id: 'flames', depth: 'front', ...layer }] });
    expect(parses(motif({}, scene({ kind: 'video-loop', src: 'assets/video/flames.mov' })))).toBe(true);
    expect(parses(motif({}, scene({ kind: 'particles', preset: 'sparkles', max: 60 })))).toBe(true);
    expect(parses(motif({}, scene({ kind: 'light', color: '#FF8A3D', amount: 0.35 })))).toBe(true);
    expect(parses(motif({}, scene({ kind: 'image', src: 'https://example.com/wall.png' })))).toBe(false);
    expect(parses(motif({}, scene({ kind: 'image', src: 'assets/../../secret.png' })))).toBe(false);
    expect(parses(motif({}, scene({ kind: 'lottie' })))).toBe(false);
    expect(parses(motif({}, scene({ kind: 'particles', preset: 'sparkles', max: 151 })))).toBe(false);
    expect(parses(motif({}, scene({ kind: 'light' })))).toBe(false);
  });

  test('les déclencheurs et leurs actions sont des listes fermées', () => {
    const behaviors = (behavior: Record<string, unknown>): Record<string, unknown> => ({ behaviors: [behavior] });
    expect(parses(motif({}, behaviors({ trigger: 'onTap', target: 'flames', action: 'burst', duration: 1.5 })))).toBe(true);
    expect(parses(motif({}, behaviors({ trigger: 'onEmotion', when: 'party', target: 'flames', action: 'tint', color: '#4FA3FF' })))).toBe(true);
    expect(parses(motif({}, behaviors({ trigger: 'onCallEvent', when: 'end', action: 'play', target: 'flames' })))).toBe(true);
    expect(parses(motif({}, behaviors({ trigger: 'onEmotion', when: 'evening', action: 'calm' })))).toBe(false);
    expect(parses(motif({}, behaviors({ trigger: 'onTap', when: 'party', action: 'burst' })))).toBe(false);
    expect(parses(motif({}, behaviors({ trigger: 'onBlink', action: 'burst' })))).toBe(false);
    expect(parses(motif({}, behaviors({ trigger: 'onTap', action: 'eval' })))).toBe(false);
  });

  test('les paliers de repli ne déclarent que leurs substitutions', () => {
    const fallbacks = { reduced: { still: [{ layer: 'flames', src: 'assets/sprites/flames-lite.json' }] }, minimal: { hide: ['flames'] } };
    expect(parses(motif({}, { fallbacks }))).toBe(true);
  });
});

describe('un cadre étendu se peint comme un cadre d’aujourd’hui', () => {
  const people = [
    { id: 'a', name: 'Awa', handle: 'awa', isSelf: true },
    { id: 'k', name: 'Karim', handle: 'karim', isSelf: false },
  ];
  const texts = { groupName: null, isGroup: false, date: '2 oct. 2026', accent: null };
  const faces = people.map(() => ({ source: {} as CanvasImageSource, size: { width: 1280, height: 720 } }));
  const paint = (raw: Record<string, unknown>) => {
    const [frame] = expandMotif(FrameMotifSchema.parse(raw) as FrameMotif);
    const { log, context } = recorder();
    if (frame !== undefined) paintFrame(context, frame, people, faces, texts, { width: 1080, height: 1920 });
    return log;
  };

  test('sans signature déclarée, aucune marque n’est tracée — et le reste se peint', () => {
    const look = { ...base(), title: { source: 'names', font: 'elegant', color: '#fff', place: 'top', size: 'm' } };
    delete look.brand;
    const log = paint({ ...motif(), base: look });
    expect(written(log).includes('meeshy')).toBe(false);
    expect(drewBrandDashes(log)).toBe(false);
    expect(written(log).some((text) => text.includes('Awa'))).toBe(true);
  });

  test('l’exemple du doc 06 se peint, signé', () => {
    const log = paint(GALA);
    expect(drewBrandDashes(log) || written(log).includes('meeshy')).toBe(true);
  });

  test('les trois nouvelles formes découpent une case', () => {
    ['torn', 'polaroid', 'frame-oval'].forEach((shape) => {
      const log = paint(motif({}, { slot: { shape, tilt: 'none', tone: 'color' } }));
      expect(log.filter((entry) => entry.key === 'clip').length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('les nouvelles sources de texte attendent leur moteur (étape 3.3)', () => {
  test('elles n’écrivent rien encore : un titre vide se tait, il ne ment pas', () => {
    const context = { people: [{ id: 'a', name: 'Awa', handle: 'awa', isSelf: true }], texts: { groupName: null, isGroup: false, date: '2 oct.', accent: null } };
    expect((['time', 'datetime', 'place', 'landmark', 'emotion'] as const).map((source) => titleText(source, context))).toEqual(['', '', '', '', '']);
  });
});

describe('les trois nouvelles formes de case se tracent DANS leur rectangle', () => {
  const rect = { x: 10, y: 20, width: 200, height: 300 };
  const inside = ([x, y]: readonly [number, number]): boolean => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

  test('torn : un bord rongé, déterministe pour une même case, différent d’une case à l’autre', () => {
    const points = tornPoints(rect, 3);
    expect(points.length).toBeGreaterThan(20);
    expect(points.every(inside)).toBe(true);
    expect(tornPoints(rect, 3)).toEqual(points);
    expect(tornPoints(rect, 4)).not.toEqual(points);
  });

  test('polaroid : une photo carrée, la marge du bas plus épaisse que les autres', () => {
    const photo = polaroidWindow(rect);
    expect(photo.width).toBeCloseTo(photo.height);
    const top = photo.y - rect.y;
    const bottom = rect.y + rect.height - (photo.y + photo.height);
    expect(bottom).toBeGreaterThan(top * 2);
    expect(photo.x - rect.x).toBeCloseTo(rect.x + rect.width - (photo.x + photo.width));
  });

  test('frame-oval : un médaillon de proportion 3:4, centré, qui ne déborde pas', () => {
    const medallion = medallionRect(rect);
    expect(medallion.width / medallion.height).toBeCloseTo(0.75);
    expect(medallion.width).toBeLessThanOrEqual(rect.width);
    expect(medallion.height).toBeLessThanOrEqual(rect.height);
    expect(medallion.x + medallion.width / 2).toBeCloseTo(rect.x + rect.width / 2);
  });
});
