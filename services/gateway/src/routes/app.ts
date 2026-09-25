import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess } from '../utils/response';
import { getAppStoreUrl, getAppVersionFloor, getShellLatestVersion } from '../utils/appVersion';

/**
 * Bootstrap de la porte de version cliente (spec §C3) : le client lit le
 * plancher au démarrage et monte lui-même l'écran bloquant + lien store —
 * l'OS n'installe pas à notre place. Public, sans authentification : la porte
 * doit se montrer AVANT tout login.
 */
export async function appRoutes(fastify: FastifyInstance) {
  fastify.get('/app/min-version', async (_request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { minVersion: getAppVersionFloor() });
  });

  /**
   * La version DISPONIBLE de la coque de `apps/web` (#6937) : la coque
   * embarque ses actifs et n'a pas de service worker, c'est donc ici qu'elle
   * apprend qu'une version neuve est publiée — une annonce NON bloquante,
   * distincte du plancher ci-dessus. Vide tant que `SHELL_LATEST_VERSION`
   * n'est pas posé : aucune annonce ne se fabrique.
   */
  fastify.get('/app/shell-version', async (request: FastifyRequest, reply: FastifyReply) => {
    const { platform } = request.query as { readonly platform?: unknown };
    return sendSuccess(reply, {
      latestVersion: getShellLatestVersion(),
      storeUrl: getAppStoreUrl(typeof platform === 'string' ? platform : undefined),
    });
  });
}
