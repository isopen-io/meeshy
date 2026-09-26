/**
 * `POST /contacts/resolve` — carte de visite partagée → comptes Meeshy (#8101).
 *
 * Le lecteur d'une vCard reçue envoie ses numéros et e-mails (≤ 10 chacun) ;
 * la réponse porte au plus trois profils PUBLICS avec la relation du lecteur
 * à chacun. Réservé aux comptes inscrits : un participant anonyme n'a ni
 * amitié à nouer ni conversation directe à ouvrir.
 *
 * Oracle d'énumération : la route puise dans le seau de l'annuaire inversé
 * (`contactLookupRateLimiter`), partagé avec `GET /users/email/:email` et
 * `GET /users/phone/:phone`. Le schéma de réponse est FERMÉ
 * (`publicContactAccountSchema`) : ce que le résolveur laisserait passer à
 * côté du profil public n'atteint pas le fil.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  resolveContactsBodySchema,
  resolveContactsResponseSchema,
  type ResolveContactsRequest,
} from '@meeshy/shared/types/contact-card';
import { logError } from '../../utils/logger';
import { sendForbidden, sendInternalError, sendSuccess, sendUnauthorized } from '../../utils/response.js';
import { ContactCardResolver } from '../../services/ContactCardResolver';
import { contactLookupRateLimiter } from '../users/profile-lookups';
import type { UnifiedAuthRequest } from '../../middleware/auth';

export async function contactsResolveRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/resolve',
    {
      onRequest: [fastify.authenticate],
      preHandler: [contactLookupRateLimiter(fastify)],
      schema: {
        description:
          'Resolve the phone numbers and e-mails of a shared contact card (vCard) to at most three public Meeshy profiles, with the reader relation to each. Never returns the account e-mail/phone, the matched identifier, presence or dates.',
        tags: ['contacts'],
        summary: 'Resolve a shared contact card to Meeshy accounts',
        body: resolveContactsBodySchema,
        response: {
          200: resolveContactsResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          429: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated) return sendUnauthorized(reply);
      if (!authContext.registeredUser || authContext.isAnonymous || !authContext.userId) {
        return sendForbidden(reply, 'Registered account required');
      }

      try {
        const body = request.body as ResolveContactsRequest;
        const accounts = await new ContactCardResolver(fastify.prisma).resolve({
          viewerId: authContext.userId,
          phones: body.phones,
          emails: body.emails,
          defaultCountry: body.defaultCountry,
        });
        return sendSuccess(reply, { accounts });
      } catch (error) {
        logError(fastify.log, '[CONTACTS-RESOLVE] Échec de la résolution de la carte de visite', error);
        return sendInternalError(reply, 'Failed to resolve contact card');
      }
    },
  );
}
