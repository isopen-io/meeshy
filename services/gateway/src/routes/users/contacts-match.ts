import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendInternalError } from '../../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { normalizeContacts, MAX_CONTACTS_PER_SYNC } from '../../utils/contact-identifiers';
import { ContactDirectoryService, applyMatchedPresence } from '../../services/ContactDirectoryService';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { matchedUserSchema } from './contacts-schemas';
import { viewerFromRequest } from './presence-gate';
import type { AuthenticatedRequest } from './types';

/**
 * Matching carnet d'adresses → utilisateurs Meeshy, SANS persistance.
 *
 * Le client envoie les identifiants bruts de ses contacts (numéros, emails,
 * pseudos vCard) ; le serveur normalise, matche contre les comptes actifs et
 * renvoie les profils publics. Rien n'est écrit — pour CONSERVER le répertoire,
 * c'est `POST /users/me/contacts/sync` (contacts-directory.ts).
 *
 * Tolérance : le carnet d'adresses est une donnée appareil non maîtrisée. Une
 * entrée illisible est ÉCARTÉE, jamais fatale pour le lot ; un lot au-delà de
 * la borne est TRONQUÉ et le client en est informé (`processedContacts`), au
 * lieu de renvoyer un 400 qui ferait échouer toute la recherche de contacts.
 */

export async function matchContacts(fastify: FastifyInstance) {
  fastify.post('/users/me/contacts/match', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Match the user\'s address book against existing Meeshy accounts. Contacts are matched in memory and never stored server-side.',
      tags: ['users'],
      summary: 'Match phone contacts with platform users',
      body: {
        type: 'object',
        required: ['contacts'],
        properties: {
          contacts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                displayName: { type: 'string' },
                phoneNumbers: { type: 'array', items: { type: 'string' } },
                emails: { type: 'array', items: { type: 'string' } },
                usernames: { type: 'array', items: { type: 'string' }, description: 'Pseudos issus de la vCard (nickname, profils sociaux)' }
              }
            }
          },
          defaultCountry: { type: 'string', description: 'ISO country code used to normalize local phone numbers (e.g., FR, SN)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                matches: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      user: matchedUserSchema,
                      matchedBy: { type: 'string', enum: ['phone', 'email', 'username'] },
                      contactDisplayName: { type: 'string', nullable: true }
                    }
                  }
                },
                totalContacts: { type: 'number' },
                processedContacts: { type: 'number' },
                matchedCount: { type: 'number' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const body = (request.body ?? {}) as { contacts?: unknown; defaultCountry?: unknown };
      if (!Array.isArray(body.contacts)) {
        return sendBadRequest(reply, 'Invalid contacts payload');
      }

      const totalContacts = body.contacts.length;
      const contacts = normalizeContacts(body.contacts, body.defaultCountry as string | undefined);

      if (totalContacts > MAX_CONTACTS_PER_SYNC) {
        fastify.log.warn(
          `[CONTACTS-MATCH] Lot tronqué à ${MAX_CONTACTS_PER_SYNC} contacts (reçus: ${totalContacts}) — le client doit paginer le reste`
        );
      }

      const service = new ContactDirectoryService(fastify.prisma);
      const matchesByKey = await service.match({ contacts, excludeUserId: authContext.userId });

      // Gate de présence : un profil rapproché n'expose isOnline/lastActiveAt
      // qu'au titre du critère STRICT (soi, modérateur+, ami), exactement comme
      // `/users/search`. Avoir quelqu'un dans son carnet d'adresses n'est pas un
      // droit d'accès à sa présence — c'est une affirmation unilatérale et non
      // vérifiée. `match()` a déjà écarté les comptes en relation de blocage.
      const matchedIds = [...new Set([...matchesByKey.values()].map((match) => match.user.id))];
      const visibility = matchedIds.length > 0
        ? await getPresenceVisibilityService(fastify.prisma).resolveForTargets(
            viewerFromRequest(request),
            matchedIds,
          )
        : new Map();

      const matches = contacts.flatMap((contact) => {
        const match = matchesByKey.get(contact.contactKey);
        if (!match) return [];
        return [{
          user: applyMatchedPresence(match.user, visibility.get(match.user.id)),
          matchedBy: match.matchedBy,
          contactDisplayName: contact.displayName
        }];
      });

      return sendSuccess(reply, {
        matches,
        totalContacts,
        processedContacts: contacts.length,
        matchedCount: matches.length
      });
    } catch (error) {
      logError(fastify.log, '[CONTACTS-MATCH] Error matching contacts', error);
      return sendInternalError(reply, 'Failed to match contacts');
    }
  });
}
