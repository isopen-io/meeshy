import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';

import type { Lecteur } from '@/lib/api/compte';
import { ESPACE, RANGEES_DE_L_ESPACE } from '@/lib/contenu/espace';

/**
 * L'ESPACE MEMBRE — les deux raccourcis d'en-tête et la feuille qu'ils
 * ouvrent, servis par le TABLEAU DE BORD (`/`) et par `/chats`.
 *
 * UN ÉTAT D'ADRESSE, PAS UN ÉTAT DE CLIENT. `?espace` est ce qui rend la
 * feuille ; le lien de retour est l'adresse NUE de l'écran hôte. C'est le même
 * mécanisme que `?profil=`, `?nouvelle` et `/links?nouveau` — et c'est ce qui
 * la fait marcher sans un octet de JavaScript, se partager, et revenir en
 * arrière comme n'importe quelle page.
 */

/** Le paramètre qui ouvre la feuille. Un seul site le nomme. */
export const PARAMETRE_DE_L_ESPACE = 'espace';

export const espaceDemande = (requete: Request): boolean =>
  new URL(requete.url).searchParams.has(PARAMETRE_DE_L_ESPACE);

/** L'adresse qui OUVRE la feuille depuis l'écran hôte. */
export const versLEspace = (hote: string): string => `${hote}?${PARAMETRE_DE_L_ESPACE}`;

/**
 * LES DEUX RACCOURCIS D'EN-TÊTE — gauche vers le fil, droite vers l'espace
 * membre (`MeeshyWebV3.dc.html:550-556`, table de navigation `:867-868`).
 *
 * **CHACUN EST UN `<a href>` VERS UNE ROUTE SERVIE**, et c'est le mot de la
 * planche. Un raccourci qui ouvrirait `/communities` sortirait de la zone v3
 * en silence : le lecteur atterrirait sur le legacy sans que rien ne le dise.
 *
 * **CE N'EST PLUS UN RAIL `position:fixed`** (correction de revue de #5164,
 * charte règle 8 b/c) — c'était le `<nav class="flottantes">` d'origine, DEUX
 * ronds ancrés au coin bas de la fenêtre, quel que soit le défilement. La
 * mesure a d'abord trouvé le rail couvrant le pied de l'enveloppe sur
 * `/chats` (le rail y a été remplacé par ce même `raccourcisEntete`) ; une
 * seconde mesure, à la revue suivante, l'a trouvé couvrant la carte de
 * conversation « mise en avant » du TABLEAU DE BORD dès que la liste sert
 * plus de deux lignes — À N'IMPORTE QUEL DÉFILEMENT, pas seulement au repos :
 * un rond `fixed` reste ancré au coin de la fenêtre quoi que le document
 * fasse en dessous, et RÉSERVER UNE BANDE en fin de flux (l'ancienne
 * `FEUILLE_DES_FLOTTANTES`) ne protège que le DÉFILEMENT TOUT EN BAS — dès que
 * le contenu réel dépasse une fenêtre, le bas de l'écran AU REPOS (défilement
 * à 0) montre déjà du contenu réel, jamais la bande réservée. La seule sortie
 * qui tienne à N'IMPORTE QUELLE longueur de contenu est de sortir les deux
 * cibles du flottant : `raccourcisEntete` les pose DANS le flux, en tête de
 * document, où rien ne peut plus jamais les faire recouvrir un contrôle.
 *
 * **UN SEUL SITE POUR LES DEUX ÉCRANS.** `/chats` (`liste-vue.ts`) et le
 * TABLEAU DE BORD (`vue.ts`) l'appellent tous deux — les mêmes destinations,
 * les mêmes noms accessibles (`ESPACE.fil`, `ESPACE.ouvrir`) qu'avant : un
 * lecteur qui cherche « Ouvrir l'espace membre » le trouve, que l'écran ait
 * jadis rendu un rond ou toujours rendu ce raccourci.
 *
 * LE `<nav>` EST NOMMÉ. Deux liens sans texte visible, posés en tête de
 * document, ne se rattachent à rien : sans son nom, un lecteur d'écran annonce
 * deux liens orphelins. Chacun porte le sien — `aria-label`, puisque le
 * glyphe est décoratif.
 */
export const raccourcisEntete = (hote: string): string =>
  `<nav class="raccourcis-entete" aria-label="${echappe(ESPACE.titre)}">` +
  `<a class="raccourci" href="/feed" aria-label="${echappe(ESPACE.fil)}">${svgDuSprite('ph-squares-four')}</a>` +
  `<a class="raccourci" href="${echappe(versLEspace(hote))}" aria-label="${echappe(ESPACE.ouvrir)}">${svgDuSprite('ph-user-circle')}</a>` +
  '</nav>';

