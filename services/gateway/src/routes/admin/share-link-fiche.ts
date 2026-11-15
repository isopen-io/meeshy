/**
 * `GET /admin/share-links/:id` — la fiche d'un lien de partage (#8876, § 6.7).
 *
 * Un verbe NEUF sur un chemin qui existe déjà (`DELETE` le ferme, `PATCH` le
 * rouvre) : le catalogue d'adresses n'y gagne aucune entrée. La liste dit qu'un
 * lien existe ; la fiche dit ce qu'il PERMET (écrire, envoyer des fichiers, voir
 * l'historique), ce qu'il EXIGE (compte, pseudonyme, e-mail, date de naissance),
 * ce qu'il RESTREINT (pays, langues), combien il a servi, et qui est arrivé par
 * lui.
 *
 * ## Ce qui n'y est JAMAIS, et pourquoi c'est structurel
 *
 * `linkId` et `identifier` ouvrent la porte de jointure (`SHARE_LINK_JOIN_KEY_COLUMNS`,
 * #4692) ; `allowedIpRanges` décrit la plage d'adresses autorisées, donc où se
 * trouvent les invités attendus. Le `select` ne les DEMANDE pas : ce qui n'est pas
 * lu ne peut pas partir, quel que soit le schéma de réponse. La fiche nomme le
 * lien par son `name` ; le secret ne se lit que par le geste souverain
 * `POST /admin/share-links/:id/reveal` (rang souverain, motif écrit, trace).
 *
 * ## Les portes
 *
 * `canAccessAdmin` ET `canManageConversations` — la loi de cette ressource, celle
 * que la liste applique : BIGBOSS, ADMIN, MODERATOR. AUDIT ne gère pas les liens.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import { requirePermission } from '../../middleware/authorize';
import { withAnonymousParticipantCounts } from '../../utils/share-link-participant-counts';
import { logError } from '../../utils/logger';
import { sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { ADMIN_PERSON_SELECT } from './oversight-people';
import {
  booleen,
  chaine,
  chaineNulle,
  dateNulle,
  dateServie,
  enveloppe,
  nombre,
  nombreNul,
  personneSchema,
  reponsesEnErreur,
} from './oversight-schemas';

const RECENT_GUESTS = 10;

const FICHE_SELECT = {
  id: true,
  name: true,
  description: true,
  maxUses: true,
  currentUses: true,
  maxConcurrentUsers: true,
  currentConcurrentUsers: true,
  maxUniqueSessions: true,
  currentUniqueSessions: true,
  visitCount: true,
  expiresAt: true,
  isActive: true,
  allowAnonymousMessages: true,
  allowAnonymousFiles: true,
  allowAnonymousImages: true,
  allowViewHistory: true,
  requireAccount: true,
  requireNickname: true,
  requireEmail: true,
  requireBirthday: true,
  allowedCountries: true,
  allowedLanguages: true,
  createdAt: true,
  updatedAt: true,
  creator: { select: ADMIN_PERSON_SELECT },
  conversation: { select: { id: true, identifier: true, title: true, type: true } },
} as const;

const stringList = { type: 'array', items: chaine } as const;

const ficheSchema = {
  type: 'object',
  properties: {
    id: chaine,
    name: chaineNulle,
    description: chaineNulle,
    maxUses: nombreNul,
    currentUses: nombre,
    maxConcurrentUsers: nombreNul,
    currentConcurrentUsers: nombre,
    maxUniqueSessions: nombreNul,
    currentUniqueSessions: nombre,
    visitCount: nombre,
    expiresAt: dateNulle,
    isActive: booleen,
    allowAnonymousMessages: booleen,
    allowAnonymousFiles: booleen,
    allowAnonymousImages: booleen,
    allowViewHistory: booleen,
    requireAccount: booleen,
    requireNickname: booleen,
    requireEmail: booleen,
    requireBirthday: booleen,
    allowedCountries: stringList,
    allowedLanguages: stringList,
    createdAt: dateServie,
    updatedAt: dateServie,
    creator: personneSchema,
    conversation: {
      type: 'object',
      nullable: true,
      properties: { id: chaine, identifier: chaineNulle, title: chaineNulle, type: chaineNulle },
    },
    _count: { type: 'object', properties: { anonymousParticipants: nombre } },
    recentGuests: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: chaine, displayName: chaine, avatar: chaineNulle, joinedAt: dateServie, isActive: booleen },
      },
    },
  },
} as const;

export function registerShareLinkFicheRoute(fastify: FastifyInstance): void {
  fastify.get(
    '/share-links/:id',
    {
      onRequest: [fastify.authenticate, requirePermission('canAccessAdmin'), requirePermission('canManageConversations')],
      schema: {
        description:
          "La fiche d'un lien de partage : ce qu'il permet, exige et restreint, son usage et ses dix derniers invités. Jamais sa clé de jointure. canAccessAdmin + canManageConversations. #8876.",
        tags: ['admin'],
        summary: 'Get one share link (admin)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: OBJECT_ID_PATTERN } },
        },
        response: { 200: enveloppe(ficheSchema), ...reponsesEnErreur },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };

        const row = await fastify.prisma.conversationShareLink.findUnique({ where: { id }, select: FICHE_SELECT });
        if (!row) return sendNotFound(reply, 'Lien de partage non trouvé');

        const [[counted], recentGuests] = await Promise.all([
          withAnonymousParticipantCounts(fastify.prisma, [row]),
          fastify.prisma.participant.findMany({
            where: { shareLinkId: id, type: 'anonymous' },
            select: { id: true, displayName: true, avatar: true, joinedAt: true, isActive: true },
            orderBy: { joinedAt: 'desc' },
            take: RECENT_GUESTS,
          }),
        ]);

        return sendSuccess(reply, { ...counted, recentGuests });
      } catch (error) {
        logError(fastify.log, 'Get admin share link error:', error);
        return sendInternalError(reply, 'Erreur interne du serveur');
      }
    }
  );
}
