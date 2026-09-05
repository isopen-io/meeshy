import { echappe } from '@/app/socle';

import { documentDuSite } from '@/app/enveloppe/vue';
import type { Refus } from '@/lib/api/authentification';

import type { Bascule, Champ, Ecran, Pastille, Segment, Selecteur } from './contenu';
import { FEUILLE_AUTHENTIFICATION } from './feuille';

/**
 * LES DEUX ÉCRANS D'ACCÈS, rendus par le SERVEUR et sans une ligne de
 * JavaScript.
 *
 * Un `<form method="post">` est un contrôle du navigateur : il fonctionne sans
 * JS, il est annoncé correctement par un lecteur d'écran, il déclenche le
 * gestionnaire de mots de passe du système. Le legacy monte à la place un
 * formulaire React de 221 lignes qui fait le même POST — plus 101 Ko de
 * runtime avant que le premier champ ne soit saisissable.
 *
 * UN `<select>` EST LE MÊME GENRE DE CONTRÔLE. 245 pays et 83 langues, rendus
 * par le navigateur, avec sa recherche au clavier, son affichage plein écran
 * sur mobile et son annonce par le lecteur d'écran — pour 0 Ko de JavaScript.
 * Une liste déroulante écrite à la main aurait coûté un moteur, et perdu les
 * trois.
 *
 * CE QUI REVIENT APRÈS UN REFUS. Le POST rend le formulaire À NOUVEAU, avec le
 * message et les valeurs déjà saisies — sauf le mot de passe, jamais renvoyé au
 * navigateur. Une redirection aurait perdu la saisie ; c'est la raison pour
 * laquelle l'échec est un 400 qui REND, et non un 303 qui renvoie.
 *
 * OÙ SE POSE LE MESSAGE. Il s'est longtemps posé AU-DESSUS du formulaire, en
 * `role="alert"`, avec cette raison : « la passerelle refuse la CHARGE, pas un
 * champ ; désigner le mauvais champ serait pire que n'en désigner aucun ». La
 * raison tient toujours — elle a seulement cessé d'être vraie de tous les
 * refus : la route d'inscription NOMME son champ (`field`, `code`,
 * `violations[].path`, traduits une seule fois dans `lib/api/
 * authentification.ts`). Quand le refus nomme un champ, le message va SOUS ce
 * champ, qui porte `aria-invalid` et le désigne par `aria-describedby` ; quand
 * il n'en nomme aucun, l'alerte globale reste. La règle ne s'est pas inversée,
 * elle s'est restreinte à ce qu'elle gardait vraiment.
 */

const identifiantDuChamp = (nom: string): string => `champ-${nom}`;
const identifiantDeLAide = (nom: string): string => `aide-${nom}`;
const identifiantDuRefus = (nom: string): string => `refus-${nom}`;

/**
 * L'ORDRE DE `aria-describedby` EST L'ORDRE DE LECTURE. Le refus d'abord :
 * c'est ce qui vient de changer et ce qui bloque, l'aide ne fait que rappeler
 * la règle. Une seule chaîne, jamais deux attributs.
 */
const decritPar = (nom: string, aide: boolean, enDefaut: boolean): string => {
  const cibles = [
    ...(enDefaut ? [identifiantDuRefus(nom)] : []),
    ...(aide ? [identifiantDeLAide(nom)] : []),
  ];
  return cibles.length === 0 ? '' : ` aria-describedby="${cibles.join(' ')}"`;
};

const option = ({ valeur, libelle }: { valeur: string; libelle: string }, choisie: string): string =>
  `<option value="${echappe(valeur)}"${valeur === choisie ? ' selected' : ''}>${echappe(libelle)}</option>`;

/**
 * Le libellé du sélecteur d'indicatif est HORS ÉCRAN, et non absent : le
 * libellé visible de la ligne dit « Téléphone », ce qui nomme le champ de
 * droite ; le `<select>` de gauche a besoin de son propre nom pour un lecteur
 * d'écran, et l'écrire en clair ferait deux étiquettes pour une question.
 */
const selecteur = (
  { nom, libelle, options }: Selecteur,
  choisie: string,
  horsEcran: boolean,
): string => {
  const id = identifiantDuChamp(nom);
  return (
    `<label${horsEcran ? ' class="hors-ecran"' : ''} for="${id}">${echappe(libelle)}</label>` +
    `<select id="${id}" name="${echappe(nom)}">` +
    options()
      .map((choix) => option(choix, choisie))
      .join('') +
    '</select>'
  );
};

const entree = (
  { nom, type, autocomplete, aide, longueurMinimale, requis }: Champ,
  valeur: string,
  refus: Refus | null,
): string => {
  const enDefaut = refus !== null && refus.champ === nom;
  return (
    `<input id="${identifiantDuChamp(nom)}" name="${echappe(nom)}" type="${type}" autocomplete="${echappe(autocomplete)}"` +
    (requis === false ? '' : ' required') +
    (longueurMinimale === undefined ? '' : ` minlength="${longueurMinimale}"`) +
    (enDefaut ? ' aria-invalid="true"' : '') +
    decritPar(nom, aide !== undefined, enDefaut) +
    // Un mot de passe ne repart JAMAIS vers le navigateur, même le sien : il
    // traverserait le journal du serveur, le cache du navigateur et la barre
    // d'adresse d'un utilisateur qui recharge.
    (type === 'password' ? '' : ` value="${echappe(valeur)}"`) +
    '/>'
  );
};

