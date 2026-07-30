import { z } from 'zod';

// ============================================
// CURSOR PAGINATION HELPERS
// ============================================

export interface CursorData {
  createdAt: string;
  id: string;
}

export function encodeCursor(createdAt: Date | string, id: string): string {
  const data: CursorData = {
    createdAt: typeof createdAt === 'string' ? createdAt : createdAt.toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeCursor(cursor: string): CursorData | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const data = JSON.parse(json);
    if (data.createdAt && data.id) return data;
    return null;
  } catch {
    return null;
  }
}

// ============================================
// ZOD SCHEMAS
// ============================================

export const MobileTranscriptionSchema = z.object({
  text: z.string(),
  language: z.string(),
  confidence: z.number().optional(),
  duration_ms: z.number().int().optional(),
  segments: z.array(z.object({
    text: z.string(),
    start: z.number().optional(),
    end: z.number().optional(),
    speaker_id: z.string().optional(),
  })).optional(),
});

export type MobileTranscription = z.infer<typeof MobileTranscriptionSchema>;

// ============================================
// StoryEffects — bounded structural schema
// ============================================
//
// `storyEffects` est le blob JSON qui décrit la composition d'une story
// (textes, médias overlay, stickers, transitions, etc.). Avant 2026-05 il
// était validé `z.record(z.unknown())` — un client pouvait y insérer des
// champs arbitraires de N MB qui passaient Zod, le bodyLimit 50MB du serveur,
// et finissaient dans la doc Mongo (cap 16MB → blow up ou DoS).
//
// Ce schéma applique :
// - longueur max sur tous les champs string (thumbHash, text, postMediaId)
// - cap sur les arrays (medias, texts, stickers, audios)
// - bornes numériques (positions normalisées, scales)
// - refus des fields inconnus (passthrough mais avec garde-fou taille)
// Politique fail-soft : on garde `passthrough()` pour les fields nouveaux que
// le SDK iOS peut introduire sans casser le backend ; les bornes sur les
// champs connus + une vérification finale de taille JSON sérialisée
// constituent la défense réelle.

const STORY_THUMBHASH_MAX = 100;        // ~28-36 chars légitimes, marge x3
const STORY_TEXT_MAX = 2000;            // ample pour overlay long
const STORY_ID_MAX = 64;                // UUID / ObjectId
const STORY_LANG_MAX = 16;              // BCP-47
const STORY_HEX_MAX = 16;               // "#RRGGBBAA" + marge
const STORY_FONT_MAX = 64;
const STORY_STYLE_MAX = 64;
const STORY_ARRAY_CAP = 32;             // medias/texts/stickers/audios par slide

const StoryMediaObjectSchema = z.object({
  id: z.string().max(STORY_ID_MAX).optional(),
  postMediaId: z.string().max(STORY_ID_MAX).optional(),
  mediaURL: z.string().max(2048).optional(),
  mediaType: z.string().max(32).optional(),
  placement: z.string().max(32).optional(),
  aspectRatio: z.number().min(0.05).max(20).optional(),
  x: z.number().min(-10).max(10).optional(),
  y: z.number().min(-10).max(10).optional(),
  scale: z.number().min(0).max(20).optional(),
  rotation: z.number().min(-720).max(720).optional(),
  // Plafond a 2 : l'auteur peut pousser un media au-dela de son niveau nominal
  // (quitte a saturer, c'est un choix de composition assume). Miroir de
  // `StoryVolume.maxGain` cote iOS — les deux valeurs doivent rester egales.
  volume: z.number().min(0).max(2).optional(),
  isBackground: z.boolean().optional(),
  loop: z.boolean().optional(),
  zIndex: z.number().int().min(-1000).max(1000).optional(),
  startTime: z.number().min(0).max(86400).optional(),
  duration: z.number().min(0).max(86400).optional(),
  fadeIn: z.number().min(0).max(60).optional(),
  fadeOut: z.number().min(0).max(60).optional(),
  sourceLanguage: z.string().max(STORY_LANG_MAX).optional(),
  thumbHash: z.string().max(STORY_THUMBHASH_MAX).optional(),
}).passthrough();

