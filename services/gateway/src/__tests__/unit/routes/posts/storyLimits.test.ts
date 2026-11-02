/**
 * #13590 — plafonds LARGES d'une story (décision porteur 2026-10-28) : 50 stickers / images / textes / audios /
 * vidéos posés par scène, 2 h au total, 1000 caractères par texte À LA CRÉATION seulement. Le refus reste
 * 400 VALIDATION_ERROR et nomme la borne (`STORY_LIMIT_*`).
 */
import { CreatePostSchema, StoryEffectsSchema, UpdatePostSchema } from '../../../../routes/posts/types';
import { inBatches } from '../../../../services/posts/inBatches';
import { storyLimitFromIssues } from '../../../../routes/posts/storyLimits';

const obj = (kind: string, i: number, payload: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id: `${kind}-${i}`, kind, anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'content', z: i,
  transform: { scale: 1, rotation: 0, opacity: 1 }, payload, ...extra,
});
const many = (n: number, make: (i: number) => unknown) => Array.from({ length: n }, (_, i) => make(i));
const canvas = (objects: unknown[], scene: Record<string, unknown> = {}) => ({ v: 3, scenes: [{ id: 's1', objects, ...scene }] });
const limitOf = (effects: unknown, schema: typeof StoryEffectsSchema = StoryEffectsSchema) => {
  const r = schema.safeParse(effects);
  return r.success ? null : storyLimitFromIssues(r.error.issues);
};

describe('nombre d\'objets par famille et par scène', () => {
  const families: Array<[string, string, (i: number) => unknown]> = [
    ['STORY_LIMIT_STICKERS', 'sticker', (i) => obj('sticker', i)],
    ['STORY_LIMIT_TEXTS', 'text', (i) => obj('text', i, { text: 'a' })],
    ['STORY_LIMIT_AUDIOS', 'audio', (i) => obj('audio', i)],
    ['STORY_LIMIT_IMAGES', 'image', (i) => obj('media', i, { mediaType: 'image' })],
    ['STORY_LIMIT_VIDEOS', 'video', (i) => obj('media', i, { mediaType: 'video' })],
  ];

  it.each(families)('v3 : 50 %s acceptés, 51 refusés sous %s', (code, _name, make) => {
    expect(limitOf(canvas(many(50, make)))).toBeNull();
    expect(limitOf(canvas(many(51, make)))).toEqual({ code, max: 50 });
  });

  it('v3 : les plafonds sont par scène, pas par story', () => {
    const scene = (id: string) => ({ id, objects: many(50, (i) => obj('sticker', i)) });
    expect(limitOf({ v: 3, scenes: [scene('a'), scene('b')] })).toBeNull();
  });

  it('v3 : un fond (plane bg) ne compte pas comme image posée', () => {
    const bg = [obj('media', 0, { mediaType: 'image' }, { plane: 'bg' })];
    expect(limitOf(canvas([...bg, ...many(50, (i) => obj('media', 10 + i, { mediaType: 'image' }))]))).toBeNull();
  });

  it('v1 : 50 stickers acceptés (l\'ancien plafond de 32 disparaît), 51 refusés', () => {
    expect(limitOf({ stickerObjects: many(50, (i) => ({ id: `s${i}`, emoji: '😀' })) })).toBeNull();
    expect(limitOf({ stickerObjects: many(51, (i) => ({ id: `s${i}`, emoji: '😀' })) })).toEqual({ code: 'STORY_LIMIT_STICKERS', max: 50 });
  });

  it('v1 : images et vidéos se comptent séparément dans mediaObjects, le fond exclu', () => {
    const images = many(50, (i) => ({ id: `i${i}`, mediaType: 'image' }));
    const videos = many(50, (i) => ({ id: `v${i}`, mediaType: 'video' }));
    expect(limitOf({ mediaObjects: [...images, ...videos, { id: 'bg', mediaType: 'image', isBackground: true }] })).toBeNull();
    expect(limitOf({ mediaObjects: [...images, { id: 'x', mediaType: 'image' }] })).toEqual({ code: 'STORY_LIMIT_IMAGES', max: 50 });
    expect(limitOf({ mediaObjects: [...videos, { id: 'x', mediaType: 'video' }] })).toEqual({ code: 'STORY_LIMIT_VIDEOS', max: 50 });
  });

  it('v1 : textes et audios', () => {
    expect(limitOf({ textObjects: many(51, (i) => ({ id: `t${i}`, text: 'a' })) })).toEqual({ code: 'STORY_LIMIT_TEXTS', max: 50 });
    expect(limitOf({ audioPlayerObjects: many(51, (i) => ({ id: `a${i}` })) })).toEqual({ code: 'STORY_LIMIT_AUDIOS', max: 50 });
  });
});

