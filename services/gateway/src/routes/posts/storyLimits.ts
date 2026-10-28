import { z } from 'zod';

/**
 * Les plafonds LARGES d'une story (décision porteur 2026-10-28, #13590) : assez hauts pour ne refuser aucun
 * contenu réaliste, assez bas pour qu'une scène reste lisible par les lecteurs.
 *
 * Le refus reste un 400 `VALIDATION_ERROR` ; la borne dépassée voyage à côté, à la racine de l'enveloppe
 * (`storyLimit` = l'un des `STORY_LIMIT_*` ci-dessous, `limit` = le maximum), pour que les clients l'expliquent.
 * Codes stables : STORY_LIMIT_STICKERS · _IMAGES · _TEXTS · _AUDIOS · _VIDEOS (par scène) · _DURATION (secondes,
 * durée totale de la story) · _TEXT_LENGTH (caractères, création seulement).
 *
 * Le plafond de texte ne s'applique qu'à la CRÉATION : une story déjà stockée reste modifiable, et les
 * traductions, écrites par le serveur, ne sont jamais bornées par lui.
 */
export const STORY_OBJECTS_PER_FAMILY_MAX = 50;
export const STORY_TOTAL_SECONDS_MAX = 7200;
export const STORY_TEXT_CREATE_MAX = 1000;

export type StoryLimitCode =
  | 'STORY_LIMIT_STICKERS' | 'STORY_LIMIT_IMAGES' | 'STORY_LIMIT_TEXTS' | 'STORY_LIMIT_AUDIOS'
  | 'STORY_LIMIT_VIDEOS' | 'STORY_LIMIT_DURATION' | 'STORY_LIMIT_TEXT_LENGTH';

export type StoryLimit = { code: StoryLimitCode; max: number };

type Bag = Record<string, unknown>;
type Family = 'stickers' | 'images' | 'texts' | 'audios' | 'videos';

const isBag = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v);
const bags = (v: unknown): Bag[] => (Array.isArray(v) ? v.filter(isBag) : []);
const codeOf = (family: Family) => `STORY_LIMIT_${family.toUpperCase()}` as StoryLimitCode;
const mediaFamily = (mediaType: unknown): Family => (mediaType === 'video' ? 'videos' : 'images');
const isBackgroundPayload = (o: Bag): boolean => isBag(o.payload) && o.payload.isBackground === true;

const tally = (families: Family[]): Record<Family, number> =>
  families.reduce<Record<Family, number>>(
    (acc, f) => ({ ...acc, [f]: acc[f] + 1 }),
    { stickers: 0, images: 0, texts: 0, audios: 0, videos: 0 },
  );

const v1Families = (effects: Bag): Family[] => [
  ...bags(effects.stickerObjects).map((): Family => 'stickers'),
  ...bags(effects.textObjects).map((): Family => 'texts'),
  ...bags(effects.audioPlayerObjects).filter((a) => a.isBackground !== true).map((): Family => 'audios'),
  ...bags(effects.mediaObjects).filter((m) => m.isBackground !== true).map((m) => mediaFamily(m.mediaType)),
];

const v3ObjectFamily = (o: Bag): Family | null => {
  if (isBackgroundPayload(o)) return null;
  if (o.kind === 'sticker') return 'stickers';
  if (o.kind === 'text') return 'texts';
  if (o.kind === 'audio') return 'audios';
  if (o.kind === 'media' && o.plane !== 'bg') return mediaFamily(isBag(o.payload) ? o.payload.mediaType : undefined);
  return null;
};

const v3SceneFamilies = (scene: Bag): Family[] =>
  bags(scene.objects).flatMap((o) => { const f = v3ObjectFamily(o); return f ? [f] : []; });

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const exceeded = (counts: Record<Family, number>): Family[] =>
  (Object.keys(counts) as Family[]).filter((f) => counts[f] > STORY_OBJECTS_PER_FAMILY_MAX);

const durationExceeded = (effects: Bag): boolean => {
  const sceneTotal = bags(effects.scenes).reduce((sum, s) => sum + num(s.timelineDuration), 0);
  return [num(effects.slideDuration), num(effects.timelineDuration), sceneTotal].some((d) => d > STORY_TOTAL_SECONDS_MAX);
};

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const lengthOf = (v: unknown): number => (typeof v === 'string' ? Array.from(graphemes.segment(v)).length : 0);

const createTextTooLong = (effects: Bag): boolean => {
  const v1 = bags(effects.textObjects).some((t) => lengthOf(t.text) > STORY_TEXT_CREATE_MAX || lengthOf(t.content) > STORY_TEXT_CREATE_MAX);
  const v3 = bags(effects.scenes).some((s) =>
    bags(s.objects).some((o) => o.kind === 'text' && isBag(o.payload) && lengthOf(o.payload.text) > STORY_TEXT_CREATE_MAX));
  return v1 || v3;
};

const flag = (ctx: z.RefinementCtx, code: StoryLimitCode, max: number) =>
  ctx.addIssue({ code: 'custom', message: code, params: { storyLimit: code, limit: max } });

/** Nombre par famille et par scène, durée totale : s'applique à la création ET à l'édition. */
export const enforceStoryLimits = (effects: object, ctx: z.RefinementCtx): void => {
  const bag = effects as Bag;
  const perScene = [v1Families(bag), ...bags(bag.scenes).map(v3SceneFamilies)];
  const families = new Set(perScene.flatMap((families) => exceeded(tally(families))));
  families.forEach((f) => flag(ctx, codeOf(f), STORY_OBJECTS_PER_FAMILY_MAX));
  if (durationExceeded(bag)) flag(ctx, 'STORY_LIMIT_DURATION', STORY_TOTAL_SECONDS_MAX);
};

/** Longueur d'un texte : création seulement. */
export const enforceStoryTextLengthOnCreate = (effects: object, ctx: z.RefinementCtx): void => {
  if (createTextTooLong(effects as Bag)) flag(ctx, 'STORY_LIMIT_TEXT_LENGTH', STORY_TEXT_CREATE_MAX);
};

/** La première borne nommée d'un refus Zod, ou null quand le refus n'en nomme aucune. */
export const storyLimitFromIssues = (issues: ReadonlyArray<object>): StoryLimit | null => {
  const named = issues
    .map((i) => (i as { params?: unknown }).params)
    .find((p): p is { storyLimit: StoryLimitCode; limit: number } => isBag(p) && typeof p.storyLimit === 'string');
  return named ? { code: named.storyLimit, max: named.limit } : null;
};