const StoryTextObjectSchema = z.object({
  id: z.string().max(STORY_ID_MAX).optional(),
  text: z.string().max(STORY_TEXT_MAX).optional(),
  content: z.string().max(STORY_TEXT_MAX).optional(),  // legacy field
  x: z.number().min(-10).max(10).optional(),
  y: z.number().min(-10).max(10).optional(),
  scale: z.number().min(0).max(20).optional(),
  rotation: z.number().min(-720).max(720).optional(),
  fontSize: z.number().min(1).max(1000).optional(),
  textSize: z.number().min(1).max(1000).optional(),  // legacy field
  fontFamily: z.string().max(STORY_FONT_MAX).optional(),
  textStyle: z.string().max(STORY_STYLE_MAX).optional(),
  textColor: z.string().max(STORY_HEX_MAX).optional(),
  textAlign: z.string().max(16).optional(),
  textBg: z.string().max(STORY_HEX_MAX).optional(),
  borderColor: z.string().max(STORY_HEX_MAX).optional(),
  borderWidth: z.number().min(0).max(100).optional(),
  zIndex: z.number().int().min(-1000).max(1000).optional(),
  startTime: z.number().min(0).max(86400).optional(),
  duration: z.number().min(0).max(86400).optional(),
  sourceLanguage: z.string().max(STORY_LANG_MAX).optional(),
  translations: z.record(z.string(), z.string().max(STORY_TEXT_MAX)).optional(),
}).passthrough();

const StoryStickerObjectSchema = z.object({
  id: z.string().max(STORY_ID_MAX).optional(),
  emoji: z.string().max(16).optional(),
  x: z.number().min(-10).max(10).optional(),
  y: z.number().min(-10).max(10).optional(),
  scale: z.number().min(0).max(20).optional(),
  rotation: z.number().min(-720).max(720).optional(),
  zIndex: z.number().int().min(-1000).max(1000).optional(),
}).passthrough();

export const StoryAudioObjectSchema = z.object({
  id: z.string().max(STORY_ID_MAX).optional(),
  postMediaId: z.string().max(STORY_ID_MAX).optional(),
  placement: z.string().max(32).optional(),
  // Meme plafond que `StoryMediaObjectSchema` ci-dessus : 200 % de gain.
  volume: z.number().min(0).max(2).optional(),
  isBackground: z.boolean().optional(),
  waveformSamples: z.array(z.number()).max(2048).optional(),
  startTime: z.number().min(0).max(86400).optional(),
  duration: z.number().min(0).max(86400).optional(),
  sourceLanguage: z.string().max(STORY_LANG_MAX).optional(),
  // Le blob `storyEffects` est entierement controle par le client : `soundId`
  // designe une entree de la bibliotheque de sons et sert de cle de lecture
  // cote serveur. Sans forme ObjectId stricte il devient un vecteur d'injection
  // (chemin, operateur Mongo) avant meme la garde d'autorisation.
  soundId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  mediaURL: z.string().max(2048).optional(),
  keyframes: z.array(z.unknown()).max(STORY_ARRAY_CAP).optional(),
  backgroundAudioVariants: z.array(z.unknown()).max(STORY_ARRAY_CAP).optional(),
}).passthrough();

/// Taille max sérialisée JSON acceptée pour `storyEffects` : 256 KB. Couvre
/// largement le cas légitime (10 slides × 8 medias × thumbHash 100 chars +
/// textes < 2KB) tout en empêchant qu'un attaquant farcisse un field inconnu
/// (allowed via passthrough) avec un blob géant.
const STORY_EFFECTS_MAX_BYTES = 256 * 1024;

export const StoryEffectsSchema = z.object({
  background: z.string().max(64).optional(),
  thumbHash: z.string().max(STORY_THUMBHASH_MAX).optional(),
  mediaObjects: z.array(StoryMediaObjectSchema).max(STORY_ARRAY_CAP).optional(),
  textObjects: z.array(StoryTextObjectSchema).max(STORY_ARRAY_CAP).optional(),
  stickerObjects: z.array(StoryStickerObjectSchema).max(STORY_ARRAY_CAP).optional(),
  audioPlayerObjects: z.array(StoryAudioObjectSchema).max(STORY_ARRAY_CAP).optional(),
  slideDuration: z.number().min(0).max(86400).optional(),
}).passthrough()
  .refine((effects) => {
    // Garde-fou final : sérialiser et vérifier taille totale. Couvre les
    // fields passthrough non-bornés individuellement.
    try {
      return JSON.stringify(effects).length <= STORY_EFFECTS_MAX_BYTES;
    } catch {
      return false;
    }
  }, { message: `storyEffects JSON exceeds ${STORY_EFFECTS_MAX_BYTES} bytes` });

