/**
 * LES ÉTINCELLES SUR LE COMPTE (#10846) — les colonnes que la passerelle lit pour juger un niveau.
 *
 * `User.engagementScore` est la POCHE (ce que la frappe dépense). Le NIVEAU se lit sur le cycle
 * (`sparksSincePrestige`), le total accumulé sur `sparksEarnedLifetime`, le niveau max à vie sur
 * `levelMaxLifetime`. Un `select` partagé et les lectures de `@meeshy/shared/utils/game/sparks`
 * (`sparksOf`, `currentLevelOf`, `unlockLevelOf`) : un seul endroit dit quelles colonnes font le niveau,
 * jamais une recomposition par site (la recomposition par site est ce qui fait diverger les écrans).
 */

export { currentLevelOf, sparkCount, sparksOf, unlockLevelOf } from '@meeshy/shared/utils/game/sparks';

/** Les colonnes du compte qui font le niveau et les étincelles — à étaler dans le `select` de l'appelant. */
export const SPARKS_USER_SELECT = {
  engagementScore: true,
  sparksSincePrestige: true,
  sparksEarnedLifetime: true,
  sparksDebt: true,
  levelRecord: true,
  levelMaxLifetime: true,
} as const;
