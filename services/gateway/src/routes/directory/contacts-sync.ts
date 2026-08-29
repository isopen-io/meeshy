import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendInternalError } from '../../utils/response.js';
import { normalizeContacts, MAX_CONTACTS_PER_SYNC } from '../../utils/contact-identifiers';
import { ContactDirectoryService, type SyncMode } from '../../services/ContactDirectoryService';
import type { AuthenticatedRequest } from '../users/types';

/** Tolérance d'horloge cliente pour `syncStartedAt` — au-delà, 400. */
const TOLERANCE_HORLOGE_MS = 5_000;

function acteur(request: FastifyRequest): string | null {
  const ctx = (request as AuthenticatedRequest).authContext;
  return ctx?.isAuthenticated && ctx.registeredUser ? (ctx.userId ?? null) : null;
}

/**
 * La synchronisation — SITE UNIQUE, partagé par `PUT`, `PATCH` et l'alias.
 *
 * Le `mode` ne se lit plus dans le corps : il est passé par l'appelant, qui le
 * tient de son VERBE. L'alias historique le tient, lui, de son champ de corps —
 * c'est son contrat, et il ne change pas.
 */
export async function synchroniser(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  mode: SyncMode
): Promise<unknown> {
  try {
    // Horloge serveur à la RÉCEPTION — avant tout upsert. Toujours renvoyée, et
    // filigrane par défaut d'un lot unique final.
    const receivedAt = new Date();

    const moi = acteur(request);
    if (!moi) return sendUnauthorized(reply, 'Authentication required');

    const body = (request.body ?? {}) as {
      contacts?: unknown;
      defaultCountry?: unknown;
      syncStartedAt?: unknown;
      isFinalBatch?: unknown;
    };

    if (!Array.isArray(body.contacts)) return sendBadRequest(reply, 'Invalid contacts payload');

    let syncStartedAt: Date | undefined;
    if (typeof body.syncStartedAt === 'string') {
      const parsed = new Date(body.syncStartedAt);
      if (Number.isNaN(parsed.getTime())) return sendBadRequest(reply, 'Invalid syncStartedAt');
      if (parsed.getTime() > receivedAt.getTime() + TOLERANCE_HORLOGE_MS) {
        return sendBadRequest(reply, 'syncStartedAt is in the future');
      }
      syncStartedAt = parsed;
    }

    const isFinalBatch = typeof body.isFinalBatch === 'boolean' ? body.isFinalBatch : undefined;
    const parLots = syncStartedAt !== undefined || isFinalBatch !== undefined;

    const totalContacts = body.contacts.length;
    const contacts = normalizeContacts(body.contacts, body.defaultCountry as string | undefined);

    const tronque = totalContacts > MAX_CONTACTS_PER_SYNC;
    if (tronque) {
      fastify.log.warn(
        `[DIR-CONTACTS] Lot tronqué à ${MAX_CONTACTS_PER_SYNC} contacts (reçus: ${totalContacts}) — le client doit paginer le reste`
      );
    }

    // Un lot tronqué ne PURGE jamais — ni par `contactKey notIn`, ni par le
    // filigrane. `normalizeContacts` jette des fiches en silence : aucun lot ne
    // les a touchées, donc les purger amputerait le carnet de données qu'aucun
    // envoi n'a reçues. Un lot tronqué ne peut donc jamais être FINAL, quoi que
    // le client demande.
    const modeEffectif: SyncMode = !parLots && tronque ? 'merge' : mode;

    const service = new ContactDirectoryService(fastify.prisma);
    const result = await service.sync({
      ownerId: moi,
      contacts,
      mode: modeEffectif,
      syncStartedAt,
      isFinalBatch: tronque ? false : isFinalBatch,
      receivedAt,
    });

    return sendSuccess(reply, {
      totalContacts,
      processedContacts: contacts.length,
      syncedCount: result.synced,
      matchedCount: result.matched,
      removedCount: result.removed,
      syncStartedAt: receivedAt.toISOString(),
      // Le filigrane de RELECTURE : ce que le client passera en `updatedSince`
      // pour ne relire QUE ce qui a bougé. Il remplace la relecture complète
      // qui suivait chaque synchronisation.
      appliedAt: new Date().toISOString(),
    });
  } catch (error) {
    logError(fastify.log, '[DIR-CONTACTS] Error syncing directory', error);
    return sendInternalError(reply, 'Failed to sync contacts');
  }
}
