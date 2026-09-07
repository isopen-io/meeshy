import { DOCUMENT_LANGUAGE } from '@/app/document-language';

/**
 * LE NOM D'UNE LANGUE — UN seul site, pour les trois écrans qui en nomment une.
 *
 * IL EN EXISTAIT DEUX VERSIONS, et chacune portait sa raison écrite :
 *
 *   • `fil-vue.ts` et `story-vue.ts` rendaient le nom NATIF
 *     (`getLanguageInfo(code).nativeName` — « Español », « Deutsch », « 中文 »),
 *     au motif qu'écrire « traduit de l'anglais » demanderait « une table de
 *     noms de langues EN FRANÇAIS, c'est-à-dire une seconde table » ;
 *   • `commentaires-vue.ts` rendait le nom FRANÇAIS via `Intl.DisplayNames`
 *     — « espagnol », « allemand », « chinois » — avec l'élision qui va avec.
 *
 * Deux mots pour la même langue sur deux écrans de la même application, sous
 * une ligne de Prisme dont le rôle est précisément de DIRE dans quelle langue
 * on lit. Dimension 6 (même mot partout) et 11 (une source de vérité).
 *
 * LE NOM FRANÇAIS L'EMPORTE, et l'objection qui l'écartait ne tient pas :
 * `Intl.DisplayNames` EST cette table, fournie par la plateforme, sans une
 * ligne à maintenir et pour toutes les langues — pas une seconde table écrite
 * à la main. Le document de la v3 est en français (`DOCUMENT_LANGUAGE`), et un
 * nom de langue posé DANS une phrase française s'écrit en français :
 * « Traduit de Español » n'est pas une langue, c'est une faute. La cible
 * (`cible/story.png`, `cible/comments.png`) dessine d'ailleurs la forme
 * française — l'écart était assumé faute de table, il n'a plus lieu d'être.
 *
 * La langue de rendu est LUE (`DOCUMENT_LANGUAGE`), jamais écrite en dur : le
 * jour où la v3 sert une seconde langue d'interface, les noms suivent sans
 * qu'on ait à revenir ici.
 *
 * UN CODE VIDE NE SE NOMME PAS. Nommer un code inconnu « français » — ce que
 * fait `getLanguageInfo('')` — ferait dire à la ligne du Prisme « traduit du
 * français » d'un contenu dont on ignore la langue. La garde est au site
 * unique plutôt que chez trois appelants qui l'oublieraient chacun leur tour.
 *
 * Témoin : `__tests__/fil-source-unique.test.ts` § « le nom d'une langue ».
 */
export const nomDeLangue = (code: string): string => {
  const propre = code.trim();
  if (propre === '') return '';

  try {
    return new Intl.DisplayNames([DOCUMENT_LANGUAGE], { type: 'language' }).of(propre) ?? propre;
  } catch {
    // Un code mal formé fait LEVER `DisplayNames`. Le rendre tel quel est
    // honnête ; faire tomber le document ne l'est pas.
    return propre;
  }
};

/**
 * « de l'espagnol » · « du néerlandais » — la contraction française, une RÈGLE
 * et non une table.
 *
 * Le français élide devant une voyelle et contracte devant une consonne. Le nom
 * vient de `nomDeLangue`, qui les connaît toutes ; une table écrite à la main
 * serait fausse dès la huitième langue, et le produit en sert sept. Le `h`
 * reste hors du champ — aucune langue servie ne commence par un `h` muet en
 * français.
 *
 * Elle vit ICI, à côté du nom qu'elle décline, parce que les deux écrans qui
 * composent « traduit de … » la veulent tous les deux : c'est exactement la
 * jumelle que ce fichier existe pour empêcher.
 */
export const deLaLangue = (nom: string): string =>
  /^[aeiouyàâäéèêëîïôöùûü]/i.test(nom) ? `de l’${nom}` : `du ${nom}`;
