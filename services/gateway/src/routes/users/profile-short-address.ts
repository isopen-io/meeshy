import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { apiPath } from '@meeshy/shared/api/prefix';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { sendNotFound } from '../../utils/response';

/** Un pseudo ne porte ni `/`, ni `.` seul, ni rien qui puisse fabriquer un autre chemin. */
const PSEUDO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * `GET /@:username` — l'adresse courte `meeshy.me/@pseudo` côté passerelle (#18862).
 *
 * UNE redirection vers l'adresse canonique `/u/:username`, requête conservée. 307 (la méthode
 * et la requête ne changent pas), jamais 301 : un alias permanent se cacherait chez les clients
 * et les intermédiaires, et l'adresse canonique pourrait devoir évoluer. `/u/:username` reste
 * servi tel quel : aucun ancien client ne change.
 *
 * Le pseudo est validé AVANT d'être recopié dans l'adresse : sans cela, `/@//autre.site` ferait
 * de la route une redirection ouverte. Un pseudo qui n'en est pas un répond 404, comme un
 * profil introuvable.
 */
export async function userShortAddressAlias(fastify: FastifyInstance) {
  fastify.get('/@:username', {
    schema: {
      description: 'Short profile address: redirects to /u/:username (query string preserved).',
      tags: ['users'],
      summary: 'Short profile address',
      response: {
        307: { description: 'Redirect to the canonical address /u/:username' },
        404: errorResponseSchema,
      },
      params: {
        type: 'object',
        required: ['username'],
        properties: { username: { type: 'string' } },
      },
    },
  }, async (request: FastifyRequest<{ Params: { username: string } }>, reply: FastifyReply) => {
    const { username } = request.params;
    if (!PSEUDO.test(username)) return sendNotFound(reply, 'User not found');
    const rawUrl = request.raw.url ?? '';
    const queryStart = rawUrl.indexOf('?');
    const query = queryStart === -1 ? '' : rawUrl.slice(queryStart);
    return reply.redirect(`${apiPath(`/u/${encodeURIComponent(username)}`)}${query}`, 307);
  });
}
