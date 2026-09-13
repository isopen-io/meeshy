/**
 * **L'ORIGINE PUBLIQUE D'UN LIEN PARTAGÉ** (#6361) — un module SANS dépendance,
 * pour que l'en-tête de la liste des conversations (l'écran d'accueil) puisse
 * composer ses liens sans emporter le port des liens de partage.
 *
 * Dans une coque, `location.origin` est une origine virtuelle
 * (`https://localhost`) : un lien composé dessus ne s'ouvrirait chez personne.
 * La passerelle nomme l'environnement (`gate.meeshy.me`,
 * `gate.staging.meeshy.me`) et le site web vit sur le même domaine sans
 * `gate.` — miroir `MeeshyConfig.webOrigin` d'iOS. Une passerelle relative ou
 * locale (développement) garde l'origine de la page.
 */

const GATEWAY_ORIGIN = /^https:\/\/gate\.([a-z0-9.-]+?)\/?$/i;

export function webOriginOf(apiBase: string, fallbackOrigin: string): string {
  const host = GATEWAY_ORIGIN.exec(apiBase.trim())?.[1];
  return host === undefined ? fallbackOrigin : `https://${host}`;
}
