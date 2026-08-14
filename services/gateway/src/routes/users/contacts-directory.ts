import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import {
  sendSuccess,
  sendPaginatedSuccess,
  sendUnauthorized,
  sendBadRequest,
  sendInternalError
} from '../../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { normalizeContacts, MAX_CONTACTS_PER_SYNC } from '../../utils/contact-identifiers';
import { ContactDirectoryService, type DirectoryFilter, type SyncMode } from '../../services/ContactDirectoryService';
import { directoryEntrySchema } from './contacts-schemas';
import type { AuthenticatedRequest } from './types';

/**
 * Répertoire persisté — le carnet d'adresses de l'utilisateur, CONSERVÉ.
 *
 * `POST /users/me/contacts/sync` synchronise (upsert idempotent par contact),
 * `GET /users/me/contacts` sert l'annuaire paginé avec le profil Meeshy
 * rapproché — c'est lui qui alimente le bouton « Lui écrire ». `DELETE` efface
 * l'intégralité du répertoire (droit au retrait).
 */

const DEFAULT_PAGE_SIZE = 100;
const VALID_FILTERS: DirectoryFilter[] = ['all', 'meeshy', 'invitable'];

function parseFilter(value: unknown): DirectoryFilter {
  return VALID_FILTERS.includes(value as DirectoryFilter) ? (value as DirectoryFilter) : 'all';
}

function parseInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function syncContactsDirectory(fastify: FastifyInstance) {
  fastify.post('/users/me/contacts/sync', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Synchronise the device address book into the user\'s persisted directory and match it against Meeshy accounts.',
      tags: ['users'],
      summary: 'Sync and persist the address book',
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
                usernames: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          defaultCountry: { type: 'string' },
          mode: {
            type: 'string',
            enum: ['merge', 'replace'],
            description: '`replace` purges entries absent from this payload (full device sync). Defaults to `merge`.'
          }
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
                totalContacts: { type: 'number' },
                processedContacts: { type: 'number' },
                syncedCount: { type: 'number' },
                matchedCount: { type: 'number' },
                removedCount: { type: 'number' }
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

      const body = (request.body ?? {}) as { contacts?: unknown; defaultCountry?: unknown; mode?: unknown };
      if (!Array.isArray(body.contacts)) {
        return sendBadRequest(reply, 'Invalid contacts payload');
      }

      const totalContacts = body.contacts.length;
      const contacts = normalizeContacts(body.contacts, body.defaultCountry as string | undefined);
      const mode: SyncMode = body.mode === 'replace' ? 'replace' : 'merge';

      if (totalContacts > MAX_CONTACTS_PER_SYNC) {
        fastify.log.warn(
          `[CONTACTS-SYNC] Lot tronqué à ${MAX_CONTACTS_PER_SYNC} contacts (reçus: ${totalContacts}) — le client doit paginer le reste`
        );
      }

      // Un lot tronqué ne doit JAMAIS purger : `replace` supprimerait les
      // contacts au-delà de la borne, que le client s'apprête à envoyer.
      const effectiveMode: SyncMode = totalContacts > MAX_CONTACTS_PER_SYNC ? 'merge' : mode;

      const service = new ContactDirectoryService(fastify.prisma);
      const result = await service.sync({
        ownerId: authContext.userId,
        contacts,
        mode: effectiveMode
      });

      return sendSuccess(reply, {
        totalContacts,
        processedContacts: contacts.length,
        syncedCount: result.synced,
        matchedCount: result.matched,
        removedCount: result.removed
      });
    } catch (error) {
      logError(fastify.log, '[CONTACTS-SYNC] Error syncing directory', error);
      return sendInternalError(reply, 'Failed to sync contacts');
    }
  });
}

export async function getContactsDirectory(fastify: FastifyInstance) {
  fastify.get('/users/me/contacts', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'List the user\'s persisted address book, with the matched Meeshy profile inlined when the contact has an account.',
      tags: ['users'],
      summary: 'List the saved address book',
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'number', default: 0 },
          limit: { type: 'number', default: DEFAULT_PAGE_SIZE },
          // Pas d'`enum` ici : une valeur inconnue retombe sur `all`
          // (`parseFilter`) plutôt que de renvoyer un 400 au client.
          filter: { type: 'string', description: `One of ${VALID_FILTERS.join(', ')} — anything else falls back to "all"` },
          q: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: directoryEntrySchema },
            pagination: {
              type: 'object',
              properties: {
                offset: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
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

      const query = (request.query ?? {}) as Record<string, unknown>;
      const offset = Math.max(parseInteger(query.offset, 0), 0);
      const limit = parseInteger(query.limit, DEFAULT_PAGE_SIZE);

      const service = new ContactDirectoryService(fastify.prisma);
      const { contacts, total } = await service.list({
        ownerId: authContext.userId,
        offset,
        limit,
        filter: parseFilter(query.filter),
        query: typeof query.q === 'string' ? query.q : undefined
      });

      return sendPaginatedSuccess(reply, contacts, {
        offset,
        limit,
        total,
        hasMore: offset + contacts.length < total
      });
    } catch (error) {
      logError(fastify.log, '[CONTACTS-DIRECTORY] Error listing directory', error);
      return sendInternalError(reply, 'Failed to load contacts');
    }
  });
}

export async function clearContactsDirectory(fastify: FastifyInstance) {
  fastify.delete('/users/me/contacts', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Erase the user\'s persisted address book.',
      tags: ['users'],
      summary: 'Erase the saved address book',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: { removedCount: { type: 'number' } }
            }
          }
        },
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

      const service = new ContactDirectoryService(fastify.prisma);
      const removedCount = await service.clear(authContext.userId);

      return sendSuccess(reply, { removedCount });
    } catch (error) {
      logError(fastify.log, '[CONTACTS-DIRECTORY] Error clearing directory', error);
      return sendInternalError(reply, 'Failed to clear contacts');
    }
  });
}
