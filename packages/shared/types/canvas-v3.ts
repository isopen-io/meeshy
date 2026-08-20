import { z } from 'zod';

/** Kinds réservés (O1/S5/O10) — nomenclature connue, REFUSÉS en v1. */
export const RESERVED_KINDS = ['hashtag', 'annotation', 'interactive'] as const;
const ACTIVE_KINDS = ['text', 'media', 'sticker', 'audio', 'place', 'drawing', 'mention'] as const;

const AnchorSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('free'), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  z.object({ t: z.literal('band'), edge: z.enum(['top', 'bottom']) }),
]);

const KeyframeSchema = z.object({
  time: z.number().min(0),
  x: z.number().optional(), y: z.number().optional(),
  scale: z.number().positive().optional(),
  opacity: z.number().min(0).max(1).optional(),
  volume: z.number().min(0).max(1).optional(),
  easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut', 'spring']).optional(),
});

const TimingSchema = z.object({
  start: z.number().min(0).optional(),
  end: z.number().min(0).optional(),
  rate: z.number().min(0.25).max(4).optional(),
  keyframes: z.array(KeyframeSchema).max(60).optional(),
});

const ObjectV3Schema = z.object({
  id: z.string().min(1),
  kind: z.string().superRefine((k, ctx) => {
    if ((RESERVED_KINDS as readonly string[]).includes(k)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `KIND_RESERVED:${k}` });
    } else if (!(ACTIVE_KINDS as readonly string[]).includes(k)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `KIND_UNKNOWN:${k}` });
    }
  }),
  anchor: AnchorSchema,
  plane: z.enum(['bg', 'content', 'fg']),
  z: z.number().int(),
  transform: z.object({
    scale: z.number().positive(),
    rotation: z.number(),
    opacity: z.number().min(0).max(1),
  }),
  timing: TimingSchema.optional(),
  locale: z.string().min(2).max(8).optional(),
  // payload permissif PAR CONTRAT — il porte notamment, pour kind:text,
  // `translations: {lang: contenu}` (Prisme par objet, spec §C1 rév. 4/C6) :
  // le convertisseur A3 et le golden en font foi, pas une contrainte Zod.
  payload: z.record(z.string(), z.unknown()),
});

const BackgroundSoundSchema = z.object({
  source: z.discriminatedUnion('t', [
    z.object({ t: z.literal('original') }),
    z.object({ t: z.literal('library'), soundId: z.string().min(1) }),
  ]),
  volume: z.number().min(0).max(1).default(1),
  bounds: z.object({ start: z.number().min(0), end: z.number().min(0) }).optional(),
  // Sous-titres voix par langue (karaoké = Prisme audio) — logement du
  // `voiceTranscriptions` racine v1 (spec §C1 rév. 4, revue totale C7).
  transcriptions: z.array(z.object({
    language: z.string().min(2).max(8),
    content: z.string(),
  })).optional(),
});

const SceneV3Schema = z.object({
  id: z.string().min(1),
  objects: z.array(ObjectV3Schema).max(60),
  opening: z.record(z.string(), z.unknown()).optional(),
  closing: z.record(z.string(), z.unknown()).optional(),
  clipTransitions: z.array(z.record(z.string(), z.unknown())).max(30).optional(),
  timelineDuration: z.number().positive().optional(),
});

export const CanvasV3Schema = z.object({
  v: z.literal(3),
  scenes: z.array(SceneV3Schema).min(1).max(10),
  sound: BackgroundSoundSchema.optional(),
});

export type CanvasV3 = z.infer<typeof CanvasV3Schema>;
export type SceneV3 = z.infer<typeof SceneV3Schema>;
export type ObjectV3 = z.infer<typeof ObjectV3Schema>;
export type BackgroundSoundV3 = z.infer<typeof BackgroundSoundSchema>;
export type KeyframeV3 = z.infer<typeof KeyframeSchema>;
