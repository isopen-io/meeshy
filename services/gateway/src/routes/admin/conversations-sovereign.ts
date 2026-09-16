/**
 * `GET /admin/conversations` — LE LISTING DE L'INSTANCE, quatrième geste
 * souverain du dépôt (#6861).
 *
 * ## Le trou qu'il comble
 *
 * Relevé exhaustif des vingt-cinq adresses `/admin` avant ce lot : trois
 * touchaient aux conversations, et **les trois supposaient qu'on tenait déjà
 * un identifiant**.
 *
 * | adresse | ce qu'elle exige de l'appelant |
 * |---|---|
 * | `GET /admin/users/:userId/conversations` | connaître un MEMBRE |
 * | `GET /admin/conversations/:id/participants` | connaître la CONVERSATION |
 * | `GET /admin/conversations/:id/messages` | connaître la CONVERSATION |
 *
 * Un administrateur partant d'un signalement qui nomme une conversation, ou
 * cherchant par titre, n'avait aucun point d'entrée : il devait deviner un
 * membre qui y participe, puis la retrouver dans SA liste. Directive porteur
 * du 2026-09-16 : « le listing des conversation … lorsqu'on est au moins de
 * rang bigboss ».
 *
 * ## Pourquoi SOUVERAIN, quand le listing par membre se contente de `canViewUsers`
 *
 * Ce n'est pas le même geste. La liste des conversations d'un compte est une
 * pièce de SA fiche — elle répond à « que fait cette personne », la question
 * qu'un modérateur instruit déjà. Le listing de l'instance répond à « que se
 * passe-t-il ici », et c'est un INVENTAIRE de la vie privée de tous les
 * membres : qui parle à qui, depuis quand, dans quels groupes. Il se range
 * avec la lecture de contenu, pas avec la consultation d'une fiche —
 * `requireSovereign()`, BIGBOSS et lui seul.
 *
 * ## Pourquoi PAS de motif écrit ici, quand la lecture des messages en exige un
 *
 * Le motif (`reason`, dix caractères, refusé au schéma, consigné dans
 * `AdminAuditLog`) garde l'ouverture d'un CONTENU. Cette route n'en ouvre
 * aucun : elle sert des métadonnées — titre, type, effectif, dates. Exiger un
 * motif pour parcourir un index, puis un second pour lire ce qu'on y a
 * trouvé, transformerait la trace en formalité et affaiblirait celle qui
 * compte. Un titre de conversation n'est pas un message, et c'est la
 * frontière que cette route tient.
 *
 * ## Le tri par EFFECTIF n'est pas offert, et c'est délibéré
 *
 * `Conversation.memberCount` est une colonne MORTE — personne ne l'écrit
 * (voir `conversationActiveMemberCountSelect`, qui existe précisément pour
 * cette raison). Le compte servi vient d'un `_count` filtré sur les
 * participants ACTIFS, calculé après la requête. Un `orderBy: { memberCount }`
 * trierait donc sur des zéros, en silence, avec l'air de fonctionner : c'est
 * la loi 4 — un contrôle existe s'il a un effet. Trier par effectif réel
 * demanderait une agrégation ; le jour où le besoin est mesuré, il sera son
 * propre lot.
 *
 * ## La pagination voyage À CÔTÉ de `data`
 *
 * `sendPaginatedSuccess`, comme `…/users/:id/media` et `…/users/:id/conversations`
 * — et à l'INVERSE de `GET /admin/users`, qui sert la sienne DEDANS. Cet écart
 * existe dans le dépôt et a déjà coûté un décodeur v2 ; le respecter ici évite
 * d'en inventer un troisième.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { requireSovereign } from '../../middleware/authorize';
import { validatePagination } from '../../utils/pagination';
import { sendPaginatedSuccess, sendInternalError } from '../../utils/response';
import { conversationActiveMemberCountSelect } from '../conversations/utils/active-member-count';
import { logError } from '../../utils/logger.js';

/** Les deux seuls tris possibles — voir le doc-comment de module pour `memberCount`. */
const TRIS = ['lastMessageAt', 'createdAt'] as const;
type Tri = (typeof TRIS)[number];

const PARTICIPANTS_SERVIS = 6;

