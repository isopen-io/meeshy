import type { FastifyInstance } from 'fastify';
import { INTERNAL_TOKEN_HEADER, checkInternalToken, usableInternalToken } from './internal-auth';

/**
 * #10242 — la garde GLOBALE du service agent : défense en profondeur derrière le réseau privé.
 *
 * Le service n'est joignable que par le réseau interne (`traefik.enable=false` en staging comme en
 * production) ; s'il redevenait publié par erreur, aucune de ses routes ne s'ouvrirait pour autant.
 * Toute requête, sauf la sonde exacte `GET|HEAD /health`, présente `AGENT_INTERNAL_TOKEN` dans
 * l'en-tête `x-meeshy-internal-token` (comparaison à temps constant, `internal-auth.ts`) :
 * - secret absent, vide ou trop court côté agent ⇒ 503 `internal-auth-not-configured` pour TOUT ;
 * - en-tête absent ou faux ⇒ 401 `unauthorized`.
 *
 * Elle tient en `onRequest` — le premier crochet de Fastify, avant l'analyse du corps — et s'applique
 * aussi aux chemins inconnus : un appelant non authentifié n'apprend pas la carte des routes.
 * À installer sur l'instance RACINE, avant toute route.
 */

const PUBLIC_PROBE = '/health';

function pathOf(rawUrl: string | undefined): string {
  const url = rawUrl ?? '';
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export function installInternalGuard(server: FastifyInstance, options: { readonly internalToken: string | undefined }): void {
  if (usableInternalToken(options.internalToken) === null) {
    server.log.error('[InternalGuard] AGENT_INTERNAL_TOKEN absent ou trop court : toutes les routes sauf /health refusent (503)');
  }

  server.addHook('onRequest', async (req, reply) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && pathOf(req.raw.url) === PUBLIC_PROBE) return;

    const verdict = checkInternalToken(options.internalToken, req.headers[INTERNAL_TOKEN_HEADER]);
    if (verdict === 'ok') return;
    if (verdict === 'not-configured') {
      return reply.status(503).send({ success: false, message: 'internal-auth-not-configured' });
    }
    return reply.status(401).send({ success: false, message: 'unauthorized' });
  });
}
