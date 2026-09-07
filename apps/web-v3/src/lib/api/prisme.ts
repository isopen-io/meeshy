import type { Langue, Traduction } from './modele';

/**
 * LE PRISME LINGUISTIQUE — la descente, ecrite UNE fois.
 *
 * Projection de `resolvePrismTranslation()`
 * (`packages/shared/utils/conversation-helpers.ts`), la source de verite du
 * depot. Elle est reproduite ici parce que le POC ne construit pas
 * `@meeshy/shared` ; elle doit disparaitre au profit d'un import le jour ou ce
 * POC devient un produit.
 *
 * LA REGLE, et la facon dont on la rate :
 *
 * On parcourt les langues du LECTEUR dans l'ORDRE. La premiere servie gagne —
 * soit par une traduction, soit parce que le message est DEJA ecrit dedans.
 *
 * Ce qu'il ne faut JAMAIS ecrire : « si la langue d'origine appartient au
 * prisme, afficher l'original ». Cette formulation retrograde la langue
 * PRIMAIRE des que la langue d'origine occupe un rang inferieur — ce que
 * produit mecaniquement la locale appareil (rang 4). Prisme ['fr','en'],
 * message anglais, traduction francaise disponible : la reponse est
 * « Bonjour », jamais « Hello ».
 *
 * `null` ⇒ servir l'original.
 */
export function resolutionDuPrisme(
  langues: readonly Langue[],
  langueOriginale: Langue,
  traductions: readonly Traduction[],
): { langue: Langue; texte: string } | null {
  for (const langue of langues) {
    // Le message est deja ecrit dans cette langue : elle est servie A SON RANG.
    if (langue === langueOriginale) return null;
    const traduction = traductions.find((t) => t.langue === langue);
    if (traduction) return { langue, texte: traduction.texte };
  }
  return null;
}

/**
 * Le texte a AFFICHER, et la langue dans laquelle il est servi. Un appelant qui
 * doit seulement peindre lit `texte` ; un appelant qui doit DIRE la langue
 * (pastille, aria-label, attribut lang) lit `langue` — c'est la reecriture de
 * cette boucle par chaque appelant qui avait produit trois familles de
 * resolveurs divergentes dans la v3.
 */
export function servi(
  langues: readonly Langue[],
  langueOriginale: Langue,
  traductions: readonly Traduction[],
  original: string,
): { texte: string; langue: Langue; traduit: boolean } {
  const resolution = resolutionDuPrisme(langues, langueOriginale, traductions);
  if (resolution === null) return { texte: original, langue: langueOriginale, traduit: false };
  return { texte: resolution.texte, langue: resolution.langue, traduit: true };
}
