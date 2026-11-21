import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { apiPath } from '@meeshy/shared/api/prefix';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { usernamePatternSource } from '@meeshy/shared/types';
import { sendNotFound } from '../../utils/response';

/**
 * La règle RÉELLE des pseudos (`usernamePatternSource`, celle de l'inscription et du changement
 * de pseudo) : lettres, chiffres, `_` et `-` — jamais `/` ni `.`, donc rien qui fabrique un autre
 * chemin. La longueur reste large (64) : un pseudo ancien, plus long que la borne actuelle, garde
 * son adresse courte.
 */
const PSEUDO = new RegExp(usernamePatternSource);
const PSEUDO_MAX = 64;
const isPseudo = (value: string): boolean => value.length <= PSEUDO_MAX && PSEUDO.test(value);

/**
 * `GET /@:username` — l'adresse courte `meeshy.me/@pseudo` côté passerelle (#18862).
 *
 * UNE redirection vers l'adresse canonique de la fiche, `/directory/people/:handle`, requête
 * conservée — jamais vers `/u/:username`, ALIAS déprécié depuis le 2026-08-29 et promis au retrait
 * (`profile-lookups.ts`, `DEPUIS_PROFIL`) : une adresse neuve qui pointerait vers lui casserait à
 * son retrait. 307 (la méthode et la requête ne changent pas), jamais 301 : un alias permanent se
 * cacherait chez les clients et les intermédiaires. `/u/:username` reste servi tel quel : aucun
 * ancien client ne change.
 *
 * Aucun écran d'app ne l'appelle (il lit `/directory/people/:handle`) : la route est retirée des
 * catalogues client (`packages/shared/api/ops-only-routes.ts`).
 *
 * Elle ne compte AUCUNE visite (#19206) : la fiche compte à l'adresse où elle redirige, une
 * fois — compter ici aussi doublerait chaque ouverture par l'adresse courte.
 *
 * Le pseudo est validé AVANT d'être recopié dans l'adresse : sans cela, `/@//autre.site` ferait
 * de la route une redirection ouverte. Un pseudo qui n'en est pas un répond 404, comme un
 * profil introuvable.
 */
export async function userShortAddressAlias(fastify: FastifyInstance) {
  fastify.get('/@:username', {
    schema: {
      description: 'Short profile address: redirects to /directory/people/:handle (query string preserved).',
      tags: ['users'],
      summary: 'Short profile address',
      response: {
        307: { description: 'Redirect to the canonical address /directory/people/:handle' },
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
    if (!isPseudo(username)) return sendNotFound(reply, 'User not found');
    const rawUrl = request.raw.url ?? '';
    const queryStart = rawUrl.indexOf('?');
    const query = queryStart === -1 ? '' : rawUrl.slice(queryStart);
    return reply.redirect(`${apiPath(`/directory/people/${encodeURIComponent(username)}`)}${query}`, 307);
  });
}
