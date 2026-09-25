/**
 * `GET /admin/users/:userId/conversations` — les conversations d'un membre,
 * depuis SA fiche d'administration. Extrait de `users.ts` par #7845 (le
 * fichier approchait le plafond de taille, et cette route y grandissait).
 *
 * ## Ce que la route sert : des MÉTADONNÉES, jamais un contenu
 *
 * Titre, description, images, réglages du conteneur, effectif, nombre de
 * messages, et la ligne d'appartenance du membre. Aucun texte de message :
 * lire ce qui s'y dit est un geste souverain à part
 * (`conversation-messages-sovereign.ts`, motif écrit et trace).
 *
 * ## Les tris offerts, et ceux qui ne le sont pas
 *
 * `lastMessageAt`, `createdAt`, `title` — trois colonnes de la conversation —
 * et `joinedAt`, qui vit sur la PARTICIPATION du membre : ce tri-là interroge
 * donc `participant` et remonte à la conversation, faute de quoi il n'aurait
 * aucune colonne sur laquelle s'appuyer.
 *
 * **Ni l'effectif ni le nombre de messages ne se trient**, et c'est délibéré —
 * même raisonnement que `conversations-sovereign.ts` : `Conversation.memberCount`
 * est une colonne MORTE (personne ne l'écrit, l'effectif servi vient d'un
 * `_count` filtré sur les participants actifs), et la ligne
 * `ConversationMessageStats` est FACULTATIVE. Trier sur l'une ou l'autre
 * trierait sur des zéros, en silence, avec l'air de fonctionner — un contrôle
 * existe s'il a un effet (loi 4). Une valeur hors de la liste est un 400, au
 * schéma ET dans le gestionnaire : le premier documente, le second est la
 * garde qui ne dépend pas de la configuration AJV.
 *
 * ## `membership` : TOUJOURS la ligne du membre
 *
 * L'aperçu de participants est borné à six. La ligne du membre y était
 * cherchée, donc `membership` valait `null` dès qu'il arrivait septième — sur
 * les groupes, c'est-à-dire là où son rôle compte le plus. Elle est désormais
 * lue à part, en UNE requête pour toute la page (`conversationId: { in }`).
 *
 * ## `search` porte sur le titre et l'identifiant
 *
 * Jamais sur le contenu des messages : chercher « qui a écrit tel mot » est une
 * lecture de contenu, et elle a sa porte.
 */
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { memberRoleCasings } from '@meeshy/shared/types/role-types';
import { requireUserViewAccess } from '../../middleware/admin-user-auth.middleware';
import { validatePagination } from '../../utils/pagination';
import { sendPaginatedSuccess, sendNotFound, sendBadRequest, sendInternalError } from '../../utils/response';
import { conversationActiveMemberCountSelect } from '../conversations/utils/active-member-count';
import { logError } from '../../utils/logger.js';
import { userConversationsSuccess, adminErrorResponses, userIdParams } from './user-admin-response-schemas';

export const TRIS_MEMBRE = ['lastMessageAt', 'createdAt', 'title', 'joinedAt'] as const;
export const ORDRES = ['asc', 'desc'] as const;
export const ROLES_DE_MEMBRE = ['creator', 'admin', 'moderator', 'member'] as const;

type TriMembre = (typeof TRIS_MEMBRE)[number];
type Ordre = (typeof ORDRES)[number];
type RoleDeMembre = (typeof ROLES_DE_MEMBRE)[number];

const estDans = <T extends string>(liste: readonly T[], valeur: string): valeur is T =>
  (liste as readonly string[]).includes(valeur);

/** Absent → `undefined` (aucun filtre) ; hors de la liste → `null` (400). */
function roleDeMembre(valeur: string | undefined): RoleDeMembre | undefined | null {
  if (valeur === undefined) return undefined;
  return estDans<RoleDeMembre>(ROLES_DE_MEMBRE, valeur) ? valeur : null;
}

const APERCU_PARTICIPANTS = 6;

/**
 * Les MÉTADONNÉES d'une conversation telles que l'administration les sert —
 * partagées avec `PATCH /admin/conversations/:id`
 * (`conversation-settings-sovereign.ts`), qui rend la même forme après
 * écriture : l'écran qui vient de configurer relit la ligne qu'il affiche.
 */
