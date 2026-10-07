import type { TrustProxySetting } from '../../config/trust-proxy';

/**
 * **L'adresse d'un socket est celle que NOTRE proxy atteste — la même que
 * `request.ip` en REST** (audit #9608, P3).
 *
 * `socket.handshake.address` est l'adresse de la connexion TCP : derrière
 * Traefik, celle du conteneur Traefik, IDENTIQUE pour tous les clients. Le
 * limiteur de débit de l'authentification manuelle comptait donc toute la
 * planète dans un seul seau.
 *
 * La résolution reproduit celle de Fastify (`proxy-addr`) sous le MÊME réglage
 * (`resolveTrustProxy`, `TRUST_PROXY_HOPS`) : la chaîne est
 * `[adresse TCP, …X-Forwarded-For lu de droite à gauche]`, et l'on remonte tant
 * que le maillon `i` est de confiance (`trust(adresse, i)`). Un client peut
 * écrire la GAUCHE de la chaîne, jamais le maillon que notre proxy a posé. Le
 * témoin compare la sortie à `request.ip` d'un vrai Fastify, cas par cas.
 */
export function attestedSocketAddress(
  handshake: { readonly address?: string; readonly headers: Record<string, string | string[] | undefined> },
  trust: TrustProxySetting
): string | undefined {
  const remote = handshake.address;
  if (!remote) return undefined;
  if (trust === false) return remote;

  const header = handshake.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header.join(',') : header ?? '';
  const forwarded = raw.split(',').map((part) => part.trim()).filter((part) => part !== '').reverse();
  const chain = [remote, ...forwarded];

  const firstUntrusted = chain.findIndex(
    (address, hop) => hop < chain.length - 1 && trust !== true && !trust(address, hop)
  );
  return firstUntrusted === -1 ? chain[chain.length - 1] : chain[firstUntrusted];
}
