/**
 * LA LOI DE BASCULE « HORS CHAMP » — hystérésis à DEUX seuils, jamais un
 * seul point de bascule (#6103).
 *
 * Miroir réduit à un booléen de `CollapsibleHeaderMetrics.pinnedAccessoryReveal`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift:58-77`) :
 * là-bas la fente du titre se remplit sur une RAMPE continue [0, 1] pilotée par
 * l'offset de défilement ; ici l'en-tête web est STATIQUE (aucune rampe à
 * animer), et ce qui reste à décider est un booléen — « la bande épinglée
 * est-elle DEDANS ou DEHORS ? ». Le calcul se fait sur la fraction VISIBLE de
 * l'élément observé (`visibleRatio`, 0 = entièrement hors champ, 1 =
 * entièrement dans le champ) plutôt que sur une distance de défilement : c'est
 * ce qu'un `IntersectionObserver` mesure nativement (`use-out-of-view.ts`),
 * sans jamais lire `scrollTop` à la main.
 *
 * DEUX SEUILS, JAMAIS UN — l'hystérésis (`revealRatio < releaseRatio`)
 * empêche un pixel de bruit de faire clignoter la bande à chaque micro-
 * ajustement de défilement, exactement la raison qui a fait doubler le seuil
 * de compaction du rail avant ce correctif (48 px pour compacter, 24 pour
 * rouvrir, `git blame` #5946). On RÉVÈLE la bande quand le grand rail est
 * DESCENDU JUSQU'À `revealRatio` de visibilité (ou moins), et on la RELÂCHE
 * seulement quand il est REMONTÉ JUSQU'À `releaseRatio` (ou plus) — la borne
 * de relâchement est INCLUSIVE, celle qui a exactement `visibleRatio ===
 * releaseRatio` relâche déjà.
 *
 * PURE, SANS DOM : ce fichier ne connaît ni `IntersectionObserver` ni
 * `scrollTop` — c'est `use-out-of-view.ts` qui les traduit en `visibleRatio`
 * et en appels à cette loi. Les seuils sont des PARAMÈTRES (avec des
 * défauts eux-mêmes littéraux ici, jamais lus d'une constante du domaine
 * Lentille) : c'est `src/lib/lens/pinned-rail.ts` qui les nomme pour cet
 * écran précis et les passe explicitement — cette loi resterait valide pour
 * tout autre accessoire épinglé du dépôt.
 */
export type OutOfViewInput = {
  /** L'état ACTUEL — la bande est-elle déjà épinglée ? */
  readonly pinned: boolean;
  /** Fraction visible du grand rail, 0 (hors champ) à 1 (entièrement visible). */
  readonly visibleRatio: number;
  /** Sous ce seuil de visibilité, la bande se révèle. */
  readonly revealRatio?: number;
  /** À partir de ce seuil de visibilité (inclus), la bande se relâche. */
  readonly releaseRatio?: number;
};

export function resolveOutOfView({
  pinned,
  visibleRatio,
  revealRatio = 0,
  releaseRatio = 0.25,
}: OutOfViewInput): boolean {
  return pinned ? visibleRatio < releaseRatio : visibleRatio <= revealRatio;
}