export const CreatePostSchema = z.object({
  type: z.enum(['POST', 'REEL', 'STORY', 'STATUS']).default('POST'),
  visibility: z.enum(['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE', 'EXCEPT', 'ONLY']).optional(),
  visibilityUserIds: z.array(z.string()).max(500).optional(),
  content: z.string().max(5000).optional(),
  communityId: z.string().optional(),
  // Story-specific
  storyEffects: StoryEffectsSchema.optional(),
  // Status/mood-specific
  moodEmoji: z.string().max(10).optional(),
  audioUrl: z.url().optional(),
  audioDuration: z.number().int().positive().optional(),
  // Original language override (ISO 639-1, e.g. "fr", "en")
  originalLanguage: z.string().min(2).max(5).optional(),
  // Media IDs (already uploaded)
  mediaIds: z.array(z.string()).max(10).optional(),
  // Mobile transcription for audio media
  mobileTranscription: MobileTranscriptionSchema.optional(),
  // Repost source ID (for StoryComposer publishing a repost via POST /posts)
  repostOfId: z.string().optional(),
  // Lieu partagé — champ dédié, JAMAIS un `metadata` brut (cf.
  // services/location/sharedPlace.ts). Validation stricte des coordonnées
  // et bornage des chaînes délégués à `parseSharedPlace`, appelé côté
  // `PostService.createPost`.
  location: z.unknown().optional(),
}).refine((data) => {
  if ((data.visibility === 'EXCEPT' || data.visibility === 'ONLY') && (!data.visibilityUserIds || data.visibilityUserIds.length === 0)) {
    return false;
  }
  return true;
}, { message: 'EXCEPT and ONLY visibility require at least one userId in visibilityUserIds' })
  .refine(hasAnyContentCarrier, {
    message: 'A post must carry something: content, media, audio, a mood, a repost, or story effects',
  });

/**
 * Vrai des qu'un post porte quoi que ce soit a restituer.
 *
 * Tous les champs de contenu etaient optionnels sans qu'aucune regle n'exige
 * qu'au moins un soit present : `POST /posts { type: 'STORY' }` creait un objet
 * definitivement vide. Constate le 2026-07-26 en production — huit stories d'un
 * meme auteur avec `media: []`, `storyEffects: { textObjects: [] }` et
 * `content: null`, que le lecteur iOS rendait en ecran noir pendant toute la
 * duree de slide.
 *
 * Le predicat est deliberement PERMISSIF : un seul porteur suffit, et un fond
 * de couleur seul est une story legitime. Un faux rejet empecherait une
 * publication reelle — bien plus grave qu'un objet vide de plus en base.
 * Miroir cote lecture : `StoryContentPresence` (iOS).
 */
function hasAnyContentCarrier(data: {
  content?: string;
  mediaIds?: string[];
  audioUrl?: string;
  moodEmoji?: string;
  repostOfId?: string;
  storyEffects?: Record<string, unknown>;
}): boolean {
  if (data.content?.trim()) return true;
  if (data.mediaIds?.length) return true;
  if (data.audioUrl?.trim()) return true;
  if (data.moodEmoji?.trim()) return true;
  if (data.repostOfId?.trim()) return true;

  const effects = data.storyEffects;
  if (!effects) return false;

  // Un `storyEffects` present ne suffit pas : `{ textObjects: [] }` est
  // exactement la forme des stories vides observees. On regarde ce qu'il y a
  // DEDANS, en acceptant toute cle non vide autre que la coquille par defaut.
  return Object.entries(effects).some(([key, value]) => {
    if (value === null || value === undefined) return false;
    if (key === 'textObjects') {
      return Array.isArray(value) && value.some(
        (t) => typeof (t as { text?: unknown }).text === 'string'
          && (t as { text: string }).text.trim().length > 0,
      );
    }
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  });
}

export const UpdatePostSchema = z.object({
  content: z.string().max(5000).optional(),
  visibility: z.enum(['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE', 'EXCEPT', 'ONLY']).optional(),
  visibilityUserIds: z.array(z.string()).max(500).optional(),
  storyEffects: StoryEffectsSchema.optional(),
  moodEmoji: z.string().max(10).optional(),
  // ISO 639-1 (or BCP-47) source language. Changing it re-runs the Prisme
  // translation pipeline from the new source and discards stale translations.
  originalLanguage: z.string().min(2).max(16).optional(),
  // Type is editable only between POST and REEL (service enforces the rest:
  // no repost, no STORY/STATUS, reel requires media).
  type: z.enum(['POST', 'REEL']).optional(),
  // Ids of attached media (PostMedia) to detach during the edit. Only media
  // belonging to this post is removed; a reel must keep at least one media.
  removeMediaIds: z.array(z.string()).max(50).optional(),
  // Ids of freshly uploaded media (PostMedia created by TUS with postId=null)
  // to attach during the edit — same contract and bound as CreatePostSchema.
  // On a STORY this counts as a content edit (engagement reset).
  mediaIds: z.array(z.string()).max(10).optional(),
}).refine((data) => {
  if ((data.visibility === 'EXCEPT' || data.visibility === 'ONLY') && (!data.visibilityUserIds || data.visibilityUserIds.length === 0)) {
    return false;
  }
  return true;
}, { message: 'EXCEPT and ONLY visibility require at least one userId in visibilityUserIds' });

