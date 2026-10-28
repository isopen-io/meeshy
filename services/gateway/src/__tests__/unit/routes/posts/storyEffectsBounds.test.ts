/**
 * #13586 — le chemin d'écriture v3 NON strict et les champs `passthrough` de la forme v1 portent les mêmes
 * plafonds que la forme v1 : une story publiée ne peut imposer ni durée sans borne, ni objets sans nombre,
 * ni keyframe à ±1e308 aux lecteurs. Le refus est celui du schéma v1 (`CreatePostSchema` ⇒ 400 VALIDATION_ERROR).
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CreatePostSchema, StoryEffectsSchema, UpdatePostSchema } from '../../../../routes/posts/types';

const sceneObject = (kind: string, index: number, overrides: Record<string, unknown> = {}) => ({
  id: `${kind}-${index}`,
  kind,
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'content',
  z: index,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: kind === 'text' ? { text: 'bonjour' } : {},
  ...overrides,
});

const canvas = (objects: unknown[], scene: Record<string, unknown> = {}) => ({
  v: 3,
  scenes: [{ id: 's1', objects, ...scene }],
});

const accepted = (effects: unknown) => StoryEffectsSchema.safeParse(effects).success;

describe('timelineDuration — borné comme slideDuration', () => {
  it.each([1e308, 86401, -1, Number.POSITIVE_INFINITY])('refuse %s', (timelineDuration) => {
    expect(accepted({ timelineDuration })).toBe(false);
  });

  it.each([0, 2, 45.5, 600, 86400])('accepte %s', (timelineDuration) => {
    expect(accepted({ timelineDuration })).toBe(true);
  });

  it('accepte une durée absente ou nulle (un client qui sérialise null)', () => {
    expect(accepted({})).toBe(true);
    expect(accepted({ timelineDuration: null })).toBe(true);
  });

  it('refuse la durée d\'une scène v3 démesurée', () => {
    expect(accepted(canvas([], { timelineDuration: 1e308 }))).toBe(false);
    expect(accepted(canvas([], { timelineDuration: 12 }))).toBe(true);
  });

  it('le refus passe par le schéma de création de post, comme la forme v1', () => {
    const result = CreatePostSchema.safeParse({ type: 'STORY', storyEffects: { timelineDuration: 1e308 } });
    expect(result.success).toBe(false);
  });
});

describe('document v3 non strict — ce que les composeurs en production publient reste accepté', () => {
  it('accepte 40 stickers dans une scène : le composeur iOS ne plafonne pas les stickers (addSticker)', () => {
    const objects = Array.from({ length: 40 }, (_, i) => sceneObject('sticker', i));
    expect(accepted(canvas(objects))).toBe(true);
  });

  it('accepte une scène iOS chargée : fond, 5 textes, 10 médias, 50 stickers, dessin (66 objets)', () => {
    const objects = [
      sceneObject('media', 0, { id: 'bg', plane: 'bg' }),
      ...Array.from({ length: 5 }, (_, i) => sceneObject('text', i)),
      ...Array.from({ length: 10 }, (_, i) => sceneObject('media', i + 1)),
      ...Array.from({ length: 50 }, (_, i) => sceneObject('sticker', i)),
      sceneObject('drawing', 0),
    ];
    expect(accepted(canvas(objects))).toBe(true);
  });

  it('accepte un texte de 2500 caractères : ni iOS ni le web ne bornent la longueur d\'un texte de scène', () => {
    expect(accepted(canvas([sceneObject('text', 0, { payload: { text: 'a'.repeat(2500) } })]))).toBe(true);
  });

  it('accepte une traduction SERVEUR plus longue que l\'original (1900 → 2600), que le client renvoie à l\'édition', () => {
    const text = sceneObject('text', 0, { payload: { text: 'a'.repeat(1900), translations: { fr: 'b'.repeat(2600) } } });
    expect(UpdatePostSchema.safeParse({ storyEffects: canvas([text]) }).success).toBe(true);
    expect(CreatePostSchema.safeParse({ type: 'STORY', storyEffects: canvas([text]) }).success).toBe(true);
  });

  it('refuse plus de 10 scènes (plafond des trois composeurs)', () => {
    const scenes = Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, objects: [] }));
    expect(accepted({ v: 3, scenes })).toBe(false);
    expect(accepted({ v: 3, scenes: scenes.slice(0, 10) })).toBe(true);
  });

  it('accepte 32 objets d\'une famille et laisse voyager les clés inconnues', () => {
    const exact = sceneObject('text', 0, { payload: { text: 'a'.repeat(2000), futur: { a: 1 } }, extra: 'x' });
    const result = StoryEffectsSchema.safeParse(canvas([exact]));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(canvas([exact]));
  });

  it('le refus d\'une valeur hostile passe par le schéma de création ET d\'édition', () => {
    const hostile = canvas([], { timelineDuration: 1e308 });
    expect(CreatePostSchema.safeParse({ type: 'STORY', storyEffects: hostile }).success).toBe(false);
    expect(UpdatePostSchema.safeParse({ storyEffects: hostile }).success).toBe(false);
  });
});

describe('keyframes — nombres finis et bornés', () => {
  const frame = (overrides: Record<string, unknown> = {}) => ({ time: 1, x: 0.5, y: 0.5, scale: 1, opacity: 1, ...overrides });
  const withTiming = (keyframes: unknown[]) => canvas([sceneObject('media', 0, { timing: { start: 0, end: 5, keyframes } })]);

  it.each([
    { time: 1e308 }, { x: 1e308 }, { y: -1e308 }, { scale: 1e308 }, { opacity: 5 }, { volume: 9 }, { time: -1 },
  ])('refuse la keyframe %j d\'un objet v3', (hostile) => {
    expect(accepted(withTiming([frame(hostile)]))).toBe(false);
  });

  it('accepte des keyframes légitimes (dont optionnelles)', () => {
    expect(accepted(withTiming([frame(), { time: 2 }, frame({ easing: 'easeIn' })]))).toBe(true);
  });

  it('accepte 80 keyframes sur un clip : AddKeyframeCommand (iOS) ne plafonne pas leur nombre', () => {
    expect(accepted(withTiming(Array.from({ length: 80 }, (_, i) => frame({ time: i * 0.1 }))))).toBe(true);
    expect(accepted({ stickerObjects: [{ id: 'o1', keyframes: Array.from({ length: 80 }, (_, i) => frame({ time: i * 0.1 })) }] })).toBe(true);
  });

  it('accepte les nulls explicites d\'un encodeur et la volumétrie iOS (gain 2, échelle 4)', () => {
    expect(accepted(withTiming([frame({ x: null, y: null, scale: 4, volume: 2 })]))).toBe(true);
  });

  it.each(['mediaObjects', 'textObjects', 'stickerObjects'])('borne les keyframes de %s (forme v1)', (family) => {
    expect(accepted({ [family]: [{ id: 'o1', keyframes: [frame({ x: 1e308 })] }] })).toBe(false);
    expect(accepted({ [family]: [{ id: 'o1', keyframes: [frame()] }] })).toBe(true);
    expect(accepted({ [family]: [{ id: 'o1' }] })).toBe(true);
  });
});

describe('rétrocompatibilité — les documents que les composeurs produisent restent acceptés', () => {
  const fixturesDir = join(__dirname, '../../../../../../../packages/shared/fixtures/canvas-v3');
  const fixtures = readdirSync(fixturesDir).filter((name) => name.endsWith('.json'));

  it('trouve les fixtures du contrat', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures)('%s passe la validation d\'écriture non stricte', (name) => {
    const blob = JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as unknown;
    const result = StoryEffectsSchema.safeParse(blob);
    expect(result.success).toBe(true);
  });
});
