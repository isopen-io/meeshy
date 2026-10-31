/**
 * LA CONFIG DES CERCLES — ce que chaque niveau ouvre, comment il se nomme, à
 * quel seuil on y entre (#13927, décisions porteur du 2026-10-31).
 *
 * La LOI (`relation-access.ts`) est pure et ne code aucun niveau en dur : elle
 * lit cette table. Changer qui voit quoi, c'est changer UNE ligne ici, et les
 * cas partagés (`fixtures/relation-access-cases.json`) rougissent chez les
 * trois miroirs — jamais un seuil recopié dans un service.
 *
 * Placement : `utils/` et non `config/` (écart justifié du cadrage) — `config/`
 * n'existe pas dans ce paquet, et l'y créer coûterait un `include` de tsconfig
 * et un `exports`/`files` de package.json pour aucun gain.
 *
 * ATOM (lien parent/tuteur vérifié) est RÉSERVÉ : aucune feature n'y est liée
 * au MVP, seul le quota du Bring le nomme (illimité, `null`).
 */

import type { RelationLevel } from '../types/relation.js';

export const RELATION_FEATURES = [
  'presence.online',
  'presence.detailed',
  'game.basic',
  'game.sparksGlory',
  'notify.newContent',
  'relay.commentersOnMyPosts',
  'relay.myCommentsElsewhere',
  'dm.direct',
  'audience.acquaintances',
  'audience.close',
  'audience.blood',
  'listening.category',
  'listening.title',
  'talkie',
  'bring',
  'location.live',
  'location.history',
  'location.proximity',
  'acquaintance.auto',
] as const;

export type RelationFeature = (typeof RELATION_FEATURES)[number];

/**
 * Niveau EFFECTIF minimal pour chaque feature (§ 1.3 de la spec). La Connaissance
 * automatique n'a pas de niveau : elle CRÉE le premier lien, sa seule garde est
 * l'âge déclaré (voir `relation-access.ts`).
 */
export const RELATION_FEATURE_MIN_LEVEL: Readonly<Record<RelationFeature, RelationLevel>> = {
  'presence.online': 'FRIEND',
  'presence.detailed': 'CLOSE',
  'game.basic': 'FRIEND',
  'game.sparksGlory': 'CLOSE',
  'notify.newContent': 'CLOSE',
  'relay.commentersOnMyPosts': 'CLOSE',
  'relay.myCommentsElsewhere': 'BLOOD',
  'dm.direct': 'ACQUAINTANCE',
  'audience.acquaintances': 'ACQUAINTANCE',
  'audience.close': 'CLOSE',
  'audience.blood': 'BLOOD',
  'listening.category': 'CLOSE',
  'listening.title': 'BLOOD',
  talkie: 'CLOSE',
  bring: 'FRIEND',
  'location.live': 'BLOOD',
  'location.history': 'BLOOD',
  'location.proximity': 'BLOOD',
  'acquaintance.auto': 'PUBLIC',
};

/**
 * Les features qui exigent un CONSENTEMENT explicite et refusable, à tout âge
 * (§ 1.8) : Bring (à l'entrée en Ami), talkie et catégorie d'écoute (à l'entrée
 * en Proche), titre d'écoute et position (au rituel Sang). La loi dit le
 * PLAFOND ; `RelationFeatureSetting` dit si la personne l'active — les deux sont
 * requis. Ce n'est JAMAIS un refus d'âge.
 */
export const RELATION_CONSENT_FEATURES: ReadonlySet<RelationFeature> = new Set<RelationFeature>([
  'bring',
  'talkie',
  'listening.category',
  'listening.title',
  'location.live',
  'location.history',
  'location.proximity',
]);

/** Actions adressées à UNE AUTRE personne : elles n'ont aucun sens envers soi-même. */
export const RELATION_DIRECTED_FEATURES: ReadonlySet<RelationFeature> = new Set<RelationFeature>([
  'bring',
  'talkie',
  'acquaintance.auto',
]);

/** Les seules features qu'un ADMIN/BIGBOSS lit sans lien (loi du 2026-08-25). */
export const RELATION_PRESENCE_FEATURES: ReadonlySet<RelationFeature> = new Set<RelationFeature>([
  'presence.online',
  'presence.detailed',
]);

export type RelationLevelPresentation = { readonly labelKey: string; readonly icon: string };

