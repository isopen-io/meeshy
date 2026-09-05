import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendBadRequest, sendInternalError } from '../../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { getRequestContext } from '../../services/GeoIPService';
import { clientRateKey } from '../../utils/client-rate-key';
import { createCustomRateLimiter } from '../../utils/rate-limiter.js';
import { candidatsDePseudo } from '../../utils/username-candidates';

const logger = enhancedLogger.child({ module: 'DirectoryAvailability' });

/** Combien de pseudos de rechange proposer quand celui demandé est pris. */
const SUGGESTIONS_RENDUES = 3;

export type StatutPseudo = 'available' | 'taken';
export type StatutForme = 'valid' | 'invalid';

/**
 * Les candidats de rechange vivent désormais dans `utils/username-candidates.ts`
 * (#5216) : la GÉNÉRATION de pseudo à l'inscription les emploie aussi, et un
 * service qui importe une règle d'un fichier de ROUTE se met à dépendre de la
 * surface HTTP qui l'appelle. Le ré-export garde les appelants historiques —
 * dont l'alias déprécié `GET /auth/check-availability`.
 */
export { candidatsDePseudo };

/**
 * `GET /directory/availability` — la porte PUBLIQUE de l'annuaire (S1).
 *
 * ## Ce qu'elle dit, et ce qu'elle refuse de dire
 *
 * **Seul le PSEUDO répond à la question de l'existence.** Un pseudo est une clé
 * publique, déjà énumérable par `GET /u/:username` : le cacher ici ne
 * protégerait rien et empêcherait le formulaire d'inscription de faire son
 * travail.
 *
 * **L'e-mail et le téléphone ne répondent que sur la FORME** — `valid` ou
 * `invalid`, jamais `taken`. L'ancienne route confirmait sans compte qu'une
 * adresse ou un numéro appartient à un utilisateur Meeshy, alors que
 * `/forgot-password` et `/magic-link/request` répondent délibérément « succès »
 * dans tous les cas pour ne rien révéler : **la même plateforme appliquait deux
 * doctrines opposées à la même question.**
 *
 * Le coût est nommé et assumé : le formulaire d'inscription ne peut plus dire
 * « vous avez déjà un compte » avant la soumission. C'est la soumission qui le
 * dit. Joindre quelqu'un par son adresse reste possible — par la porte
 * AUTHENTIFIÉE (#4160), qui est la seconde des deux portes voulues.
 *
 * ## Le coût par appel
 *
 * Deux requêtes au maximum : une pour le pseudo, une pour ses six candidats de
 * rechange. L'ancienne en coûtait jusqu'à treize, et ses quatre `findFirst`
 * étaient **sans `select`** — chacun chargeait la ligne `User` entière, hash de
 * mot de passe et secrets 2FA compris.
 */
export async function directoryAvailabilityRoutes(fastify: FastifyInstance) {
  const parAdresse = createCustomRateLimiter(
    {
      max: 20,
      windowMs: 60 * 1000,
      keyPrefix: 'dir:avail:ip',
      message: 'Trop de vérifications. Veuillez patienter une minute.',
      keyGenerator: clientRateKey,
    },
    fastify.redis ?? undefined
  );

  const coupeCircuit = createCustomRateLimiter(
    {
      max: 1200,
      windowMs: 60 * 1000,
      keyPrefix: 'dir:avail:all',
      message: 'Service momentanément saturé. Veuillez réessayer.',
      keyGenerator: () => 'global',
    },
    fastify.redis ?? undefined
  );

  fastify.get('/availability', {
    preHandler: [parAdresse.middleware(), coupeCircuit.middleware()],
    schema: {
      description:
        'Check whether a username is free, and whether an email or phone number is well-formed. Email and phone NEVER reveal whether an account exists (#4158).',
      tags: ['directory'],
      summary: 'Check identifier availability',
      querystring: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          phoneNumber: { type: 'string' },
          country: { type: 'string', description: 'ISO-3166 alpha-2, used to normalise a national number' },
        },
      },
      response: {
        200: {
          description: 'Availability verdict',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                username: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    status: { type: 'string', enum: ['available', 'taken'] },
                    suggestions: { type: 'array', items: { type: 'string' } },
                  },
                },
                email: {
                  type: 'object',
                  nullable: true,
                  properties: { status: { type: 'string', enum: ['valid', 'invalid'] } },
                },
                phoneNumber: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    status: { type: 'string', enum: ['valid', 'invalid'] },
                    e164: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
        },
        400: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { username, email, phoneNumber, country } = request.query as {
      username?: string;
      email?: string;
      phoneNumber?: string;
      country?: string;
    };

    if (!username && !email && !phoneNumber) {
      return sendBadRequest(reply, 'username, email ou phoneNumber requis');
    }

    try {
      const data: Record<string, unknown> = {};

      if (username) {
        const demande = username.trim();
        // `select: { id: true }` : l'existence se TESTE, elle ne se télécharge
        // pas. Les quatre `findFirst` de l'ancienne route chargeaient la ligne
        // entière — `password`, `twoFactorSecret`, `twoFactorBackupCodes`.
        const pris = await fastify.prisma.user.findFirst({
          where: { username: { equals: demande, mode: 'insensitive' } },
          select: { id: true },
        });

        if (!pris) {
          data.username = { status: 'available' as StatutPseudo, suggestions: [] };
        } else {
          const candidats = candidatsDePseudo(demande);
          // UNE requête pour les six candidats, au lieu de dix tirages.
          const dejaPris = await fastify.prisma.user.findMany({
            where: { username: { in: candidats, mode: 'insensitive' } },
            select: { username: true },
          });
          const occupes = new Set(
            (dejaPris as Array<{ username: string }>).map((u) => u.username.toLowerCase())
          );
          data.username = {
            status: 'taken' as StatutPseudo,
            suggestions: candidats.filter((c) => !occupes.has(c.toLowerCase())).slice(0, SUGGESTIONS_RENDUES),
          };
        }
      }

      if (email) {
        const forme = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim());
        data.email = { status: (forme ? 'valid' : 'invalid') as StatutForme };
      }

      if (phoneNumber) {
        const contexte = await getRequestContext(request);
        const paysParDefaut = country || contexte?.geoData?.country || 'FR';
        const { normalizePhoneWithCountry } = await import('../../utils/normalize');
        const normalise = normalizePhoneWithCountry(phoneNumber, paysParDefaut);

        data.phoneNumber = normalise && normalise.isValid
          ? { status: 'valid' as StatutForme, e164: normalise.phoneNumber }
          : { status: 'invalid' as StatutForme, e164: null };
      }

      return sendSuccess(reply, data);
    } catch (error) {
      logger.error('Erreur de vérification de disponibilité', error as Error);
      return sendInternalError(reply, 'Erreur lors de la vérification');
    }
  });
}
