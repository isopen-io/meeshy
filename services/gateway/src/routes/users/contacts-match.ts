import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendInternalError } from '../../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { normalizePhoneWithCountry, normalizeEmail } from '../../utils/normalize';
import type { AuthenticatedRequest } from './types';

/**
 * Matching carnet d'adresses → utilisateurs Meeshy.
 *
 * Le client envoie les identifiants bruts de ses contacts (numéros, emails) ;
 * le serveur normalise en E.164, matche contre les comptes actifs et renvoie
 * les profils publics. Les contacts ne sont JAMAIS persistés côté serveur —
 * pur matching en mémoire, dans l'esprit du Prisme (suggestion discrète).
 */

const MAX_CONTACTS_PER_SYNC = 2000;

const contactEntrySchema = z.object({
  displayName: z.string().max(150).optional(),
  phoneNumbers: z.array(z.string().max(30)).max(5).optional(),
  emails: z.array(z.string().max(254)).max(5).optional(),
}).strict();

const matchContactsSchema = z.object({
  contacts: z.array(contactEntrySchema).min(1).max(MAX_CONTACTS_PER_SYNC),
  defaultCountry: z.string().length(2).optional(),
}).strict();

type ContactEntry = z.infer<typeof contactEntrySchema>;

type IdentifierIndex = {
  phones: Map<string, string | undefined>;
  emails: Map<string, string | undefined>;
};

function indexContactIdentifiers(
  contacts: ContactEntry[],
  defaultCountry: string
): IdentifierIndex {
  const phones = new Map<string, string | undefined>();
  const emails = new Map<string, string | undefined>();

  contacts.forEach((contact) => {
    (contact.phoneNumbers ?? []).forEach((raw) => {
      const normalized = normalizePhoneWithCountry(raw, defaultCountry);
      if (normalized?.isValid && !phones.has(normalized.phoneNumber)) {
        phones.set(normalized.phoneNumber, contact.displayName);
      }
    });
    (contact.emails ?? []).forEach((raw) => {
      const email = normalizeEmail(raw);
      if (email.includes('@') && !emails.has(email)) {
        emails.set(email, contact.displayName);
      }
    });
  });

  return { phones, emails };
}

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
                emails: { type: 'array', items: { type: 'string' } }
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
                      user: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          username: { type: 'string' },
                          firstName: { type: 'string' },
                          lastName: { type: 'string' },
                          displayName: { type: 'string', nullable: true },
                          avatar: { type: 'string', nullable: true },
                          isOnline: { type: 'boolean' },
                          lastActiveAt: { type: 'string', nullable: true }
                        }
                      },
                      matchedBy: { type: 'string', enum: ['phone', 'email'] },
                      contactDisplayName: { type: 'string', nullable: true }
                    }
                  }
                },
                totalContacts: { type: 'number' },
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

      const parsed = matchContactsSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid contacts payload');
      }

      const { contacts, defaultCountry } = parsed.data;
      const { phones, emails } = indexContactIdentifiers(contacts, defaultCountry ?? 'FR');

      if (phones.size === 0 && emails.size === 0) {
        return sendSuccess(reply, {
          matches: [],
          totalContacts: contacts.length,
          matchedCount: 0
        });
      }

      const identifierFilters = [
        ...(phones.size > 0 ? [{ phoneNumber: { in: Array.from(phones.keys()) } }] : []),
        ...(emails.size > 0 ? [{ email: { in: Array.from(emails.keys()) } }] : []),
      ];

      const matchedUsers = await fastify.prisma.user.findMany({
        where: {
          id: { not: authContext.userId },
          isActive: true,
          deletedAt: null,
          OR: identifierFilters
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          isOnline: true,
          lastActiveAt: true,
          phoneNumber: true,
          email: true
        },
        take: 500
      });

      const matches = matchedUsers.map((user) => {
        const matchedByPhone = user.phoneNumber !== null && phones.has(user.phoneNumber);
        return {
          user: {
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            avatar: user.avatar,
            isOnline: user.isOnline,
            lastActiveAt: user.lastActiveAt
          },
          matchedBy: matchedByPhone ? 'phone' : 'email',
          contactDisplayName: (matchedByPhone
            ? phones.get(user.phoneNumber as string)
            : emails.get(normalizeEmail(user.email))) ?? null
        };
      });

      return sendSuccess(reply, {
        matches,
        totalContacts: contacts.length,
        matchedCount: matches.length
      });
    } catch (error) {
      logError(fastify.log, '[CONTACTS-MATCH] Error matching contacts', error);
      return sendInternalError(reply, 'Failed to match contacts');
    }
  });
}
