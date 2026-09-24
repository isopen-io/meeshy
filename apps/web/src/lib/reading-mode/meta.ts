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
 *   2026-08-18, étendue D-23/#5676 à TOUTE protection — flou, vue unique,
 *   éphémère, supprimé, pas seulement `isBlurred`) — révéler la langue
 *   d'origine d'un message protégé fuiterait une information ;
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
  /** `protectionOf(message, now) !== 'standard'` — tout message protégé, pas seulement flouté (D-23). */
  readonly isVeiled: boolean;
  readonly isLastInGroup: boolean;
  readonly hasReactions: boolean;
}): boolean {
  const showsFlags = input.hasTranslation && !input.isVeiled && input.isLastInGroup;
  return showsFlags || input.hasReactions;
}

/**
 * LA BANDE DE DRAPEAUX DU PIED — miroir de `BubbleContentBuilder.buildAvailableFlags`
 * (`.../Bubble/BubbleContentBuilder.swift:363-394`), D-23/#5676.
 *
 * L'ordre du PRISME, jamais l'ordre des traductions : la langue d'ORIGINE
 * d'abord (inconditionnelle — c'est TOUJOURS une lecture possible du message,
 * traduit ou non), puis chaque rang du prisme du lecteur DANS L'ORDRE.
 *
 * UNE ADAPTATION AU WEB (D-23 §1.4 point 5) : iOS ajoute la langue préférée
 * (rang 1) SANS condition — « le tap DEMANDE une traduction ». Le web n'a pas
 * ce transport : un drapeau sans traduction serait un contrôle INERTE (loi
 * 4, aucun effet au tap). Cette version gate donc TOUS les rangs du prisme
 * (pas seulement régional/custom/locale, rangs 2-4) par l'existence d'une
 * traduction — à lever avec le lot « demande de traduction ».
 *
 * La langue SERVIE n'a jamais de drapeau : elle est déjà à l'écran, un
 * bouton qui la basculerait sur elle-même n'aurait aucun effet observable.
 */
export function languageBand(input: {
  readonly originalLanguage: string;
  readonly preferredLanguages: readonly string[];
  /**
   * Les langues pour lesquelles une traduction existe — texte ET pièces
   * jointes (#5805) : `translatedLanguagesOf` (`view/message.ts`) en fait
   * l'union, miroir `BubbleContentBuilder.buildAvailableFlags` (`:376-379`).
   * Un vocal traduit SANS traduction texte alimente donc cette bande aussi.
   */
  readonly translations: readonly string[];
  readonly servedLanguage: string;
}): readonly string[] {
  const { originalLanguage, preferredLanguages, translations, servedLanguage } = input;
  const hasTranslation = (code: string): boolean => translations.includes(code);

  const seen = new Set<string>([originalLanguage]);
  const band: string[] = [originalLanguage];
  for (const code of preferredLanguages) {
    if (seen.has(code)) continue;
    if (!hasTranslation(code)) continue;
    seen.add(code);
    band.push(code);
  }
  return band.filter((code) => code !== servedLanguage);
}
