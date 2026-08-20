import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess } from '../utils/response';
import { getAppVersionFloor } from '../utils/appVersion';

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
}