export function registerConversationsSovereignRoute(fastify: FastifyInstance): void {
  fastify.get<{
    Querystring: {
      offset?: string;
      limit?: string;
      type?: string;
      isActive?: string;
      search?: string;
      sort?: string;
      createdAfter?: string;
      createdBefore?: string;
    };
  }>('/admin/conversations', {
    onRequest: [fastify.authenticate, requireSovereign()],
    schema: {
      description:
        "Liste les conversations de l'instance — MÉTADONNÉES seules, aucun contenu de message. Rang souverain " +
        '(BIGBOSS) : un index de qui parle à qui est un inventaire de la vie privée des membres, pas une fiche. #6861.',
      tags: ['admin'],
      summary: 'List the instance conversations (sovereign)',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Pagination offset' },
          limit: { type: 'string', description: 'Pagination limit (max 100)' },
          type: { type: 'string', description: 'Filtre sur le type de conversation' },
          isActive: { type: 'string', description: '"true" / "false" — filtre sur l\'activité' },
          search: { type: 'string', description: 'Recherche sur le TITRE et l\'IDENTIFIANT, jamais sur le contenu' },
          sort: { type: 'string', enum: [...TRIS], description: 'lastMessageAt (défaut) ou createdAt' },
          createdAfter: { type: 'string', format: 'date-time' },
          createdBefore: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          description: 'Conversations successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  identifier: { type: 'string', nullable: true },
                  title: { type: 'string', nullable: true },
                  type: { type: 'string', nullable: true },
                  avatar: { type: 'string', nullable: true },
                  isActive: { type: 'boolean', nullable: true },
                  communityId: { type: 'string', nullable: true },
                  memberCount: { type: 'number' },
                  createdAt: { type: 'string', format: 'date-time', nullable: true },
                  lastMessageAt: { type: 'string', format: 'date-time', nullable: true },
                  participants: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        userId: { type: 'string', nullable: true },
                        type: { type: 'string', nullable: true },
                        displayName: { type: 'string', nullable: true },
                        avatar: { type: 'string', nullable: true },
                        role: { type: 'string', nullable: true },
                        joinedAt: { type: 'string', format: 'date-time', nullable: true },
                        isActive: { type: 'boolean', nullable: true }
                      }
                    }
                  }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const {
        offset = '0',
        limit,
        type,
        isActive,
        search,
        sort,
        createdAfter,
        createdBefore,
      } = request.query as {
        offset?: string;
        limit?: string;
        type?: string;
        isActive?: string;
        search?: string;
        sort?: string;
        createdAfter?: string;
        createdBefore?: string;
      };
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, {
        defaultLimit: 20,
        maxLimit: 100,
      });

      /**
       * Les clauses s'accumulent dans un `AND`, jamais à la racine : la
       * recherche pose son PROPRE `OR` (titre ou identifiant), et deux `OR`
       * frères posés au même niveau s'écrasent en silence — le piège que
       * `contactLookupScope` documente déjà pour la même raison.
       */
      const clauses: Prisma.ConversationWhereInput[] = [];

      // Un filtre VIDE n'est pas un filtre : `type: ''` ne rendrait AUCUNE
      // conversation là où l'appelant les voulait toutes.
      if (type !== undefined && type !== '') clauses.push({ type });
      if (isActive === 'true') clauses.push({ isActive: true });
      if (isActive === 'false') clauses.push({ isActive: false });

      const recherche = (search ?? '').trim();
      if (recherche !== '') {
        clauses.push({
          OR: [
            { title: { contains: recherche, mode: 'insensitive' } },
            { identifier: { contains: recherche, mode: 'insensitive' } },
          ],
        });
      }

      // `format: 'date-time'` refuse déjà une borne illisible au SCHÉMA, par
      // un 400, avant que ce handler existe — mesuré : `findMany` n'est pas
      // appelé. Ce repli est donc une SECONDE ligne, pas la garde : il couvre
      // le jour où le schéma perdrait son `format` (ou un appel interne qui
      // court-circuiterait la validation), et transforme alors un `Invalid
      // Date` — que Prisma rejetterait par un 500 — en filtre simplement
      // absent. Il n'est PAS mort : il est en profondeur.
      const borne = (valeur: string | undefined): Date | null => {
        if (valeur === undefined || valeur === '') return null;
        const date = new Date(valeur);
        return Number.isNaN(date.getTime()) ? null : date;
      };
      const apres = borne(createdAfter);
      const avant = borne(createdBefore);
      if (apres !== null) clauses.push({ createdAt: { gte: apres } });
      if (avant !== null) clauses.push({ createdAt: { lte: avant } });

      const where: Prisma.ConversationWhereInput = clauses.length === 0 ? {} : { AND: clauses };

      const triDemande: Tri = TRIS.includes(sort as Tri) ? (sort as Tri) : 'lastMessageAt';

      const [conversations, total] = await Promise.all([
        fastify.prisma.conversation.findMany({
          where,
          select: {
            id: true,
            identifier: true,
            title: true,
            type: true,
            avatar: true,
            isActive: true,
            communityId: true,
            createdAt: true,
            lastMessageAt: true,
            // La colonne `memberCount` est MORTE : le compte vient d'ici, et
            // de nulle part ailleurs. Fragment PARTAGÉ, jamais retapé.
            _count: { select: conversationActiveMemberCountSelect },
            participants: {
              where: { isActive: true },
              take: PARTICIPANTS_SERVIS,
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
              },
            },
          },
          orderBy: { [triDemande]: 'desc' },
          skip: offsetNum,
          take: limitNum,
        }),
        fastify.prisma.conversation.count({ where }),
      ]);

      const data = conversations.map((conversation) => {
        const { _count, ...reste } = conversation as typeof conversation & {
          _count: { participants: number };
        };
        return { ...reste, memberCount: _count.participants };
      });

      return sendPaginatedSuccess(reply, data, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + conversations.length < total,
      });
    } catch (error) {
      logError(fastify.log, 'Error listing instance conversations', error);
      return sendInternalError(reply, 'Internal server error', {
        message: 'Failed to list conversations',
      });
    }
  });
}
