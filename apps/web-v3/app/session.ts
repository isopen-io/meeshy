import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from './authentification/remise';

/**
 * CE QUE LE SERVEUR SAIT D'UN LECTEUR — deux cookies, et rien d'autre.
 *
 * La session de Meeshy vit dans `localStorage` (voir
 * `app/authentification/remise.ts`) ; le serveur n'y a pas accès. La remise
 * pose donc, À CÔTÉ, deux cookies qu'il peut lire :
 *
 *   • `meeshy_session` — un descripteur (rôle, identifiant) que l'application
 *     legacy écrit déjà pour son propre middleware. Il n'est ni signé ni
 *     `HttpOnly` : N'IMPORTE QUI PEUT LE FABRIQUER. On ne s'en sert donc que
 *     pour choisir quelle page servir, jamais pour accorder un accès ;
 *   • `meeshy_auth` — le jeton porteur lui-même, que la zone connectée présente
 *     à la passerelle. Lui n'accorde rien non plus : c'est la PASSERELLE qui le
 *     vérifie, à chaque appel. Un jeton forgé obtient un 401, pas une page.
 *
 * LA DISTINCTION EST LA PROPRIÉTÉ IMPORTANTE. `aUneSession` répond « quel écran
 * servir » ; `jetonDuLecteur` répond « au nom de qui demander ». Le premier peut
 * mentir sans conséquence — au pire une redirection vers un écran qui renverra
 * se connecter. Le second ne peut pas : il est opposé à la passerelle.
 */

const valeurDuCookie = (requete: Request, nom: string): string | null => {
  const entete = requete.headers.get('cookie');
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
    // Un pourcent isolé fait jeter `decodeURIComponent`. La valeur brute reste
    // servie : c'est à la passerelle de refuser un jeton qui n'en est pas un.
    return valeur;
  }
};

export const aUneSession = (requete: Request): boolean =>
  valeurDuCookie(requete, COOKIE_DE_SESSION) !== null;

export const jetonDuLecteur = (requete: Request): string | null =>
  valeurDuCookie(requete, COOKIE_DE_JETON);
