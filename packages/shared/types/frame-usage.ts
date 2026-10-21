/**
 * LA LOI D'USAGE DES CADRES (#10146) — un système UNIQUE, réutilisé par les
 * cadres des appels vidéo, de la prise de photo et de vidéo, des rangs, du
 * prestige, des succès et des moments du jeu. Chaque cadre DÉCLARE son usage ;
 * chaque surface demande `canUseFrame(usage, context)` avant de le proposer, et
 * chaque puce ou vignette de cadre affiche `describeFrameUsage(usage)`.
 *
 * Directive porteur 2026-10-11 : « le but est de développer un système
 * réutilisé par les frames en appels vidéo, en prise de photo, pour compléter,
 * et les frames proposés doivent indiquer quand c'est utilisable. Les frames
 * libres photo, vidéo et appels vidéo ne peuvent pas s'appliquer pour les
 * achievements, et un frame de rang ne peut être utilisé que pour le rang
 * indiqué ! Un frame de prestige ne peut être utilisé que pour le prestige !
 * Un frame appels vidéo ne peut être utilisé que pour les appels vidéo et la
 * capture caméra hors appel vidéo, mais un frame uniquement pour la capture
 * photo/vidéo ne peut pas être utilisé pour les appels vidéo (pour des
 * questions peut-être de ressources). »
 *
 * Les vecteurs croisés `packages/shared/design/packs/frame-usage-vectors.json`
 * sont rejoués par vitest et par le miroir Swift : toute évolution de la loi
 * passe par eux.
 */
import * as z from 'zod/mini';
import { ACHIEVEMENT_RARITIES, GLORY_DIVISIONS, GLORY_RANKS, type AchievementRarity, type GloryDivision5, type GloryRankOrMythic } from '../utils/game/glory.js';

/** Les surfaces d'un cadre LIBRE : l'appel vidéo en direct, la photo, la vidéo, l'avatar (contours de profil, #10632) et la bannière (cadres posés sur la photo de bannière, #10932). */
export const FREE_FRAME_SURFACES = ['call', 'photo', 'video', 'avatar', 'banner'] as const;
export type FreeFrameSurface = (typeof FREE_FRAME_SURFACES)[number];

/** Les familles de moments du jeu qu'un cadre de moment peut servir. */
export const FRAME_MOMENT_FAMILIES = ['tier', 'meesh', 'treasury', 'flame', 'day', 'level-100'] as const;
export type FrameMomentFamily = (typeof FRAME_MOMENT_FAMILIES)[number];

/** Les surfaces des cadres de capture d'appel (`design/call-capture-frames`), absentes = `capture`. */
export const CAPTURE_FRAME_SURFACES = ['capture', 'live'] as const;
export type CaptureFrameSurface = (typeof CAPTURE_FRAME_SURFACES)[number];

/** Le Mythe n'a pas de division : un cadre ou un contexte de Mythe qui en déclare une est illisible. */
const MYTHIC_RANK = 'mythe' satisfies GloryRankOrMythic;
const RANK_KEYS: readonly GloryRankOrMythic[] = [...GLORY_RANKS.map((rank) => rank.key), MYTHIC_RANK];

const rankSchema = z.enum(RANK_KEYS as unknown as readonly [GloryRankOrMythic, ...GloryRankOrMythic[]]);
const divisionSchema = z.literal(GLORY_DIVISIONS);
const raritySchema = z.enum(ACHIEVEMENT_RARITIES);
const familySchema = z.enum(FRAME_MOMENT_FAMILIES);

export type FrameUsage =
  | { readonly kind: 'free'; readonly surfaces: readonly FreeFrameSurface[] }
  | { readonly kind: 'rank'; readonly rank: GloryRankOrMythic; readonly division?: GloryDivision5 }
  | { readonly kind: 'prestige' }
  | { readonly kind: 'achievement'; readonly rarity?: AchievementRarity }
  | { readonly kind: 'moment'; readonly family: FrameMomentFamily };

export type FrameUseContext =
  | { readonly kind: 'call' }
  | { readonly kind: 'avatar' }
  | { readonly kind: 'banner' }
  | { readonly kind: 'capture'; readonly media: 'photo' | 'video' }
  | { readonly kind: 'rank'; readonly rank: GloryRankOrMythic; readonly division: GloryDivision5 | null }
  | { readonly kind: 'prestige' }
  | { readonly kind: 'achievement'; readonly rarity?: AchievementRarity }
  | { readonly kind: 'moment'; readonly family: FrameMomentFamily };

/** Fail-closed : une usage illisible ne se lit pas, et un cadre sans usage lisible ne se propose nulle part. */
export const FrameUsageSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('free'),
    surfaces: z.array(z.enum(FREE_FRAME_SURFACES)).check(
      z.minLength(1),
      z.refine((surfaces) => new Set(surfaces).size === surfaces.length),
    ),
  }),
  z
    .object({ kind: z.literal('rank'), rank: rankSchema, division: z.optional(divisionSchema) })
    .check(z.refine((usage) => usage.rank !== MYTHIC_RANK || usage.division === undefined)),
  z.object({ kind: z.literal('prestige') }),
  z.object({ kind: z.literal('achievement'), rarity: z.optional(raritySchema) }),
  z.object({ kind: z.literal('moment'), family: familySchema }),
]);

export const FrameUseContextSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('call') }),
  z.object({ kind: z.literal('avatar') }),
  z.object({ kind: z.literal('banner') }),
  z.object({ kind: z.literal('capture'), media: z.enum(['photo', 'video']) }),
  z
    .object({ kind: z.literal('rank'), rank: rankSchema, division: z.nullable(divisionSchema) })
    .check(z.refine((context) => (context.rank === MYTHIC_RANK) === (context.division === null))),
  z.object({ kind: z.literal('prestige') }),
  z.object({ kind: z.literal('achievement'), rarity: z.optional(raritySchema) }),
  z.object({ kind: z.literal('moment'), family: familySchema }),
]);

