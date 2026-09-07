import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';

/**
 * LE SOCLE DES ÉCRANS DE RÉGLAGES — extrait de `reglages-vue.ts` (qui les
 * définissait seul) pour que `reglages-details-vue.ts` (les quatre nouveaux
 * écrans : confidentialité, médias, messages, notifications) les PARTAGE au
 * lieu de les recopier. Six modules de réglages avant cette extraction
 * auraient été sept occasions de faire diverger le même en-tête ; il y en a
 * maintenant dix, et un seul endroit où il vit.
 *
 * Rien ici ne décide RIEN — pas une route, pas une clé de préférence : ce sont
 * des primitives de PRÉSENTATION, au même titre que `vue.ts` › `carteVide`.
 */

export const enTete = ({
  titre,
  sous,
  retour,
  libelleDuRetour,
}: {
  readonly titre: string;
  readonly sous: string;
  readonly retour: string;
  readonly libelleDuRetour: string;
}): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="${echappe(retour)}" aria-label="${echappe(libelleDuRetour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(titre)}</h1>` +
  `<p class="sous">${echappe(sous)}</p>` +
  '</div>' +
  '</header>';

export const section = ({
  titre,
  corps,
  phrase = '',
}: {
  readonly titre: string;
  readonly corps: string;
  readonly phrase?: string;
}): string =>
  '<section>' +
  `<h2>${echappe(titre)}</h2>` +
  (phrase === '' ? '' : `<p class="phrase">${echappe(phrase)}</p>`) +
  corps +
  '</section>';

/**
 * L'AVIS DU POST — ce que le geste vient de faire, dit au RETOUR de la
 * redirection et jamais par le formulaire lui-même. `role="status"` le fait
 * annoncer sans voler le focus ; un `role="alert"` interromprait la lecture
 * pour un succès.
 */
export const avis = (phrase: string | null, echoue = false): string =>
  phrase === null
    ? ''
    : `<p class="avis" role="status">${svgDuSprite(echoue ? 'ph-x-circle' : 'ph-check-circle')}${echappe(phrase)}</p>`;

export const rangeeLien = ({
  href,
  quoi,
  sous = '',
  valeur = '',
  attention = false,
}: {
  readonly href: string;
  readonly quoi: string;
  readonly sous?: string;
  readonly valeur?: string;
  /** La rangée rouge — « Supprimer toutes mes données » : une action qui coûte, jamais un état. */
  readonly attention?: boolean;
}): string =>
  `<li><a class="rangee${attention ? ' rangee-attention' : ''}" href="${echappe(href)}">` +
  '<span class="dit">' +
  `<span class="quoi">${echappe(quoi)}</span>` +
  (sous === '' ? '' : `<span class="sous">${echappe(sous)}</span>`) +
  '</span>' +
  (valeur === '' ? '' : `<span class="valeur">${echappe(valeur)}</span>`) +
  svgDuSprite('ph-caret-right') +
  '</a></li>';

/**
 * UNE RANGÉE QUI SE LIT SANS SE TOUCHER. Le même dessin qu'un lien, sans le
 * chevron ni la cible : le chevron est ce qui ANNONCE qu'on peut aller
 * quelque part, et le laisser sur une ligne inerte serait exactement le
 * contrôle qui ment que la règle 7 interdit.
 */
export const rangeeDite = ({
  quoi,
  valeur,
  sous = '',
}: {
  readonly quoi: string;
  readonly valeur: string;
  readonly sous?: string;
}): string =>
  '<li><div class="rangee">' +
  '<span class="dit">' +
  `<span class="quoi">${echappe(quoi)}</span>` +
  (sous === '' ? '' : `<span class="sous">${echappe(sous)}</span>`) +
  '</span>' +
  `<span class="valeur">${echappe(valeur)}</span>` +
  '</div></li>';

export const rangs = (contenu: string, libelle: string): string =>
  `<ul class="rangs" aria-label="${echappe(libelle)}">${contenu}</ul>`;

/**
 * UN COMMUTATEUR — un `role="switch"` qui porte son propre `<form
 * method="post">`, sans attribut `action` : le geste marche SANS JavaScript,
 * la porte de l'écran hôte le traite en Post/Redirect/Get. Site UNIQUE,
 * partagé par `/notifications/preferences` (`prefs-vue.ts`) et
 * `/settings/privacy` (`reglages-details-vue.ts`) — deux formes du MÊME
 * contrôle auraient été la jumelle que la charte interdit.
 *
 * `aria-checked` REFLÈTE TOUJOURS ce que le serveur a SERVI, jamais un espoir
 * local ; le mot « Activé »/« Désactivé » voyage dans un `<span
 * class="hors-ecran">` pour qu'un lecteur d'écran, un daltonien et un écran au
 * soleil lisent la même chose que la couleur ne fait que CONFIRMER.
 */
export const commutateur = ({
  cle,
  libelle,
  actif,
  libelleActif,
  libelleInactif,
  apres = '',
}: {
  readonly cle: string;
  readonly libelle: string;
  readonly actif: boolean;
  readonly libelleActif: string;
  readonly libelleInactif: string;
  readonly apres?: string;
}): string =>
  '<li>' +
  '<form class="bascule" method="post">' +
  `<input type="hidden" name="cle" value="${echappe(cle)}">` +
  `<input type="hidden" name="valeur" value="${actif ? 'false' : 'true'}">` +
  `<button type="submit" class="commutateur" role="switch" aria-checked="${actif ? 'true' : 'false'}">` +
  `<span class="libelle">${echappe(libelle)}</span>` +
  `<span class="piste" aria-hidden="true"><span class="pouce"></span></span>` +
  `<span class="hors-ecran">${actif ? echappe(libelleActif) : echappe(libelleInactif)}</span>` +
  '</button>' +
  '</form>' +
  apres +
  '</li>';
