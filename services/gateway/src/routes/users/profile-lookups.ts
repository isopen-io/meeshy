/**
 * Recherche de profils publics : `GET /u/:username`, `/users/:id`,
 * `/users/email/:email`, `/users/id/:id`, `/users/phone/:phone`. Extrait de
 * `profile.ts` (#4284, budget de taille) — la façade de ré-export vit
 * là-bas.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { normalizeEmail, normalizePhoneWithCountry } from '../../utils/normalize';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { depreciee, annoncerDepreciation, dateDeRetrait, type AdresseDepreciee } from '../../utils/deprecation';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { UsernameParams } from './types';
import { sendSuccess, sendInternalError, sendNotFound, sendBadRequest } from '../../utils/response';
import { gateProfilePresence, getOptionalAuth } from './presence-gate';
import { contactLookupScope, blockedIdsOfViewer } from '../../services/ContactDirectoryService';
import {
  publicProfileSchema,
  publicUserSelect,
  buildPublicProfile,
  servirProfilPublic,
} from './public-profile';

/**
 * Le sursis des trois portes de profil (#4274).
 *
 * `depuis` est la date de fermeture de #4161 — le jour ou
 * `/directory/people/:handle` est devenue l'adresse unique. Aucun `retraitLe` :
 * #4161 c.9 et c.10 exigent l'extinction des versions iOS INSTALLEES et le
 * comptage des appels Android. Un profil s'ouvre depuis un lien partage, et
 * cette queue est longue ; le compteur est #4275.
 */
const ANNONCE_PROFIL = {
  depuis: '2026-08-29',
  successeur: '/api/v1/directory/people/:handle',
} as const;

const DEPUIS_PROFIL = '2026-08-29';

/** L'annonce d'un alias de profil — le successeur porte le handle RÉSOLU. */
const annonceProfil = (handle: string): AdresseDepreciee => ({
  depuis: DEPUIS_PROFIL,
  successeur: `/api/v1/directory/people/${encodeURIComponent(handle)}`,
  retraitLe: dateDeRetrait(DEPUIS_PROFIL),
});

/**
 * Get user profile by username (public route)
 */
