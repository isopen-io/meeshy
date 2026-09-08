/**
 * Un conteneur en retard sur ses routes se signale AVANT l'utilisateur
 * (#5644). Incident du 2026-09-07 : `meeshy-gateway` tournait un binaire de
 * neuf jours pendant que sa santé restait `healthy` — rien ne comparait ce
 * qui TOURNE (`build.commit`, servi par `/health`, cf.
 * `@meeshy/shared/utils/build-info`) à ce qui est ÉCRIT (`origin/main`).
 *
 * Cette règle est PURE : elle ne lit ni git ni le réseau — `git merge-base
 * --is-ancestor` et `git rev-list --count` vivent dans
 * `scripts/check-deployed-revision.ts`, qui lui passe leur résultat.
 */

export type RevisionVerdict = 'a-jour' | 'en-retard' | 'divergent' | 'inconnu';

export type EvaluateDeployedRevisionInput = {
  /**
   * `true` si le SHA déployé est un ancêtre de la référence (`origin/main`),
   * `false` s'il ne l'est pas (branche parallèle — l'incident du 2026-09-07 :
   * deux commits à six minutes l'un de l'autre, sans lien d'ascendance),
   * `null` si `git merge-base --is-ancestor` n'a pas pu conclure.
   */
  readonly isAncestor: boolean | null;
  /** `git rev-list --count <sha>..<référence>`, ou `null` si indisponible. */
  readonly commitsBehind: number | null;
  /** Écart maximal toléré avant alerte. */
  readonly maxCommitsBehind: number;
};

export type EvaluateDeployedRevisionResult = {
  readonly verdict: RevisionVerdict;
  readonly reason: string;
  /** `true` pour "en-retard" et "divergent" — les deux verdicts qui doivent faire échouer le contrôle. */
  readonly isAlert: boolean;
};

export function evaluateDeployedRevision(
  input: EvaluateDeployedRevisionInput
): EvaluateDeployedRevisionResult {
  if (input.isAncestor === null || input.commitsBehind === null) {
    return {
      verdict: 'inconnu',
      reason: "l'ascendance du SHA déployé n'a pas pu être déterminée (git n'a rien conclu)",
      isAlert: false,
    };
  }

  if (!input.isAncestor) {
    return {
      verdict: 'divergent',
      reason: "le SHA déployé n'est pas un ancêtre de la branche de référence — deux commits parallèles, comme l'incident du 2026-09-07",
      isAlert: true,
    };
  }

  if (input.commitsBehind > input.maxCommitsBehind) {
    return {
      verdict: 'en-retard',
      reason: `le conteneur est en retard de ${input.commitsBehind} commits sur la référence (seuil : ${input.maxCommitsBehind})`,
      isAlert: true,
    };
  }

  return {
    verdict: 'a-jour',
    reason: `le conteneur est à ${input.commitsBehind} commit(s) de la référence (seuil : ${input.maxCommitsBehind})`,
    isAlert: false,
  };
}