describe('durée totale ≤ 2 h', () => {
  it('refuse une durée de slide ou de timeline au-dessus de 7200 s', () => {
    expect(limitOf({ slideDuration: 7200 })).toBeNull();
    expect(limitOf({ slideDuration: 7201 })).toEqual({ code: 'STORY_LIMIT_DURATION', max: 7200 });
    expect(limitOf({ timelineDuration: 7201 })).toEqual({ code: 'STORY_LIMIT_DURATION', max: 7200 });
  });

  it('additionne les scènes : 10 × 720 s passent, 10 × 721 s non', () => {
    const scenes = (d: number) => ({ v: 3, scenes: many(10, (i) => ({ id: `s${i}`, objects: [], timelineDuration: d })) });
    expect(limitOf(scenes(720))).toBeNull();
    expect(limitOf(scenes(721))).toEqual({ code: 'STORY_LIMIT_DURATION', max: 7200 });
  });
});

describe('1000 caractères : création seulement', () => {
  const longText = (n: number) => canvas([obj('text', 0, { text: 'a'.repeat(n) })]);

  it('la création refuse un texte de 1001 caractères (v3 et v1) et accepte 1000', () => {
    const create = (storyEffects: unknown) => CreatePostSchema.safeParse({ type: 'STORY', storyEffects });
    expect(create(longText(1000)).success).toBe(true);
    const refused = create(longText(1001));
    expect(refused.success).toBe(false);
    if (!refused.success) expect(storyLimitFromIssues(refused.error.issues)).toEqual({ code: 'STORY_LIMIT_TEXT_LENGTH', max: 1000 });
    expect(create({ textObjects: [{ id: 't', text: 'a'.repeat(1001) }] }).success).toBe(false);
  });

  it('la mise à jour d\'un contenu stocké de 1800 caractères reste acceptée', () => {
    expect(UpdatePostSchema.safeParse({ storyEffects: longText(1800) }).success).toBe(true);
    expect(UpdatePostSchema.safeParse({ storyEffects: { textObjects: [{ id: 't', text: 'a'.repeat(1800) }] } }).success).toBe(true);
  });

  it('une traduction écrite par le serveur n\'est bornée par aucun plafond de caractères', () => {
    const translated = canvas([obj('text', 0, { text: 'a'.repeat(900), translations: { fr: 'b'.repeat(3000) } })]);
    expect(CreatePostSchema.safeParse({ type: 'STORY', storyEffects: translated }).success).toBe(true);
    const v1 = { textObjects: [{ id: 't', text: 'a', translations: { fr: 'b'.repeat(3000) } }] };
    expect(UpdatePostSchema.safeParse({ storyEffects: v1 }).success).toBe(true);
  });
});

describe('le format d\'erreur ne change pas', () => {
  it('un refus sans borne nommée ne rend aucune limite', () => {
    const r = StoryEffectsSchema.safeParse({ slideDuration: -1 });
    expect(r.success).toBe(false);
    if (!r.success) expect(storyLimitFromIssues(r.error.issues)).toBeNull();
  });
});

describe('audit #13590 — ce que les composeurs écrivent vraiment', () => {
  it('v3 : le fond tel qu\'iOS l\'écrit (plane content + payload.isBackground) ne compte pas comme image posée', () => {
    const iosBackground = obj('media', 99, { mediaType: 'image', isBackground: true });
    expect(limitOf(canvas([iosBackground, ...many(50, (i) => obj('media', i, { mediaType: 'image' }))]))).toBeNull();
  });

  it('un son de fond ne compte pas comme son posé (v3 payload.isBackground, v1 audioPlayerObjects.isBackground)', () => {
    const v3Bg = obj('audio', 99, { isBackground: true });
    expect(limitOf(canvas([v3Bg, ...many(50, (i) => obj('audio', i))]))).toBeNull();
    const v1 = [{ id: 'bg', isBackground: true }, ...many(50, (i) => ({ id: `a${i}` }))];
    expect(limitOf({ audioPlayerObjects: v1 })).toBeNull();
  });

  it('1000 caractères se comptent comme l\'auteur les voit : 1000 emojis composés passent', () => {
    const family = '👨‍👩‍👧‍👦';
    const create = (text: string) => CreatePostSchema.safeParse({ type: 'STORY', storyEffects: canvas([obj('text', 0, { text })]) });
    expect(create(family.repeat(1000)).success).toBe(true);
    expect(create(family.repeat(1001)).success).toBe(false);
  });

  it('une republication recopie le texte stocké de sa source : elle n\'est pas refusée pour sa longueur', () => {
    const storedText = canvas([obj('text', 0, { text: 'a'.repeat(1800) })]);
    expect(CreatePostSchema.safeParse({ type: 'STORY', repostOfId: 'aaaaaaaaaaaaaaaaaaaaaaaa', storyEffects: storedText }).success).toBe(true);
    const r = CreatePostSchema.safeParse({ type: 'STORY', storyEffects: storedText });
    expect(r.success).toBe(false);
    if (!r.success) expect(storyLimitFromIssues(r.error.issues)).toEqual({ code: 'STORY_LIMIT_TEXT_LENGTH', max: 1000 });
  });
});