/**
 * COMMENT LE LECTEUR EST NOMMÉ SOUS LE TITRE — le nom affiché, sinon le prénom,
 * sinon le pseudonyme, sinon la phrase de repli.
 *
 * Le pseudonyme S'AJOUTE quand il existe ET qu'il ne fait pas doublon : « Amina
 * Diallo · @amina », mais « @amina » seul si c'est tout ce que la passerelle a
 * servi. Une ligne qui dirait « @amina · @amina » n'annonce rien deux fois.
 */
export const nomDeLEspace = (lecteur: Lecteur | null): string => {
  if (lecteur === null) return ESPACE.sansNom;
  const nomme = lecteur.nomAffiche ?? lecteur.prenom ?? null;
  const poigne = lecteur.pseudonyme === null ? null : `@${lecteur.pseudonyme}`;
  if (nomme === null) return poigne ?? ESPACE.sansNom;
  return poigne === null ? nomme : `${nomme} · ${poigne}`;
};

const rangee = ({
  glyphe,
  href,
  quoi,
  sous,
}: {
  readonly glyphe: string;
  readonly href: string;
  readonly quoi: string;
  readonly sous: string;
}): string =>
  `<li><a class="rangee" href="${echappe(href)}">` +
  `<span class="tuile" aria-hidden="true">${svgDuSprite(glyphe)}</span>` +
  '<span class="dit">' +
  `<span class="quoi">${echappe(quoi)}</span>` +
  `<span class="sous">${echappe(sous)}</span>` +
  '</span>' +
  svgDuSprite('ph-caret-right') +
  '</a></li>';

/**
 * LA FEUILLE — trois chemins la ferment sans un octet de JavaScript (la croix,
 * le voile, la poignée). Échap s'y ajoute sur `/chats` SEUL, qui sert déjà son
 * module (`lib/realtime/plein-ecran.ts` élève tout `dialog[open][data-retour]`) ;
 * le tableau de bord n'expédie aucun script et n'en chargera pas un pour une
 * touche. Le détail de l'arbitrage est dans `espace-feuille.ts`.
 *
 * `hote` est l'adresse NUE de l'écran : c'est là que les trois chemins ramènent,
 * et c'est ce qui fait du retour arrière du navigateur un quatrième chemin.
 */
export const feuilleDeLEspace = ({ lecteur, hote }: { readonly lecteur: Lecteur | null; readonly hote: string }): string =>
  `<a class="voile" href="${echappe(hote)}" aria-label="${echappe(ESPACE.fermer)}"></a>` +
  `<dialog class="espace" open aria-modal="true" aria-labelledby="titre-de-l-espace" data-retour="${echappe(hote)}">` +
  `<a class="poignee" href="${echappe(hote)}" aria-label="${echappe(ESPACE.fermer)}"></a>` +
  '<div class="tete">' +
  '<div class="dit">' +
  `<h2 id="titre-de-l-espace">${echappe(ESPACE.titre)}</h2>` +
  `<span class="sous">${echappe(nomDeLEspace(lecteur))}</span>` +
  '</div>' +
  `<a class="fermer" href="${echappe(hote)}" aria-label="${echappe(ESPACE.fermer)}">${svgDuSprite('ph-x')}</a>` +
  '</div>' +
  `<ul class="rangs" aria-label="${echappe(ESPACE.titre)}">` +
  RANGEES_DE_L_ESPACE.map(rangee).join('') +
  '</ul>' +
  formulaireDeSortie() +
  '</dialog>';

/**
 * LE CONTRÔLE DE SORTIE (#5095) — un `<form method="post">` RÉEL, jamais un
 * lien : une déconnexion est une MUTATION (elle expire des cookies), et
 * `app/provenance.ts` ne garde que les formulaires. `<button type="submit">`
 * est un contrôle NATIF — atteignable au clavier et au lecteur d'écran par
 * construction, sans `tabindex` ni `role` à poser.
 *
 * LE CHAMP CACHÉ `session` PART VIDE : le formulaire fonctionne SANS
 * JavaScript (§ 2.1 de la spécification — l'appel part alors avec le seul
 * jeton porteur). `lib/realtime/deconnexion.ts` le REMPLIT à la soumission
 * depuis `localStorage`, en amélioration progressive.
 */
const formulaireDeSortie = (): string =>
  '<form class="sortie" method="post" action="/deconnexion">' +
  '<input type="hidden" name="session" value="" />' +
  `<button type="submit">${echappe(ESPACE.deconnecter)}</button>` +
  '</form>';
