import { COOKIE_DE_JETON, COOKIE_DE_SESSION, valeurDuCookie } from '@/lib/api/cookies';
import { COOKIE_DE_FUSEAU, fuseauPlausible } from '@/lib/temps';

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

const valeurDeLaRequete = (requete: Request, nom: string): string | null =>
  valeurDuCookie(requete.headers.get('cookie'), nom);

export const aUneSession = (requete: Request): boolean =>
  valeurDeLaRequete(requete, COOKIE_DE_SESSION) !== null;

export const jetonDuLecteur = (requete: Request): string | null =>
  valeurDeLaRequete(requete, COOKIE_DE_JETON);

/**
 * LE FUSEAU DU LECTEUR (décision porteur 2026-09-06, `lib/temps.ts`) — posé
 * par le module de participation, LU ici pour servir l'heure de réception
 * exacte dès le premier octet. Comme `meeshy_session`, il peut mentir sans
 * conséquence : au pire une heure dans un autre fuseau, que le module recale.
 * La forme est filtrée (`fuseauPlausible`) ; la validité, c'est `heureExacte`
 * qui la tranche en rendant '' sur un fuseau que l'ICU refuse.
 */
export const fuseauDuLecteur = (requete: Request): string | null => {
  const brut = valeurDeLaRequete(requete, COOKIE_DE_FUSEAU);
  if (brut === null) return null;
  const fuseau = decodeURIComponent(brut);
  return fuseauPlausible(fuseau) ? fuseau : null;
};

/**
 * LA REQUÊTE EST-ELLE ARRIVÉE EN HTTPS ? — la même dérivation que
 * `app/(public)/chat/[lien]/route.ts` avant qu'elle déménage ici (#5095) :
 * un cookie posé par le serveur porte `Secure` seulement quand le canal l'est,
 * et c'est un fait de la REQUÊTE, pas de l'écran. Traefik parle en clair au
 * conteneur ; `X-Forwarded-Proto` est ce qu'il relaie du canal réel.
 */
export const estSecurisee = (requete: Request): boolean =>
  new URL(requete.url).protocol === 'https:' ||
  (requete.headers.get('x-forwarded-proto') ?? '').split(',')[0]?.trim() === 'https';