const messageDuRefus = (nom: string, { message, recours }: Refus): string =>
  `<p class="refus" id="${identifiantDuRefus(nom)}">${echappe(message)}` +
  (recours === null
    ? ''
    : ` <a href="${echappe(recours.href)}">${echappe(recours.libelle)}</a>`) +
  '</p>';

const champ = (
  declaration: Champ,
  valeurs: Readonly<Record<string, string>>,
  refus: Refus | null,
): string => {
  const { nom, libelle, aide, devant } = declaration;
  const saisie = entree(declaration, valeurs[nom] ?? '', refus);
  return (
    '<div class="champ">' +
    `<label for="${identifiantDuChamp(nom)}">${echappe(libelle)}</label>` +
    (devant === undefined
      ? saisie
      : `<div class="duo">${selecteur(devant, valeurs[devant.nom] ?? '', true)}${saisie}</div>`) +
    (refus !== null && refus.champ === nom ? messageDuRefus(nom, refus) : '') +
    (aide === undefined
      ? ''
      : `<p class="aide" id="${identifiantDeLAide(nom)}">${echappe(aide)}</p>`) +
    '</div>'
  );
};

const pastille = ({ avant, selecteur: choix, apres }: Pastille, choisie: string): string =>
  `<p class="pastille"><label for="${identifiantDuChamp(choix.nom)}">${echappe(avant)} ` +
  `<select id="${identifiantDuChamp(choix.nom)}" name="${echappe(choix.nom)}">` +
  choix
    .options()
    .map((option_) => option(option_, choisie))
    .join('') +
  `</select>${apres === '' ? '' : ` ${echappe(apres)}`}</label></p>`;

const segment = ({ texte, href }: Segment): string =>
  href === undefined ? echappe(texte) : `<a href="${echappe(href)}">${echappe(texte)}</a>`;

const bascule = ({ texte, libelle, href }: Bascule): string =>
  `<p>${texte === '' ? '' : `${echappe(texte)} `}<a href="${echappe(href)}">${echappe(libelle)}</a></p>`;

export type Etat = {
  readonly ecran: Ecran;
  readonly refus: Refus | null;
  readonly valeurs: Readonly<Record<string, string>>;
  readonly retour: string | null;
};

/** L'alerte globale ne sert QUE les refus qui ne nomment aucun champ. */
const alerte = (refus: Refus | null): string =>
  refus === null || refus.champ !== null
    ? ''
    : `<p class="alerte" role="alert">${echappe(refus.message)}</p>`;

const corpsDeLEcran = ({ ecran, refus, valeurs, retour }: Etat): string =>
  '<div class="acces">' +
  `<h1>${echappe(ecran.titre)}</h1>` +
  `<p>${echappe(ecran.accroche)}</p>` +
  alerte(refus) +
  `<form method="post" action="${echappe(ecran.action)}">` +
  (retour === null ? '' : `<input type="hidden" name="returnUrl" value="${echappe(retour)}"/>`) +
  ecran.champs.map((declaration) => champ(declaration, valeurs, refus)).join('') +
  (ecran.pastille === undefined
    ? ''
    : pastille(ecran.pastille, valeurs[ecran.pastille.selecteur.nom] ?? '')) +
  `<button class="action primaire" type="submit">${echappe(ecran.bouton)}</button>` +
  // SOUS le bouton, et dans le formulaire : la phrase qualifie le geste qu'on
  // vient de proposer, et l'en séparer par la fin du formulaire la ferait lire
  // comme une note de bas de page.
  (ecran.conditions === undefined
    ? ''
    : `<p class="conditions">${ecran.conditions.map(segment).join('')}</p>`) +
  '</form>' +
  '<div class="apres">' +
  bascule(ecran.bascule) +
  (ecran.oubli === undefined ? '' : bascule(ecran.oubli)) +
  '</div>' +
  '</div>';

export const documentDeLEcran = (etat: Etat): string =>
  documentDuSite({
    titre: `${etat.ecran.titre} — Meeshy`,
    description: etat.ecran.accroche,
    feuille: FEUILLE_AUTHENTIFICATION,
    corps: corpsDeLEcran(etat),
    retour: true,
  });

/**
 * La réponse d'un écran d'accès, en GET comme après un refus.
 *
 * `no-store` : le document porte les valeurs qu'on vient de saisir, et le
 * suivant sur le même appareil ne doit pas les retrouver au bouton « précédent ».
 * `noindex` : une page de connexion n'a rien à faire dans un index, et son
 * `?retour=` encore moins.
 */
export const rendLEcran = (etat: Etat, statut: number): Response =>
  new Response(documentDeLEcran(etat), {
    status: statut,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, private',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