describe('audit #13590 — le drapeau de fond, posé par le client, n\'ouvre aucun contournement', () => {
  it('v3 : un fond de couleur (plane bg) + le fond image d\'iOS + 50 images posées passent', () => {
    const colour = obj('media', 98, { background: '#000000' }, { plane: 'bg' });
    const iosBackground = obj('media', 99, { mediaType: 'image', isBackground: true });
    expect(limitOf(canvas([colour, iosBackground, ...many(50, (i) => obj('media', i, { mediaType: 'image' }))]))).toBeNull();
  });

  it('v3 : 60 médias marqués isBackground dans une scène sont refusés', () => {
    expect(limitOf(canvas(many(60, (i) => obj('media', i, { mediaType: 'image', isBackground: true }))))).toEqual({ code: 'STORY_LIMIT_IMAGES', max: 50 });
  });

  it('v3 : 60 médias en plane bg dans une scène sont refusés', () => {
    expect(limitOf(canvas(many(60, (i) => obj('media', i, { mediaType: 'video' }, { plane: 'bg' }))))).toEqual({ code: 'STORY_LIMIT_VIDEOS', max: 50 });
  });

  it('v3 : 60 sons marqués isBackground sont refusés', () => {
    expect(limitOf(canvas(many(60, (i) => obj('audio', i, { isBackground: true }))))).toEqual({ code: 'STORY_LIMIT_AUDIOS', max: 50 });
  });

  it('v3 : le drapeau de fond ne dispense pas un sticker ni un texte', () => {
    expect(limitOf(canvas(many(51, (i) => obj('sticker', i, { isBackground: true }))))).toEqual({ code: 'STORY_LIMIT_STICKERS', max: 50 });
    expect(limitOf(canvas(many(51, (i) => obj('text', i, { text: 'a', isBackground: true }))))).toEqual({ code: 'STORY_LIMIT_TEXTS', max: 50 });
  });

  it('v1 : un seul fond et un seul son de fond exemptés, les suivants comptent', () => {
    expect(limitOf({ mediaObjects: many(60, (i) => ({ id: `m${i}`, mediaType: 'image', isBackground: true })) })).toEqual({ code: 'STORY_LIMIT_IMAGES', max: 50 });
    expect(limitOf({ audioPlayerObjects: many(60, (i) => ({ id: `a${i}`, isBackground: true })) })).toEqual({ code: 'STORY_LIMIT_AUDIOS', max: 50 });
  });
});

describe('mediaIds d\'un post : 200 pour une STORY, dix pour le reste', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => i.toString(16).padStart(24, '0'));
  const create = (type: string, n: number) => {
    const r = CreatePostSchema.safeParse({ type, mediaIds: ids(n) });
    return r.success ? null : (storyLimitFromIssues(r.error.issues) ?? 'refused');
  };

  it('une story accepte 6 images + 5 sons (11 médias) et jusqu\'à 200', () => {
    expect(create('STORY', 11)).toBeNull();
    expect(create('STORY', 200)).toBeNull();
  });

  it('une story à 201 médias nomme STORY_LIMIT_MEDIA', () => {
    expect(create('STORY', 201)).toEqual({ code: 'STORY_LIMIT_MEDIA', max: 200 });
  });

  it.each(['POST', 'REEL', 'STATUS'])('un %s garde dix médias', (type) => {
    expect(create(type, 10)).toBeNull();
    expect(create(type, 11)).toBe('refused');
  });

  it('l\'édition accepte 200 médias au schéma et nomme STORY_LIMIT_MEDIA au-delà', () => {
    expect(UpdatePostSchema.safeParse({ mediaIds: ids(200) }).success).toBe(true);
    const r = UpdatePostSchema.safeParse({ mediaIds: ids(201) });
    expect(r.success ? null : storyLimitFromIssues(r.error.issues)).toEqual({ code: 'STORY_LIMIT_MEDIA', max: 200 });
  });

  it('inBatches borne la concurrence à dix écritures simultanées', async () => {
    let running = 0;
    let peak = 0;
    const task = async () => { running += 1; peak = Math.max(peak, running); await Promise.resolve(); running -= 1; };
    await inBatches(Array.from({ length: 200 }, () => task));
    expect(peak).toBe(10);
  });
});
