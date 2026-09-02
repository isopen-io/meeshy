import { echappe } from '@/app/socle';

import { documentDuSite } from '@/app/enveloppe/vue';

import type { Bascule, Champ, Ecran } from './contenu';
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
 * CE QUI REVIENT APRÈS UN REFUS. Le POST rend le formulaire À NOUVEAU, avec le
 * message et les valeurs déjà saisies — sauf le mot de passe, jamais renvoyé au
 * navigateur. Une redirection aurait perdu la saisie ; c'est la raison pour
 * laquelle l'échec est un 200 qui REND, et non un 303 qui renvoie.
 *
 * L'ALERTE PORTE `role="alert"` et le champ fautif n'est pas deviné : la
 * passerelle refuse la CHARGE, pas un champ. Désigner le mauvais champ serait
 * pire que n'en désigner aucun.
 */

const identifiantDuChamp = (nom: string): string => `champ-${nom}`;
const identifiantDeLAide = (nom: string): string => `aide-${nom}`;

const champ = (
  { nom, libelle, type, autocomplete, aide, longueurMinimale }: Champ,
  valeur: string,
): string => {
  const id = identifiantDuChamp(nom);
  return (
    '<div class="champ">' +
    `<label for="${id}">${echappe(libelle)}</label>` +
    `<input id="${id}" name="${echappe(nom)}" type="${type}" autocomplete="${echappe(autocomplete)}" required` +
    (longueurMinimale === undefined ? '' : ` minlength="${longueurMinimale}"`) +
    (aide === undefined ? '' : ` aria-describedby="${identifiantDeLAide(nom)}"`) +
    // Un mot de passe ne repart JAMAIS vers le navigateur, même le sien : il
    // traverserait le journal du serveur, le cache du navigateur et la barre
    // d'adresse d'un utilisateur qui recharge.
    (type === 'password' ? '' : ` value="${echappe(valeur)}"`) +
    '/>' +
    (aide === undefined
      ? ''
      : `<p class="aide" id="${identifiantDeLAide(nom)}">${echappe(aide)}</p>`) +
    '</div>'
  );
};

const bascule = ({ texte, libelle, href }: Bascule): string =>
  `<p>${texte === '' ? '' : `${echappe(texte)} `}<a href="${echappe(href)}">${echappe(libelle)}</a></p>`;

export type Etat = {
  readonly ecran: Ecran;
  readonly erreur: string | null;
  readonly valeurs: Readonly<Record<string, string>>;
  readonly retour: string | null;
};

const corpsDeLEcran = ({ ecran, erreur, valeurs, retour }: Etat): string =>
  '<div class="acces">' +
  `<h1>${echappe(ecran.titre)}</h1>` +
  `<p>${echappe(ecran.accroche)}</p>` +
  (erreur === null ? '' : `<p class="alerte" role="alert">${echappe(erreur)}</p>`) +
  `<form method="post" action="${echappe(ecran.action)}">` +
  (retour === null ? '' : `<input type="hidden" name="returnUrl" value="${echappe(retour)}"/>`) +
  ecran.champs.map((declaration) => champ(declaration, valeurs[declaration.nom] ?? '')).join('') +
  `<button class="action primaire" type="submit">${echappe(ecran.bouton)}</button>` +
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