export const CreateCommentSchema = z.object({
  // Le contenu peut être vide quand un média est joint (commentaire média seul).
  // Le refine ci-dessous garantit qu'un commentaire porte AU MOINS du texte ou un média.
  content: z.string().max(2000).optional().default(''),
  parentId: z.string().optional(),
  effectFlags: z.number().int().min(0).optional(),
  /// ISO 639-1 (or BCP-47) code of the language the comment is written in.
  /// Optional — when omitted the translation pipeline detects the language
  /// from the content as a fallback.
  originalLanguage: z.string().min(2).max(16).optional(),
  /// IDs de PostMedia déjà uploadés (uploadcontext=comment, postId/commentId=null
  /// pending) à attacher. Wire aligné sur le contrat message-with-attachments
  /// (tableau), MAIS un commentaire ne porte QU'UN SEUL média → borné à 1.
  attachmentIds: z.array(z.string()).max(1).optional(),
  /// Transcription Whisper produite côté mobile pour un média audio (évite la
  /// re-transcription serveur). Même structure que pour les posts.
  mobileTranscription: MobileTranscriptionSchema.optional(),
  /// Lieu partagé — même contrat que CreatePostSchema ci-dessus.
  location: z.unknown().optional(),
}).refine(
  (data) => (data.content?.trim().length ?? 0) > 0 || (data.attachmentIds?.length ?? 0) > 0,
  { message: 'A comment must have text content or an attached media' },
);

export const RepostSchema = z.object({
  targetType: z.enum(['POST', 'REEL', 'STORY', 'STATUS']).optional(),
  content: z.string().max(5000).optional(),
  isQuote: z.boolean().default(false),
  // Audience choisie par le REPOSTEUR. Le composer l'affiche depuis toujours ;
  // sans ce champ elle n'atteignait aucune couche et tout repost sortait avec
  // la visibilité de l'original (donc PUBLIC, seule valeur repostable).
  visibility: z.enum(['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE', 'EXCEPT', 'ONLY']).optional(),
});

export const TranslatePostSchema = z.object({
  targetLanguage: z.string().min(2).max(5),
  // Rejouer une langue DÉJÀ traduite — ce que demande le bouton « Retraduire »
  // de la feuille des langues du lecteur. Sans ce drapeau il appelait la même
  // route que « Traduire » et sortait aussitôt sur les gardes de cache : le
  // bouton ne faisait strictement rien, sans le moindre signal.
  force: z.boolean().optional(),
});

// ============================================
// ENGAGEMENT CAPTURE (LOT 4 — ingestion)
// ============================================

export const EngagementActionSchema = z.object({
  type: z.string().max(40),
  atMs: z.number().int().min(0),
});

export const WatchSampleSchema = z.object({
  positionMs: z.number().int().min(0),
  atMs: z.number().int().min(0),
});

export const EngagementSessionSchema = z.object({
  sessionId: z.guid(),
  // Champ informatif côté client uniquement : la route IGNORE ce userId et
  // prend l'identité du token auth (anti-spoof). Optionnel pour refléter
  // qu'il n'est pas fiable côté serveur.
  userId: z.string().optional(),
  postId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  contentType: z.enum(['POST', 'REEL', 'STORY', 'STATUS']),
  surface: z.string().max(40),
  startedAt: z.string(),
  dwellMs: z.number().int().min(0),
  watchMs: z.number().int().min(0).optional(),
  mediaDurationMs: z.number().int().min(0).optional(),
  completed: z.boolean().default(false),
  truncated: z.boolean().default(false),
  consent: z.string().max(40).optional(),
  actions: z.array(EngagementActionSchema).max(200).default([]),
  watchSamples: z.array(WatchSampleSchema).max(500).default([]),
});

export const EngagementBatchSchema = z.object({
  sessions: z.array(EngagementSessionSchema).min(1).max(50),
});

export type EngagementBatch = z.infer<typeof EngagementBatchSchema>;
export type EngagementSessionInput = z.infer<typeof EngagementSessionSchema>;

export const FeedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * Feed Reels : comme FeedQuery, plus `seed` = id du réel touché dans le Feed.
 * Présent → thread d'affinité « basé sur ce réel » ; absent → onglet « Pour toi ».
 */
export const ReelFeedQuerySchema = FeedQuerySchema.extend({
  seed: z.string().optional(),
});

export const LikeSchema = z.object({
  emoji: z.string().max(10).default('❤️'),
});

// ============================================
// RESPONSE TYPES
// ============================================

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

export interface SingleResponse<T> {
  success: boolean;
  data: T;
}

// ============================================
// FASTIFY TYPE AUGMENTATION
// ============================================

export interface PostParams {
  postId: string;
}

export interface CommentParams extends PostParams {
  commentId: string;
}

export interface UserParams {
  userId: string;
}

export interface CommunityParams {
  communityId: string;
}
