import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';

/**
 * **LE PRISME DU MEMBRE ADMINISTRÉ** (#6862, lot C) — le site UNIQUE qui
 * construit un prisme de lecture pour QUELQU'UN D'AUTRE.
 *
 * Partout ailleurs dans la v2, le prisme est celui du lecteur courant :
 * `useReaderLanguages()` (`lib/view/use-reader.ts`) lit la session et
 * n'accepte aucun autre sujet. Ici le lecteur et le sujet sont deux personnes
 * différentes — l'administrateur REGARDE, le membre est CELUI DONT ON REND LA
 * LANGUE. Servir le fil dans la langue de l'administrateur montrerait une
 * conversation que le membre n'a jamais vue : la même suite de messages,
 * traduite autrement, donc un autre sens et parfois un autre ton.
 *
 * ## LE RANG 4 EST OMIS, ET C'EST LE CŒUR DE CE MODULE
 *
 * Le Prisme a quatre rangs (CLAUDE.md § Prisme) : `systemLanguage`,
 * `regionalLanguage`, `customDestinationLanguage`, puis la LOCALE DE
 * L'APPAREIL. Les trois premiers sont des préférences applicatives du membre,
 * et `GET /admin/users/:id` les sert. Le quatrième est une propriété de
 * l'APPAREIL de qui lit — et l'appareil qui lit ici est celui de
 * l'administrateur.
 *
 * Y injecter `navigator.language` servirait donc une langue que le membre ne
 * voit PAS, en la faisant passer pour son rang 4. Un administrateur au
 * navigateur anglais verrait « Hello » là où le membre lit « Bonjour », et
 * rien ne le signalerait : ni erreur, ni champ vide — juste un fil plausible et
 * faux.
 *
 * **Un Prisme à trois rangs honnête vaut mieux qu'un quatrième rang faux.**
 * La passerelle persiste bien `User.deviceLocale` (règle 2 du Prisme), mais
 * `sanitizeUser` ne le sert pas : le jour où elle le servira, ce module aura
 * UN endroit où l'ajouter, et ce sera la locale DU MEMBRE.
 *
 * ## POURQUOI PAS `resolveReaderLanguages`, QUI ACCEPTE POURTANT UN USER ARBITRAIRE
 *
 * Parce qu'elle RETOMBE sur `READER_LANGUAGES` quand la descente rend un
 * tableau vide — et `READER_LANGUAGES` est construit avec `navigator.language`,
 * c'est-à-dire la locale de l'ADMINISTRATEUR. Ce repli réintroduirait, par la
 * porte de derrière, exactement ce que le paragraphe ci-dessus interdit, pour
 * tout membre qui n'a configuré AUCUNE langue.
 *
 * Et le défaut serait INVISIBLE à un témoin : sur une machine dont la locale
 * vaut déjà le défaut produit, les deux chemins rendent la MÊME chaîne. Un
 * témoin vert des deux côtés d'une mutation ne mesure pas la règle, il mesure
 * la machine. On appelle donc la descente NUE de `@meeshy/shared` —
 * `resolveUserLanguagesOrdered`, la même que `resolveReaderLanguages`
 * enveloppe, « sans fallback 'fr' » selon son propre doc-comment — et on pose
 * le repli produit ICI, où il est observable.
 */

/** Le défaut produit du Prisme quand aucune préférence n'est déclarée. */
const REPLI_PRODUIT = 'fr';

/** Les trois rangs applicatifs, tels que `GET /admin/users/:id` les sert. */
export type LanguesDuMembre = {
  readonly systemLanguage: string;
  readonly regionalLanguage: string;
  readonly customDestinationLanguage: string;
};

export type PrismeMembre = {
  /** Le prisme ORDONNÉ, normalisé et dédupliqué — ce que `served()` descend. */
  readonly languages: readonly string[];
  /** La face CADRAGE : dans quelle langue on ADRESSE le membre (libellés de jour). */
  readonly locale: string;
};

/**
 * Construit le prisme d'un membre à partir des trois rangs que la passerelle
 * sert. `resolveUserLanguagesOrdered` porte la DESCENTE (normalisation `'EN'`
 * → `'en'`, `'pt-BR'` → `'pt'`, déduplication, ordre) : la réécrire ici
 * produirait la jumelle divergente que le dépôt a déjà payée trois fois.
 *
 * SANS second argument — c'est le rang 4, la locale de l'appareil, et
 * l'appareil qui lit est celui de l'administrateur.
 */
export function prismeDuMembre(membre: LanguesDuMembre): PrismeMembre {
  const languages = resolveUserLanguagesOrdered({
    systemLanguage: membre.systemLanguage,
    regionalLanguage: membre.regionalLanguage,
    customDestinationLanguage: membre.customDestinationLanguage,
  });

  if (languages.length === 0) return { languages: [REPLI_PRODUIT], locale: REPLI_PRODUIT };

  return { languages, locale: languages[0] ?? REPLI_PRODUIT };
}
