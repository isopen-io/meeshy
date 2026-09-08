import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';

import { FIL } from '@/lib/contenu/fil';
import { nomDeLangue } from '@/lib/contenu/langues';

/**
 * LA PUCE DU PRISME — « AUTO · <langue> » — SITE UNIQUE, partagé par le fil
 * (`app/connecte/fil-vue.ts`) et par la liste des conversations
 * (`app/connecte/liste-vue.ts`, cible `chats.png`) : le même mot, dit de la
 * même façon sur les deux écrans qu'un tap sépare (charte règle 12).
 *
 * ELLE N'A PAS DE CHEVRON. La feuille des langues (`sheet:lang`) n'est pas
 * servie, et un chevron qui n'ouvre rien mentirait (charte règle 7 : un
 * contrôle existe s'il a un effet). C'est un `<p>`, jamais un `<a>` ni un
 * `<button>` — elle DIT ce qui est servi, elle n'ouvre rien.
 *
 * `langue` est le RANG 1 du prisme du lecteur, déjà résolu par l'appelant
 * (`etat.lecteur.langues[0]` sur le fil, `etat.langues[0]` sur la liste — la
 * même primauté, deux champs qui portent le même prisme ordonné). Ce module
 * ne fait aucune résolution : il rend ce qu'on lui donne.
 */
export const puceDuPrisme = (langue: string): string =>
  `<p class="puce prisme" title="${echappe(FIL.prismeTitre)}">${svgDuSprite('ph-translate')}${echappe(FIL.prisme)} · ${echappe(nomDeLangue(langue))}</p>`;

/**
 * LA RÉGION QUI LA PORTE — elle aussi d'un seul site : le conteneur `.puces`
 * était recopié MOT POUR MOT par les deux écrans, et le témoin de source
 * unique ne le voyait pas (il ne cherchait que `class="puce prisme"`, la
 * chaîne qui, elle, avait déménagé).
 *
 * C'EST UN `<div>`, PLUS UN `<nav aria-label="Affichage">`. Un point de repère
 * de navigation annonce au lecteur d'écran qu'il y a là de quoi naviguer ;
 * cette région ne contient qu'un `<p>` qui DIT la langue servie et n'ouvre
 * rien (§ « la puce n'a pas de chevron », ci-dessus). Le jour où la feuille des
 * langues sera servie, la région redeviendra un `<nav>` — avec ses liens.
 */
export const regionDuPrisme = (langue: string): string => `<div class="puces">${puceDuPrisme(langue)}</div>`;
