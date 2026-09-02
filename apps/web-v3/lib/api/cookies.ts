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
