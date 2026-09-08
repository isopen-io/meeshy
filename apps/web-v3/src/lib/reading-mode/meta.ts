/**
 * LA LIGNE BASSE DE LA RANGÉE PLATE — miroir de `FocalMetaColumn.mountsBottomLine`
 * (iOS, `Focal/Row/FocalMetaColumn.swift:62-68`, #5135/#3919).
 *
 * La ligne basse ne porte plus QUE les drapeaux et les réactions — l'heure et
 * la coche d'envoi ont leur propre colonne méta, accolée à CHAQUE rangée
 * (`focal-row.tsx`, correction de revue #5566 défaut 6). Sans ni l'un ni
 * l'autre, cette ligne n'a plus rien à dire et ne doit RIEN monter : c'est le
 * blanc que la directive porteur du 2026-09-04 vient chercher (« ce qui
 * permet d'éviter quelques lignes blanches inutiles »).
 *
 * DEUX gardes NOMMÉES, portées ICI, pas laissées derrière (même documentation
 * que la source iOS) :
 * - **jamais de drapeau en clair sur un message VOILÉ** (revue adversariale
 *   2026-08-18) — révéler la langue d'origine d'un message protégé fuiterait
 *   une information ;
 * - **un seul jeu de drapeaux par groupe, sur son DERNIER message** (#3919,
 *   directive porteur 2026-08-26) — `isLastInGroup` est `place.tail`
 *   (`grouping.ts`), la MÊME primitive qui gouverne déjà l'identité de la
 *   bulle historique.
 *
 * Les réactions, elles, restent HORS voile (parité bulle historique) : un
 * message protégé sur lequel on a réagi garde sa ligne.
 */
export function mountsBottomLine(input: {
  readonly hasTranslation: boolean;
  readonly isBlurred: boolean;
  readonly isLastInGroup: boolean;
  readonly hasReactions: boolean;
}): boolean {
  const showsFlags = input.hasTranslation && !input.isBlurred && input.isLastInGroup;
  return showsFlags || input.hasReactions;
}