export const RELATION_LEVEL_PRESENTATION: Readonly<Record<RelationLevel, RelationLevelPresentation>> = {
  PUBLIC: { labelKey: 'relation.level.PUBLIC', icon: '🌐' },
  COMMUNITY: { labelKey: 'relation.level.COMMUNITY', icon: '👥' },
  ACQUAINTANCE: { labelKey: 'relation.level.ACQUAINTANCE', icon: '👋' },
  FRIEND: { labelKey: 'relation.level.FRIEND', icon: '🤝' },
  CLOSE: { labelKey: 'relation.level.CLOSE', icon: '🔥' },
  BLOOD: { labelKey: 'relation.level.BLOOD', icon: '🩸' },
};

/** Les SEPT langues du catalogue des clients (iOS `Localizable.xcstrings`). */
export const RELATION_LABEL_LANGUAGES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'pt-BR'] as const;
export type RelationLabelLanguage = (typeof RELATION_LABEL_LANGUAGES)[number];

export const RELATION_LEVEL_LABELS: Readonly<Record<RelationLabelLanguage, Readonly<Record<RelationLevel, string>>>> = {
  ar: { PUBLIC: 'عام', COMMUNITY: 'المجتمع', ACQUAINTANCE: 'معرفة', FRIEND: 'صديق', CLOSE: 'مقرّب', BLOOD: 'دم' },
  de: { PUBLIC: 'Öffentlich', COMMUNITY: 'Community', ACQUAINTANCE: 'Bekannter', FRIEND: 'Freund', CLOSE: 'Vertrauter', BLOOD: 'Blut' },
  en: { PUBLIC: 'Public', COMMUNITY: 'Community', ACQUAINTANCE: 'Acquaintance', FRIEND: 'Friend', CLOSE: 'Close', BLOOD: 'Blood' },
  es: { PUBLIC: 'Público', COMMUNITY: 'Comunidad', ACQUAINTANCE: 'Conocido', FRIEND: 'Amigo', CLOSE: 'Cercano', BLOOD: 'Sangre' },
  fr: { PUBLIC: 'Public', COMMUNITY: 'Communauté', ACQUAINTANCE: 'Connaissance', FRIEND: 'Ami', CLOSE: 'Proche', BLOOD: 'Sang' },
  it: { PUBLIC: 'Pubblico', COMMUNITY: 'Comunità', ACQUAINTANCE: 'Conoscente', FRIEND: 'Amico', CLOSE: 'Intimo', BLOOD: 'Sangue' },
  'pt-BR': { PUBLIC: 'Público', COMMUNITY: 'Comunidade', ACQUAINTANCE: 'Conhecido', FRIEND: 'Amigo', CLOSE: 'Próximo', BLOOD: 'Sangue' },
};

export type RelationBringQuota = Readonly<{ FRIEND: number; CLOSE: number; BLOOD: number; ATOM: number | null }>;

export type RelationThresholds = {
  readonly acquaintance: { readonly minInteractions: number };
  readonly close: { readonly activeWeeks: number };
  readonly blood: { readonly activeWeeks: number };
  readonly bring: { readonly perDay: RelationBringQuota };
  readonly cooldownDays: number;
  readonly proximity: { readonly cooldownHours: number };
};

export const RELATION_THRESHOLDS: RelationThresholds = {
  acquaintance: { minInteractions: 10 },
  close: { activeWeeks: 4 },
  blood: { activeWeeks: 12 },
  bring: { perDay: { FRIEND: 1, CLOSE: 3, BLOOD: 30, ATOM: null } },
  cooldownDays: 30,
  proximity: { cooldownHours: 2 },
};

/**
 * Seuils abaissés sur staging pour qu'une recette atteigne Proche et Sang sans
 * attendre des semaines. Seuls les seuils d'ENTRÉE baissent : les quotas, le
 * cool-down et la matrice sont ceux de la production.
 */
const STAGING_THRESHOLDS: RelationThresholds = {
  ...RELATION_THRESHOLDS,
  acquaintance: { minInteractions: 3 },
  close: { activeWeeks: 1 },
  blood: { activeWeeks: 2 },
};

export const relationThresholdsFor = (environment: string | null | undefined): RelationThresholds =>
  environment === 'staging' ? STAGING_THRESHOLDS : RELATION_THRESHOLDS;

export const isRelationFeature = (value: unknown): value is RelationFeature =>
  typeof value === 'string' && (RELATION_FEATURES as readonly string[]).includes(value);
