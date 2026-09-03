/**
 * LES DEUX COOKIES DU MEMBRE, et la LECTURE d'un cookie — le site unique de
 * cette forme, partagé par le serveur (`app/session.ts`, qui choisit l'écran
 * et présente le jeton) et par le navigateur (`lib/realtime/participate.ts`,
 * qui s'authentifie au socket avec le même jeton).
 *
 * Ils vivaient dans `app/authentification/remise.ts`, qui les POSE — et qui,
 * pour composer son document, lit la table de jetons sur le disque : un module
 * de navigateur ne peut pas l'importer. Les noms sont donc ici, avec leur
 * raison ; la remise les ré-exporte et garde son récit.
 *
 * `meeshy_session` est un descripteur (rôle, identifiant) que N'IMPORTE QUI
 * peut fabriquer : il choisit quel écran servir, jamais ce qu'on a le droit de
 * voir. `meeshy_auth` est le jeton porteur, opposé à la passerelle à chaque
 * appel — un jeton forgé obtient un 401, pas une page. Ni l'un ni l'autre
 * n'est `HttpOnly` : `clearAllSessions()` du legacy efface par
 * `document.cookie` tout nom commençant par `meeshy`, et un cookie `HttpOnly`
 * survivrait à la déconnexion — une demi-session laissée derrière.
 */
export const COOKIE_DE_SESSION = 'meeshy_session';

export const COOKIE_DE_JETON = 'meeshy_auth';

/**
 * LE THÈME CHOISI SUR CET APPAREIL — un cookie, et non `localStorage`.
 *
 * Il fallait choisir, parce que `/settings/application` doit avoir un EFFET
 * sans une ligne de JavaScript de page (charte règle 7, et le gate à 0 Ko de JS
 * des écrans de la zone). Un formulaire ne peut écrire que ce que le SERVEUR
 * pose, et le serveur ne peut poser qu'un cookie : c'est le seul magasin que
 * les deux bouts partagent.
 *
 * `localStorage` reste LU par le script de tête, et c'est délibéré : la webapp
 * legacy y écrit son propre choix (`meeshy-theme`), et un lecteur qui a réglé
 * son thème là-bas le retrouve ici. Le script MIROITE en retour ce qu'il
 * résout, si bien que le legacy suit un choix fait dans la v3. Le seul cas où
 * les deux divergent est un réglage fait dans le legacy APRÈS un réglage fait
 * ici — le cookie l'emporte — et il disparaît avec le legacy.
 *
 * IL PORTE TROIS VALEURS — `light`, `dark`, `system` — et son ABSENCE en est
 * une quatrième, qui ne veut pas dire la même chose que `system` : absent, rien
 * n'a été choisi ICI (on suit alors le legacy, puis l'OS) ; `system`, le
 * lecteur a CHOISI de suivre son système. Effacer le cookie pour dire le second
 * ne marchait pas — le script recopie le cookie dans `localStorage`, et le
 * repli y relisait le choix précédent (voir `app/theme-script.tsx`).
 */
export const COOKIE_DE_THEME = 'meeshy_theme';

/**
 * La valeur d'un cookie dans un en-tête `Cookie` — celui d'une requête, ou
 * `document.cookie`, qui ont la même forme. Un pourcent isolé fait jeter
 * `decodeURIComponent` : la valeur brute reste servie, c'est à la passerelle
 * de refuser un jeton qui n'en est pas un.
 */
export const valeurDuCookie = (entete: string | null, nom: string): string | null => {
  if (entete === null) return null;

  const prefixe = `${nom}=`;
  const morceau = entete
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefixe));
  if (morceau === undefined) return null;

  const valeur = morceau.slice(prefixe.length);
  if (valeur === '') return null;

  try {
    return decodeURIComponent(valeur);
  } catch {
    return valeur;
  }
};