export const parseFrameUsage = (input: unknown): FrameUsage | null => {
  const parsed = FrameUsageSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};

/**
 * Un cadre d'appel vidéo sert aussi la capture photo et vidéo hors appel ;
 * un cadre de capture seule ne sert JAMAIS l'appel (ressources du direct).
 */
const freeServes = (surfaces: readonly FreeFrameSurface[], context: FrameUseContext): boolean => {
  if (context.kind === 'avatar') return surfaces.includes('avatar');
  if (context.kind === 'banner') return surfaces.includes('banner');
  if (context.kind === 'call') return surfaces.includes('call');
  if (context.kind === 'capture') return surfaces.includes('call') || surfaces.includes(context.media);
  return false;
};

/** LA règle : ce cadre peut-il servir ce contexte ? Un cadre libre ne sert jamais le jeu, un cadre du jeu ne sert que SON contexte. */
export function canUseFrame(usage: FrameUsage, context: FrameUseContext): boolean {
  switch (usage.kind) {
    case 'free':
      return freeServes(usage.surfaces, context);
    case 'rank':
      return context.kind === 'rank' && context.rank === usage.rank && (usage.division === undefined || usage.division === context.division);
    case 'prestige':
      return context.kind === 'prestige';
    case 'achievement':
      return context.kind === 'achievement' && (usage.rarity === undefined || usage.rarity === context.rarity);
    case 'moment':
      return context.kind === 'moment' && context.family === usage.family;
  }
}

/** Les clés i18n du libellé « Utilisable : … », que web et iOS traduisent dans les sept langues. */
export const FRAME_USAGE_LABEL_KEYS = {
  callAndCapture: 'frame.usage.callAndCapture',
  captureOnly: 'frame.usage.captureOnly',
  photoOnly: 'frame.usage.photoOnly',
  videoOnly: 'frame.usage.videoOnly',
  rankOnly: 'frame.usage.rankOnly',
  rankDivisionOnly: 'frame.usage.rankDivisionOnly',
  prestigeOnly: 'frame.usage.prestigeOnly',
  achievementOnly: 'frame.usage.achievementOnly',
  achievementRarityOnly: 'frame.usage.achievementRarityOnly',
  momentOnly: 'frame.usage.momentOnly',
  avatarOnly: 'frame.usage.avatarOnly',
  bannerFrameOnly: 'frame.usage.bannerFrameOnly',
} as const;
export type FrameUsageLabelKey = (typeof FRAME_USAGE_LABEL_KEYS)[keyof typeof FRAME_USAGE_LABEL_KEYS];

/**
 * Les paramètres sont des CLÉS (`rank` : clé de rang, `rarity`, `family`) que
 * le client traduit par ses propres libellés ; `division` est déjà en chiffres
 * romains, identiques dans toutes les langues.
 */
export type FrameUsageLabel = { readonly key: FrameUsageLabelKey; readonly params: Readonly<Record<string, string>> };

const ROMAN: Readonly<Record<GloryDivision5, string>> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };

const freeLabel = (surfaces: readonly FreeFrameSurface[]): FrameUsageLabelKey => {
  if (surfaces.length === 1 && surfaces[0] === 'avatar') return FRAME_USAGE_LABEL_KEYS.avatarOnly;
  if (surfaces.length === 1 && surfaces[0] === 'banner') return FRAME_USAGE_LABEL_KEYS.bannerFrameOnly;
  if (surfaces.includes('call')) return FRAME_USAGE_LABEL_KEYS.callAndCapture;
  if (surfaces.includes('photo') && surfaces.includes('video')) return FRAME_USAGE_LABEL_KEYS.captureOnly;
  return surfaces.includes('photo') ? FRAME_USAGE_LABEL_KEYS.photoOnly : FRAME_USAGE_LABEL_KEYS.videoOnly;
};

export function describeFrameUsage(usage: FrameUsage): FrameUsageLabel {
  switch (usage.kind) {
    case 'free':
      return { key: freeLabel(usage.surfaces), params: {} };
    case 'rank':
      return usage.division === undefined
        ? { key: FRAME_USAGE_LABEL_KEYS.rankOnly, params: { rank: usage.rank } }
        : { key: FRAME_USAGE_LABEL_KEYS.rankDivisionOnly, params: { rank: usage.rank, division: ROMAN[usage.division] } };
    case 'prestige':
      return { key: FRAME_USAGE_LABEL_KEYS.prestigeOnly, params: {} };
    case 'achievement':
      return usage.rarity === undefined
        ? { key: FRAME_USAGE_LABEL_KEYS.achievementOnly, params: {} }
        : { key: FRAME_USAGE_LABEL_KEYS.achievementRarityOnly, params: { rarity: usage.rarity } };
    case 'moment':
      return { key: FRAME_USAGE_LABEL_KEYS.momentOnly, params: { family: usage.family } };
  }
}

/**
 * La projection d'un cadre de capture d'appel : `live` ⇒ appel ET capture,
 * `capture` seul (ou rien de déclaré, le défaut de `servedSurfaces`) ⇒ capture
 * photo et vidéo, jamais l'appel.
 */
export const captureFrameUsage = (surfaces: readonly CaptureFrameSurface[] | undefined): FrameUsage =>
  surfaces?.includes('live') === true ? { kind: 'free', surfaces: ['call', 'photo', 'video'] } : { kind: 'free', surfaces: ['photo', 'video'] };
