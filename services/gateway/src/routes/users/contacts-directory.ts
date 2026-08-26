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
import { viewerFromRequest } from './presence-gate';
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
/** Tolérance d'horloge cliente pour `syncStartedAt` — au-delà, 400. */
const SYNC_STARTED_AT_FUTURE_TOLERANCE_MS = 5_000;

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
            description: '`replace` purges entries absent from this payload (full device sync). Defaults to `merge`. Ignored for purge purposes once `syncStartedAt` or `isFinalBatch` is present — see below.'
          },
          syncStartedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Watermark token (ISO 8601), identical across every batch of one multi-batch sync — echoed back by the first batch\'s response. Its presence switches the purge strategy to the batched one (see `isFinalBatch`). Rejected with 400 if more than 5s in the future.'
          },
          isFinalBatch: {
            type: 'boolean',
            description: 'True on the last batch of a multi-batch sync — triggers the purge of every directory entry not touched (via any batch) since `syncStartedAt`. Absent/false on intermediate batches: no purge at all.'
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
                removedCount: { type: 'number' },
                syncStartedAt: {
                  type: 'string',
                  description: 'Server clock at request receipt (ISO 8601), captured before any upsert — always returned. Repeat the value returned by the FIRST batch, unchanged, on every subsequent batch of the same sync — never the value returned by an intermediate batch (it would advance the watermark and purge the earlier batches).'
                }
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
      // Horloge serveur à la réception — AVANT tout upsert. Toujours
      // renvoyée en réponse, et sert de filigrane par défaut pour un lot
      // unique final (`isFinalBatch: true` sans `syncStartedAt`).
      const receivedAt = new Date();

      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const body = (request.body ?? {}) as {
        contacts?: unknown;
        defaultCountry?: unknown;
        mode?: unknown;
        syncStartedAt?: unknown;
        isFinalBatch?: unknown;
      };
      if (!Array.isArray(body.contacts)) {
        return sendBadRequest(reply, 'Invalid contacts payload');
      }

      let syncStartedAt: Date | undefined;
      if (typeof body.syncStartedAt === 'string') {
        const parsed = new Date(body.syncStartedAt);
        if (Number.isNaN(parsed.getTime())) {
          return sendBadRequest(reply, 'Invalid syncStartedAt');
        }
        if (parsed.getTime() > receivedAt.getTime() + SYNC_STARTED_AT_FUTURE_TOLERANCE_MS) {
          return sendBadRequest(reply, 'syncStartedAt is in the future');
        }
        syncStartedAt = parsed;
      }
      const isFinalBatch = typeof body.isFinalBatch === 'boolean' ? body.isFinalBatch : undefined;
      const batched = syncStartedAt !== undefined || isFinalBatch !== undefined;

      const totalContacts = body.contacts.length;
      const contacts = normalizeContacts(body.contacts, body.defaultCountry as string | undefined);
      const mode: SyncMode = body.mode === 'replace' ? 'replace' : 'merge';

      const truncated = totalContacts > MAX_CONTACTS_PER_SYNC;
      if (truncated) {
        fastify.log.warn(
          `[CONTACTS-SYNC] Lot tronqué à ${MAX_CONTACTS_PER_SYNC} contacts (reçus: ${totalContacts}) — le client doit paginer le reste`
        );
      }

      // Un lot tronqué ne doit JAMAIS purger — ni via `contactKey notIn`
      // (garde-fou historique), ni via le filigrane par lots. La troncature
      // (`normalizeContacts`) jette des fiches en silence : aucun lot ne les
      // a jamais touchées, donc les purger amputerait le répertoire de
      // données qu'aucun envoi n'a reçues. Un lot tronqué ne peut donc
      // jamais être FINAL, quel que soit `isFinalBatch` demandé par le
      // client.
      const effectiveMode: SyncMode = !batched && truncated ? 'merge' : mode;

      const service = new ContactDirectoryService(fastify.prisma);
      const result = await service.sync({
        ownerId: authContext.userId,
        contacts,
        mode: effectiveMode,
        syncStartedAt,
        isFinalBatch: truncated ? false : isFinalBatch,
        receivedAt
      });

      return sendSuccess(reply, {
        totalContacts,
        processedContacts: contacts.length,
        syncedCount: result.synced,
        matchedCount: result.matched,
        removedCount: result.removed,
        syncStartedAt: receivedAt.toISOString()
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
        viewer: viewerFromRequest(request),
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