export async function getUserByUsername(fastify: FastifyInstance) {
  fastify.get('/u/:username', {
    onRequest: depreciee(ANNONCE_PROFIL),
    preValidation: [getOptionalAuth(fastify.prisma)],
    schema: {
      description: 'Get public user profile by username. Returns public information only (excludes email, phone, password). Case-insensitive username matching.',
      tags: ['users'],
      summary: 'Get user profile by username',
      params: {
        type: 'object',
        required: ['username'],
        properties: {
          username: { type: 'string', description: 'Username to lookup (case-insensitive)' }
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
                id: { type: 'string' },
                username: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                displayName: { type: 'string' },
                avatar: { type: 'string', nullable: true },
                banner: { type: 'string', nullable: true },
                bio: { type: 'string', nullable: true },
                role: { type: 'string' },
                isOnline: { type: ['boolean', 'null'] },
                lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
                voicePublic: { type: 'boolean' },
                voiceSampleUrl: { type: 'string', nullable: true },
                voiceSampleDurationMs: { type: 'number', nullable: true },
                voiceQuality: { type: 'number', nullable: true },
                createdAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: UsernameParams }>, reply: FastifyReply) => {
    try {
      const { username } = request.params;
      annoncerDepreciation(reply, annonceProfil(username));

      // ALIAS de `GET /directory/people/:handle` (#4161, critère 9).
      //
      // Cette porte servait une projection PLUS COURTE que ses trois voisines —
      // une troisième forme de réponse pour la même ligne de base. Elle sert
      // désormais la même, et les liens `/u/<pseudo>` déjà partagés continuent
      // de fonctionner.
      const profil = await servirProfilPublic(fastify, request, reply, username);
      if (!profil) return reply;

      return sendSuccess(reply, profil);

    } catch (error) {
      logError(fastify.log, 'Get user profile error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * Get user profile by ID or username
 */
export async function getUserById(fastify: FastifyInstance) {
  fastify.get('/users/:id', {
    onRequest: depreciee(ANNONCE_PROFIL),
    preValidation: [getOptionalAuth(fastify.prisma)],
    schema: {
      description: 'Get public user profile by MongoDB ID or username. Returns public information including language settings. Automatically detects whether ID is MongoDB ObjectId or username.',
      tags: ['users'],
      summary: 'Get user profile by ID or username',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User MongoDB ID (24 hex chars) or username' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            // Le miroir DÉCLARÉ de `publicUserSelect`, comme les trois autres
            // portes de profil. Ce bloc énumérait encore, à la main, les six
            // champs que #4161 retire de la surface — `systemLanguage`,
            // `regionalLanguage`, `customDestinationLanguage`, `isActive`,
            // `deactivatedAt`, `updatedAt` — plus `autoTranslateEnabled`,
            // `email` et `phoneNumber`. Le `select` ne les charge plus, donc
            // rien ne partait ; une déclaration sans producteur n'est pourtant
            // pas neutre : elle PROMET un champ, et la première personne qui
            // le remet au `select` le publie sans qu'un témoin tombe.
            //
            // `permissions` a été RETIRÉ, du schéma comme de la charge utile.
            // Il n'avait pas de producteur : le handler posait
            // `permissions: undefined` DÉLIBÉRÉMENT — un profil public ne porte
            // pas les autorisations de son sujet — si bien que la clé ne
            // partait jamais sur le fil.
            data: publicProfileSchema
          }
        },
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      annoncerDepreciation(reply, annonceProfil(id));

      // ALIAS de `GET /directory/people/:handle` (#4161, critère 9).
      //
      // Ce handler recopiait la projection à la main — c'est lui qui chargeait,
      // et servait, les six champs privés. Il ne décide plus rien : la lecture,
      // la projection, la garde de présence et la composition vivent dans
      // `servirProfilPublic`, et cette adresse reste servie tant que des
      // versions iOS installées l'appellent. Un profil s'ouvre depuis un lien
      // partagé : la queue est longue, et une 302 casserait ces clients.
      const profil = await servirProfilPublic(fastify, request, reply, id);
      if (!profil) return reply;

      return sendSuccess(reply, profil);

    } catch (error) {
      logError(fastify.log, 'Get user profile error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}


export async function getUserByEmail(fastify: FastifyInstance) {
  // AUTHENTIFIÉE, et non plus publique. Cette route confirmait sans compte
  // qu'une adresse appartient à un utilisateur Meeshy — et rendait son profil.
  // Avec `/users/phone/:phone`, ce sont les deux seules routes du dépôt qui
  // joignent « cet identifiant de contact » à « cette personne » : un annuaire
  // INVERSÉ, à partir duquel une liste d'adresses devient une liste d'identités
  // civiles (#4160). La jumelle `POST /users/me/contacts/match` posait déjà
  // cette garde ; ces deux-là ne l'avaient jamais eue.
  fastify.get('/users/email/:email', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Get public user profile by email address (case-insensitive)',
      tags: ['users'],
      summary: 'Get user profile by email',
      params: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email', description: 'User email address' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            // Déclaré, jamais `additionalProperties: true` : c'est ce
            // mécanisme exact qui laissait sortir six champs privés (#4161).
            data: publicProfileSchema
          }
        },
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { email: string } }>, reply: FastifyReply) => {
    try {
      const email = normalizeEmail(request.params.email);

      fastify.log.info(`[USER_PROFILE] Fetching user profile by email`);

      const viewerId = (request as unknown as { user?: { userId?: string } }).user?.userId ?? '';
      const user = await fastify.prisma.user.findFirst({
        where: {
          email,
          ...contactLookupScope({
            viewerId,
            blockedByViewer: await blockedIdsOfViewer(fastify.prisma, viewerId),
          }),
        },
        select: publicUserSelect
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      return sendSuccess(reply, buildPublicProfile(await gateProfilePresence(fastify, request, user)));
    } catch (error) {
      logError(fastify.log, 'Get user by email error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

export async function getUserByIdDedicated(fastify: FastifyInstance) {
  fastify.get('/users/id/:id', {
    onRequest: depreciee(ANNONCE_PROFIL),
    preValidation: [getOptionalAuth(fastify.prisma)],
    schema: {
      description: 'Get public user profile by MongoDB ObjectId',
      tags: ['users'],
      summary: 'Get user profile by UUID/ObjectId',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[a-f\\d]{24}$', description: 'MongoDB ObjectId (24 hex chars)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            // Déclaré, jamais `additionalProperties: true` : c'est ce
            // mécanisme exact qui laissait sortir six champs privés (#4161).
            data: publicProfileSchema
          }
        },
        400: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      annoncerDepreciation(reply, annonceProfil(id));

      /* istanbul ignore next — Fastify params schema (pattern:^[a-fA-F\d]{24}$) rejects invalid ids before handler */
      if (!isValidObjectId(id)) {
        return sendBadRequest(reply, 'Invalid ObjectId format');
      }

      fastify.log.info(`[USER_PROFILE] Fetching user profile by ObjectId: ${id}`);

      // ALIAS de `GET /directory/people/:handle` (#4161, critère 9). Le
      // paramètre est ici contraint à un ObjectId par le schéma ; le lecteur
      // partagé accepte les deux formes, ce qui ne change rien à ce que cette
      // porte-ci laisse entrer.
      const profil = await servirProfilPublic(fastify, request, reply, id);
      if (!profil) return reply;

      return sendSuccess(reply, profil);
    } catch (error) {
      logError(fastify.log, 'Get user by ID error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

export async function getUserByPhone(fastify: FastifyInstance) {
  // AUTHENTIFIÉE — voir `/users/email/:email`. Celle-ci est la plus lourde des
  // deux : `User` ne porte AUCUN index sur `phoneNumber`, si bien qu'un
  // appelant anonyme faisait balayer la collection entière à chaque essai. Un
  // index manquant est ici aussi une surface de déni de service (#4160).
  fastify.get('/users/phone/:phone', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Get public user profile by phone number. Accepts digits with optional country code prefix (e.g. 336199909344 or +336199909344). Normalizes to E.164 format for lookup.',
      tags: ['users'],
      summary: 'Get user profile by phone number',
      params: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', description: 'Phone number with country indicator (e.g. 336199909344)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            // Déclaré, jamais `additionalProperties: true` : c'est ce
            // mécanisme exact qui laissait sortir six champs privés (#4161).
            data: publicProfileSchema
          }
        },
        400: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: { phone: string } }>, reply: FastifyReply) => {
    try {
      const rawPhone = request.params.phone.trim();
      const phoneInput = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;

      const normalized = normalizePhoneWithCountry(phoneInput);

      if (!normalized || !normalized.isValid) {
        return sendBadRequest(reply, 'Invalid phone number format');
      }

      fastify.log.info(`[USER_PROFILE] Fetching user profile by phone: ${normalized.countryCode}`);

      const viewerId = (request as unknown as { user?: { userId?: string } }).user?.userId ?? '';
      const user = await fastify.prisma.user.findFirst({
        where: {
          phoneNumber: normalized.phoneNumber,
          ...contactLookupScope({
            viewerId,
            blockedByViewer: await blockedIdsOfViewer(fastify.prisma, viewerId),
          }),
        },
        select: publicUserSelect
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      return sendSuccess(reply, buildPublicProfile(await gateProfilePresence(fastify, request, user)));
    } catch (error) {
      logError(fastify.log, 'Get user by phone error:', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}