export const CONVERSATION_METADATA_SELECT = {
  id: true,
  identifier: true,
  title: true,
  description: true,
  type: true,
  avatar: true,
  banner: true,
  isActive: true,
  closedAt: true,
  communityId: true,
  createdAt: true,
  updatedAt: true,
  lastMessageAt: true,
  defaultWriteRole: true,
  isAnnouncementChannel: true,
  slowModeSeconds: true,
  autoTranslateEnabled: true,
  encryptionMode: true,
  // Même règle que `GET /conversations` : la colonne `memberCount` n'est écrite
  // par personne. Le compte vient de la base.
  _count: { select: conversationActiveMemberCountSelect },
  conversationMessageStats: { select: { totalMessages: true } },
} as const satisfies Prisma.ConversationSelect;

type ConversationMetadataRow = Prisma.ConversationGetPayload<{ select: typeof CONVERSATION_METADATA_SELECT }>;

/**
 * La ligne servie : les réglages regroupés sous `settings`, l'effectif et le
 * nombre de messages aplatis — `messageCount` vaut `null` quand la ligne de
 * statistiques n'existe pas, jamais `0` (ce serait affirmer un fil vide).
 */
export function serveConversationMetadata(conv: ConversationMetadataRow) {
  const {
    _count,
    conversationMessageStats,
    defaultWriteRole,
    isAnnouncementChannel,
    slowModeSeconds,
    autoTranslateEnabled,
    encryptionMode,
    ...metadonnees
  } = conv;
  return {
    ...metadonnees,
    memberCount: _count?.participants ?? 0,
    messageCount: conversationMessageStats?.totalMessages ?? null,
    settings: { defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled, encryptionMode },
  };
}

const CONVERSATION_SELECT = {
  ...CONVERSATION_METADATA_SELECT,
  participants: {
    where: { isActive: true },
    take: APERCU_PARTICIPANTS,
    orderBy: { joinedAt: 'asc' },
    select: {
      id: true,
      userId: true,
      type: true,
      displayName: true,
      avatar: true,
      role: true,
      joinedAt: true,
      isActive: true,
      nickname: true,
      user: { select: { id: true, username: true, displayName: true, avatar: true } },
    },
  },
} as const satisfies Prisma.ConversationSelect;

const MEMBERSHIP_SELECT = {
  id: true,
  userId: true,
  conversationId: true,
  displayName: true,
  role: true,
  joinedAt: true,
  nickname: true,
  isActive: true,
} as const satisfies Prisma.ParticipantSelect;

type ConversationRow = Prisma.ConversationGetPayload<{ select: typeof CONVERSATION_SELECT }>;
type MembershipRow = Partial<Prisma.ParticipantGetPayload<{ select: typeof MEMBERSHIP_SELECT }>> & {
  readonly userId?: string | null;
};

function servirLigne(conv: ConversationRow, membership: MembershipRow | null) {
  const { participants, ...metadonnees } = conv;
  return { ...serveConversationMetadata(metadonnees), participants: participants ?? [], membership };
}

type Filtres = {
  readonly type?: string;
  readonly search?: string;
  readonly isActive?: boolean;
};

