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
 * Les audiences de PUBLICATION qui suivent un cercle (`PostVisibility`, #13931) et
 * la feature de la matrice qui fixe leur plancher. `FRIENDS` n'y figure pas : son
 * sens historique « Amis et au-dessus » garde son chemin (amis ∪ contacts de
 * message direct), aucune feature ne le porte.
 */
export const POST_CIRCLE_AUDIENCE_FEATURE = {
  ACQUAINTANCES: 'audience.acquaintances',
  CLOSE: 'audience.close',
  BLOOD: 'audience.blood',
} as const satisfies Readonly<Record<string, RelationFeature>>;

export type PostCircleVisibility = keyof typeof POST_CIRCLE_AUDIENCE_FEATURE;

export const POST_CIRCLE_VISIBILITIES = Object.keys(POST_CIRCLE_AUDIENCE_FEATURE) as readonly PostCircleVisibility[];

/**
 * Le niveau EFFECTIF minimal qu'exige une audience de cercle, `null` pour toute
 * autre valeur (historique, inconnue, absente) : l'appelant garde alors son
 * chemin, et une valeur inconnue ne devient jamais un cercle.
 */
export const postCircleAudienceFloor = (visibility: unknown): RelationLevel | null =>
  typeof visibility === 'string' && Object.prototype.hasOwnProperty.call(POST_CIRCLE_AUDIENCE_FEATURE, visibility)
    ? RELATION_FEATURE_MIN_LEVEL[POST_CIRCLE_AUDIENCE_FEATURE[visibility as PostCircleVisibility]]
    : null;

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

/**
 * LE RÉGLAGE D'ENTOURAGE (#13929, directives porteur du 2026-10-31) — chacun
 * choisit, action par action, le cran minimal de son entourage qui est PRÉVENU.
 * Il ne gouverne que la diffusion à l'entourage : la personne directement visée
 * (l'auteur commenté, la personne mentionnée) est prévenue par ses propres
 * notifications, hors de ce réglage.
 *
 * `NOBODY` ferme ; `COMMUNITY` ajoute les co-membres d'une communauté ;
 * `PUBLIC` n'envoie jamais à « tout Meeshy » : sans modèle d'abonnés, il vise
 * les mêmes personnes NOMMÉES que `COMMUNITY` (tous les liens, communauté
 * comprise) — ADR `2026-10-31-l-entourage-prevenu-se-regle-action-par-action-13929`.
 * Le réglage ne peut jamais ouvrir plus que le cercle : la loi compare le
 * niveau EFFECTIF au cran choisi, et le blocage coupe tout.
 */
export const RELATION_AUDIENCE_CHOICES = ['NOBODY', 'BLOOD', 'CLOSE', 'FRIEND', 'ACQUAINTANCE', 'COMMUNITY', 'PUBLIC'] as const;
export type RelationAudienceChoice = (typeof RELATION_AUDIENCE_CHOICES)[number];

export const isRelationAudienceChoice = (value: unknown): value is RelationAudienceChoice =>
  typeof value === 'string' && (RELATION_AUDIENCE_CHOICES as readonly string[]).includes(value);

/** Les trois familles d'actions relayées à l'entourage, et la feature de la loi qui les porte. */
export const CIRCLE_NOTIFY_FAMILIES = {
  /** A — mes publications. */
  publication: { feature: 'notify.newContent', actions: ['post', 'reel', 'story', 'mood', 'repost', 'share'] },
  /** B — l'activité des autres sur MES contenus, relayée à mon entourage. */
  onMyContent: {
    feature: 'relay.commentersOnMyPosts',
    actions: ['comment', 'reaction', 'share', 'repost', 'quote', 'reference', 'mention'],
  },
  /** C — mon activité AILLEURS, montrée à mon entourage. */
  elsewhere: {
    feature: 'relay.myCommentsElsewhere',
    actions: ['comment', 'reaction', 'share', 'quote', 'reference', 'mention'],
  },
} as const satisfies Readonly<
  Record<string, { readonly feature: RelationFeature; readonly actions: readonly string[] }>
>;

export type CircleNotifyFamily = keyof typeof CIRCLE_NOTIFY_FAMILIES;
export type CircleNotifyAction<F extends CircleNotifyFamily> = (typeof CIRCLE_NOTIFY_FAMILIES)[F]['actions'][number];
/** La clé de préférence (`notification.<clé>`) : `circle` + famille + action, ex. `circlePublicationPost`. */
export type CircleNotifyKey = {
  [F in CircleNotifyFamily]: `circle${Capitalize<F>}${Capitalize<CircleNotifyAction<F>>}`;
}[CircleNotifyFamily];

const capitalize = <S extends string>(value: S): Capitalize<S> =>
  `${value.charAt(0).toUpperCase()}${value.slice(1)}` as Capitalize<S>;

export const circleNotifyKey = <F extends CircleNotifyFamily>(family: F, action: CircleNotifyAction<F>): CircleNotifyKey =>
  `circle${capitalize(family)}${capitalize(action)}` as CircleNotifyKey;

/** Toutes les clés, avec la feature qui les porte — dix-neuf actions. */
export const CIRCLE_NOTIFY_KEY_FEATURE: Readonly<Record<CircleNotifyKey, RelationFeature>> = Object.fromEntries(
  (Object.keys(CIRCLE_NOTIFY_FAMILIES) as CircleNotifyFamily[]).flatMap((family) =>
    CIRCLE_NOTIFY_FAMILIES[family].actions.map((action) => [
      circleNotifyKey(family, action as CircleNotifyAction<typeof family>),
      CIRCLE_NOTIFY_FAMILIES[family].feature,
    ]),
  ),
) as Record<CircleNotifyKey, RelationFeature>;

export const CIRCLE_NOTIFY_KEYS = Object.keys(CIRCLE_NOTIFY_KEY_FEATURE) as readonly CircleNotifyKey[];

/**
 * Le défaut d'une action : le niveau minimal de SA feature dans la matrice
 * (A → Proche, B → Proche, C → Sang). Une seule source : changer la matrice
 * change le défaut servi par la route de préférences.
 */
export const CIRCLE_NOTIFY_DEFAULTS: Readonly<Record<CircleNotifyKey, RelationAudienceChoice>> = Object.fromEntries(
  CIRCLE_NOTIFY_KEYS.map((key) => [key, RELATION_FEATURE_MIN_LEVEL[CIRCLE_NOTIFY_KEY_FEATURE[key]]]),
) as Record<CircleNotifyKey, RelationAudienceChoice>;

/** Les features dont le PROPRIÉTAIRE du contenu choisit le cran (entrée `ownerAudience` de la loi). */
export const RELATION_TUNABLE_FEATURES: ReadonlySet<RelationFeature> = new Set<RelationFeature>(
  Object.values(CIRCLE_NOTIFY_FAMILIES).map((family) => family.feature),
);

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
