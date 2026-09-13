/**
 * LA GRAMMAIRE DES SUCCÈS (#5758) — comment produire des MILLIERS de succès
 * sans écrire des milliers de libellés.
 *
 * ## Le problème que ce module résout
 *
 * Le porteur demande des succès du type « tu as intégré une conversation de
 * plus de 10, 100, 1 000, 10 000, 100 000, 1 000 000 membres », « même chose
 * pour une communauté, pour le départ, pour un appel lancé, pour un message,
 * un vocal, une image, une vidéo, un supprimé, un édité, une réaction — avec
 * des compteurs encore ! ».
 *
 * Énumérer ce produit cartésien donnerait des milliers d'entrées × 8 langues.
 * Ingérable, et faux dès la première divergence de traduction.
 *
 * **La clé est donc COMPOSÉE, et le libellé aussi** :
 *
 *     achievement.<section>.<sujet>.<geste>.<échelle>:<palier>
 *     achievement.cercles.conversation.join.size:1000
 *     achievement.parole.message.send.count:10000
 *
 * Le nombre de chaînes à traduire suit le nombre de COUPLES (sujet, geste,
 * échelle), pas le nombre de succès : un gabarit sert tous ses paliers.
 *
 * ## Deux échelles, qu'il ne faut jamais confondre
 *
 *  - **`size` — l'AMPLEUR** : la taille de ce qu'on a rejoint. UN seul
 *    événement peut débloquer un palier élevé (entrer dans un groupe de
 *    100 000 le donne d'un coup). Récompense la chance et l'audience.
 *  - **`count` — le VOLUME** : combien de fois. Exige la répétition.
 *    Récompense la constance.
 *
 * Les mélanger dans une même échelle produirait un classement absurde : « 100
 * conversations rejointes » et « une conversation de 100 membres » portent le
 * même nombre et n'ont pas la même difficulté du tout. D'où `baseDifficulty`,
 * déclaré par famille, qui rend les deux comparables.
 *
 * ## Ce que le catalogue REFUSE
 *
 *  - **Un palier inatteignable ne s'affiche pas.** Un succès « conversation de
 *    1 000 000 membres » dans un produit dont la plus grande en compte 300 est
 *    une promesse qu'on ne peut pas tenir. L'atteignabilité est MESURÉE sur la
 *    réalité du produit (`AchievementReach`), jamais déclarée une fois pour
 *    toutes.
 *  - **Un succès ne crédite AUCUN point.** Comme les records et les
 *    collections (#5751) : sinon la course aux succès deviendrait une pompe à
 *    Meeshes.
 */

/** Les SECTIONS — une rangée horizontale chacune dans l'écran Progression. */
export const ACHIEVEMENT_SECTIONS = [
  'cercles',
  'parole',
  'retouche',
  'appels',
  'ambassade',
  'constance',
  'monnaie',
  'decouverte',
] as const;

export type AchievementSection = (typeof ACHIEVEMENT_SECTIONS)[number];

/** L'échelle sur laquelle un palier se mesure. */
export const ACHIEVEMENT_SCALES = ['count', 'size'] as const;
export type AchievementScale = (typeof ACHIEVEMENT_SCALES)[number];

/** Paliers de VOLUME — « combien de fois ». */
export const ACHIEVEMENT_COUNT_TIERS = [1, 10, 100, 1_000, 10_000] as const;

/** Paliers d'AMPLEUR — « de quelle taille », tels que le porteur les a donnés. */
export const ACHIEVEMENT_SIZE_TIERS = [10, 100, 1_000, 10_000, 100_000, 1_000_000] as const;

/**
 * Une FAMILLE : un couple (sujet, geste) sur une échelle. C'est l'unité qui
 * porte un gabarit de libellé — donc l'unité qu'il faut traduire, une fois,
 * pour tous ses paliers.
 */
export type AchievementFamily = {
  readonly section: AchievementSection;
  /** Ce sur quoi porte le geste : `conversation`, `community`, `message`, `call`… */
  readonly subject: string;
  /** Le geste : `join`, `leave`, `start`, `send`, `edit`, `delete`, `react`… */
  readonly verb: string;
  readonly scale: AchievementScale;
  /**
   * Le coût de base de cette famille, qui rend les échelles COMPARABLES.
   * Rejoindre un groupe de 1 000 membres n'est pas aussi dur que rejoindre
   * 1 000 groupes : sans ce décalage, le tri par palier mentirait.
   */
  readonly baseDifficulty: number;
};

/** La clé stable d'un succès — la seule chose qui voyage et se grave. */
export const achievementKey = (family: AchievementFamily, tier: number): string =>
  `achievement.${family.section}.${family.subject}.${family.verb}.${family.scale}:${tier}`;

/** Les paliers déclarés d'une famille, dans l'ordre croissant. */
export const tiersOf = (family: AchievementFamily): readonly number[] =>
  family.scale === 'count' ? ACHIEVEMENT_COUNT_TIERS : ACHIEVEMENT_SIZE_TIERS;

/**
 * La DIFFICULTÉ d'un palier — le scalaire qui range le catalogue « du moins
 * complexe au plus complexe » (directive porteur).
 *
 * `log10` et non le palier brut : les paliers montent par puissances de dix,
 * donc leur logarithme est le nombre de CRANS, ce qui est la vraie mesure de
 * l'effort. Le tri devient alors comparable entre familles.
 */
export const difficultyOf = (family: AchievementFamily, tier: number): number =>
  family.baseDifficulty + Math.log10(Math.max(1, tier));

/**
 * Ce que le produit rend ATTEIGNABLE, mesuré — jamais supposé.
 *
 * Pour une échelle `size`, c'est la plus grande entité qui existe (la plus
 * grosse conversation, la plus grosse communauté). Pour `count`, c'est un
 * plafond de bon sens ou l'absence de plafond.
 *
 * Une famille absente de la carte est traitée comme NON MESURÉE : ses paliers
 * `size` sont masqués (on ne promet pas ce qu'on ne sait pas tenir) et ses
 * paliers `count` restent visibles (rien n'empêche structurellement de
 * répéter un geste).
 */
export type AchievementReach = ReadonlyMap<string, number>;

/** La clé de mesure d'une famille dans `AchievementReach`. */
export const reachKey = (family: AchievementFamily): string =>
  `${family.subject}.${family.verb}.${family.scale}`;