function filtreDeConversation(filtres: Filtres): Prisma.ConversationWhereInput {
  const recherche = filtres.search?.trim();
  return {
    ...(filtres.type ? { type: filtres.type } : {}),
    ...(filtres.isActive !== undefined ? { isActive: filtres.isActive } : {}),
    ...(recherche
      ? {
          OR: [
            { title: { contains: recherche, mode: 'insensitive' } },
            { identifier: { contains: recherche, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

const filtreDeRole = (role: RoleDeMembre | undefined): Prisma.ParticipantWhereInput =>
  role ? { role: { in: memberRoleCasings([role]) } } : {};

type Querystring = {
  offset?: string;
  limit?: string;
  type?: string;
  sort?: string;
  order?: string;
  search?: string;
  role?: string;
  isActive?: string;
};

export function registerUserConversationsRoute(fastify: FastifyInstance): void {
  fastify.get<{ Params: { userId: string }; Querystring: Querystring }>('/admin/users/:userId/conversations', {
    preHandler: [fastify.authenticate, requireUserViewAccess],
    schema: {
      description:
        "Conversations d'un membre — métadonnées, réglages, effectif, nombre de messages et sa ligne d'appartenance. " +
        'Aucun contenu de message. Tri par activité, création, titre ou arrivée du membre. #7845.',
      tags: ['admin'],
      summary: "List a member's conversations (admin)",
      params: userIdParams,
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string' },
          limit: { type: 'string' },
          type: { type: 'string' },
          sort: { type: 'string', enum: [...TRIS_MEMBRE] },
          order: { type: 'string', enum: [...ORDRES] },
          search: { type: 'string', maxLength: 100 },
          role: { type: 'string', enum: [...ROLES_DE_MEMBRE] },
          isActive: { type: 'string', enum: ['true', 'false'] },
        },
      },
      response: { 200: userConversationsSuccess, ...adminErrorResponses },
    },
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit, type, search } = request.query;
      const sort = request.query.sort ?? 'lastMessageAt';
      const order = request.query.order ?? 'desc';
      const role = roleDeMembre(request.query.role);

      if (!estDans<TriMembre>(TRIS_MEMBRE, sort)) return sendBadRequest(reply, 'Invalid sort', { code: 'INVALID_SORT' });
      if (!estDans<Ordre>(ORDRES, order)) return sendBadRequest(reply, 'Invalid order', { code: 'INVALID_ORDER' });
      if (role === null) return sendBadRequest(reply, 'Invalid role', { code: 'INVALID_ROLE' });

      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) return sendNotFound(reply, 'Utilisateur non trouvé');

      const isActive = request.query.isActive === undefined ? undefined : request.query.isActive === 'true';
      const conversationWhere = filtreDeConversation({ type, search, isActive });
      const roleWhere = filtreDeRole(role);

      const page = sort === 'joinedAt'
        ? await pageParArrivee({ fastify, userId, order, conversationWhere, roleWhere, offsetNum, limitNum })
        : await pageParConversation({ fastify, userId, sort, order, conversationWhere, roleWhere, offsetNum, limitNum });

      return sendPaginatedSuccess(reply, page.data, {
        total: page.total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + page.data.length < page.total,
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching user conversations', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user conversations' });
    }
  });
}

type PageArgs = {
  readonly fastify: FastifyInstance;
  readonly userId: string;
  readonly order: Ordre;
  readonly conversationWhere: Prisma.ConversationWhereInput;
  readonly roleWhere: Prisma.ParticipantWhereInput;
  readonly offsetNum: number;
  readonly limitNum: number;
};

async function pageParConversation(args: PageArgs & { readonly sort: Exclude<TriMembre, 'joinedAt'> }) {
  const { fastify, userId, sort, order, conversationWhere, roleWhere, offsetNum, limitNum } = args;
  const where: Prisma.ConversationWhereInput = {
    ...conversationWhere,
    participants: { some: { userId, isActive: true, ...roleWhere } },
  };

  const [conversations, total] = await Promise.all([
    fastify.prisma.conversation.findMany({
      where,
      select: CONVERSATION_SELECT,
      orderBy: { [sort]: order },
      skip: offsetNum,
      take: limitNum,
    }),
    fastify.prisma.conversation.count({ where }),
  ]);

  const memberships = conversations.length === 0
    ? []
    : await fastify.prisma.participant.findMany({
        where: { userId, isActive: true, conversationId: { in: conversations.map((c) => c.id) } },
        select: MEMBERSHIP_SELECT,
        // Une participation par conversation de la page, au plus.
        take: conversations.length,
      });
  const parConversation = new Map(memberships.map((m) => [m.conversationId, m]));

  const data = conversations.map((conv) => {
    const apercu = (conv.participants ?? []).find((p) => p.userId === userId) ?? null;
    return servirLigne(conv, parConversation.get(conv.id) ?? apercu);
  });
  return { data, total };
}

async function pageParArrivee(args: PageArgs) {
  const { fastify, userId, order, conversationWhere, roleWhere, offsetNum, limitNum } = args;
  const where: Prisma.ParticipantWhereInput = {
    userId,
    isActive: true,
    ...roleWhere,
    conversation: conversationWhere,
  };

  const [rows, total] = await Promise.all([
    fastify.prisma.participant.findMany({
      where,
      orderBy: { joinedAt: order },
      skip: offsetNum,
      take: limitNum,
      select: { ...MEMBERSHIP_SELECT, conversation: { select: CONVERSATION_SELECT } },
    }),
    fastify.prisma.participant.count({ where }),
  ]);

  const data = rows.map(({ conversation, ...membership }) => servirLigne(conversation, membership));
  return { data, total };
}
