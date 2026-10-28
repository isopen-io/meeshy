import { z } from 'zod';

/**
 * Les BORNES que la passerelle impose à ce que `StoryEffectsSchema` laisse passer en `passthrough` (#13586).
 *
 * Le chemin v3 NON strict (sans `CANVAS_V3_WRITE_STRICT`) ne valide aucune scène : un document `v:3` n'était
 * borné que par les 256 KB globaux, soit des milliers d'objets, des textes sans longueur et des keyframes à
 * ±1e308 que les lecteurs devaient absorber seuls. Ces schémas reprennent les plafonds de la forme v1
 * (32 objets par famille, 2000 caractères par texte, mêmes bornes numériques que les objets v1) et ceux de
 * `CanvasV3Schema` (10 scènes, 60 objets par scène, 60 keyframes). Ils sont TOLÉRANTS : seules les grandeurs
 * bornées sont lues, tout le reste voyage (`passthrough`) — aucun client légitime n'est refusé, un dépassement
 * échoue le même schéma que la forme v1 (400 `VALIDATION_ERROR`).
 */

export const STORY_SCENES_MAX = 10;
export const STORY_SCENE_OBJECTS_MAX = 60;
export const STORY_KEYFRAMES_MAX = 60;
export const STORY_KIND_OBJECTS_MAX = 32;
const STORY_TEXT_MAX = 2000;
const STORY_SECONDS_MAX = 86400;

/** Les quatre familles que la forme v1 plafonne à 32 (`textObjects`, `mediaObjects`, `stickerObjects`, `audioPlayerObjects`). */
const V1_CAPPED_KINDS = ['text', 'media', 'sticker', 'audio'] as const;

export const StoryTimelineDurationSchema = z.number().finite().min(0).max(STORY_SECONDS_MAX).nullish();

export const StoryKeyframeBoundsSchema = z.object({
  time: z.number().finite().min(0).max(STORY_SECONDS_MAX),
  x: z.number().finite().min(-10).max(10).nullish(),
  y: z.number().finite().min(-10).max(10).nullish(),
  scale: z.number().finite().min(0).max(20).nullish(),
  opacity: z.number().finite().min(0).max(1).nullish(),
  volume: z.number().finite().min(0).max(2).nullish(),
}).passthrough();

export const StoryKeyframesBoundsSchema = z.array(StoryKeyframeBoundsSchema).max(STORY_KEYFRAMES_MAX).nullish();

const textPayloadIssues = (payload: Record<string, unknown>): string[] => {
  const issues: string[] = [];
  if (typeof payload.text === 'string' && payload.text.length > STORY_TEXT_MAX) issues.push('text');
  const translations = payload.translations;
  if (typeof translations === 'object' && translations !== null) {
    const tooLong = Object.values(translations).some((v) => typeof v === 'string' && v.length > STORY_TEXT_MAX);
    if (tooLong) issues.push('translations');
  }
  return issues;
};

const ObjectBoundsSchema = z.object({
  kind: z.string().optional(),
  timing: z.object({ keyframes: StoryKeyframesBoundsSchema }).passthrough().nullish(),
  payload: z.record(z.string(), z.unknown()).optional(),
}).passthrough().superRefine((object, ctx) => {
  if (object.kind !== 'text' || object.payload === undefined) return;
  for (const field of textPayloadIssues(object.payload)) {
    ctx.addIssue({ code: 'custom', message: `TEXT_TOO_LONG:${field}`, path: ['payload', field] });
  }
});

const SceneBoundsSchema = z.object({
  objects: z.array(ObjectBoundsSchema).max(STORY_SCENE_OBJECTS_MAX).optional(),
  timelineDuration: StoryTimelineDurationSchema,
}).passthrough().superRefine((scene, ctx) => {
  const objects = scene.objects ?? [];
  for (const kind of V1_CAPPED_KINDS) {
    if (objects.filter((o) => o.kind === kind).length > STORY_KIND_OBJECTS_MAX) {
      ctx.addIssue({ code: 'custom', message: `KIND_OBJECTS_TOO_MANY:${kind}`, path: ['objects'] });
    }
  }
});

export const StoryScenesBoundsSchema = z.array(SceneBoundsSchema).max(STORY_SCENES_MAX).optional();
