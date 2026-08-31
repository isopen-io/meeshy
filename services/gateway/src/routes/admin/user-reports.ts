/**
 * `Report` pour un utilisateur — ce que l'administration lit de cette table,
 * et sous quel régime (#4157, étendu par #4494).
 *
 * ## Les deux portes, et pourquoi elles vivent ENSEMBLE
 *
 * `GET /admin/users/:userId/reports` (signalements déposés PAR l'utilisateur,
 * `Report.reporterId`) et `GET /admin/users/:userId/reported-messages`
 * (messages ÉCRITS par l'utilisateur qui ont été signalés — jointure sur
 * `Report.reportedEntityId`, polymorphe, résolue ici vers `Message`) lisent
 * la MÊME table sous des colonnes différentes, mais avec la MÊME question de
 * fond : quelle permission faut-il pour la lire ? #4157 a relevé le seuil de
 * la première porte à `canModerateContent` sans regarder sa voisine, restée à
 * `canViewUsers` — un écart RÉEL (AUDIT garde les métadonnées d'un
 * signalement, jamais le corps du message signalé) mais qui doit être
 * DÉCLARÉ, pas oublié. `SEUILS_REPORT` porte ce registre : un seuil par
 * porte, et une raison écrite dès qu'il diffère du plus haut
 * (`REPORT_PERMISSION_LA_PLUS_HAUTE`). Le balayage structurel de
 * `reported-messages-audit-content-guard.test.ts` relit le SOURCE de ce
 * fichier pour vérifier qu'aucune troisième porte lisant `Report` n'a été
 * ajoutée sans y être déclarée — c'est ce couplage qui justifie de tenir les
 * deux portes dans un module à part, plutôt que dispersées dans
 * `routes/admin/users.ts` où un tel balayage ne pourrait rien affirmer sur
 * « tout ce qui lit Report ».
 *
 * ## Le plafond de balayage (#4165)
 *
 * `Report.reportedEntityId` est polymorphe (message, user, conversation,
 * communauté, post, story — aucune relation Prisma déclarée), donc
 * `reported-messages` doit D'ABORD énumérer les participations puis les
 * messages de l'utilisateur pour construire le filtre `reportedEntityId IN
 * […]`. Cette énumération était SANS BORNE ; `REPORTED_MESSAGES_PARTICIPANT_SCAN_CAP`
 * / `REPORTED_MESSAGES_MESSAGE_SCAN_CAP` la plafonnent large (au-delà d'un
 * usage normal) plutôt que de la laisser illimitée.
 *
 * ## Extraction (#4284)
 *
 * Déplacé de `routes/admin/users.ts`, qui a franchi le budget de taille des
 * fichiers de routes écrits à la main (< 1000 lignes,
 * `route-file-size-budget.test.ts`), selon le même motif que
 * `conversation-messages-sovereign.ts` : un module qui exporte une fonction
 * `register…Routes(fastify)`, une unité nommable à part entière plutôt qu'une
 * tranche de plus dans un fichier déjà au plafond. `SEUILS_REPORT` et
 * `REPORT_PERMISSION_LA_PLUS_HAUTE` sont réexportés par `users.ts` —
 * `reported-messages-audit-content-guard.test.ts` les importe depuis
 * `routes/admin/users`, une dépendance publique que ce déplacement ne casse
 * pas.
 */
import type { FastifyInstance } from 'fastify';
import { UserRoleEnum } from '@meeshy/shared/types';
import { requireUserViewAccess } from '../../middleware/admin-user-auth.middleware';
import { requirePermission } from '../../middleware/authorize';
import { permissionsService } from '../../services/admin/permissions.service';
import { UnifiedAuthContext, UnifiedAuthRequest } from '../../middleware/auth';
import { validatePagination } from '../../utils/pagination';
import { sendNotFound, sendInternalError, sendPaginatedSuccess } from '../../utils/response';

// #4165 — plafonds de l'énumération, en amont de `GET
// /admin/users/:userId/reported-messages`, des conversations puis des
// messages d'un utilisateur (`Report.reportedEntityId` étant polymorphe, voir
// le commentaire au site d'appel). Larges par rapport à un usage normal :
// couvrent un compte qui aurait rejoint 2 000 conversations ou envoyé 20 000
// messages, tout en éliminant le scan réellement illimité que l'audit signale.
const REPORTED_MESSAGES_PARTICIPANT_SCAN_CAP = 2_000;
const REPORTED_MESSAGES_MESSAGE_SCAN_CAP = 20_000;

/**
 * Le seuil de CHAQUE porte de ce fichier qui lit `Report` (#4157, étendu par
 * #4494 : deux seuils sur une même donnée, c'est le plus bas qui décide, sur
 * TOUTES ses portes). Un écart avec `REPORT_PERMISSION_LA_PLUS_HAUTE` se
 * déclare ICI, en donnée, avec sa raison — jamais en commentaire, que rien ne
 * confronte au code. Balayage : `__tests__/unit/routes/admin/reported-messages-audit-content-guard.test.ts`.
 */
export type PermissionReport = 'canViewUsers' | 'canModerateContent';

export type SeuilReport = {
  readonly porte: string;
  readonly permission: PermissionReport;
  /** Requise dès que `permission` n'est pas `REPORT_PERMISSION_LA_PLUS_HAUTE`. */
  readonly raisonEcart?: string;
};

export const REPORT_PERMISSION_LA_PLUS_HAUTE: PermissionReport = 'canModerateContent';

export const SEUILS_REPORT: readonly SeuilReport[] = [
  {
    porte: 'GET /admin/users/:userId/reports',
    permission: REPORT_PERMISSION_LA_PLUS_HAUTE
  },
  {
    porte: 'GET /admin/users/:userId/reported-messages',
    permission: 'canViewUsers',
    raisonEcart:
      "AUDIT garde les métadonnées (son métier : auditer la modération), " +
      "jamais `content` — retiré par le handler, même motif qu'attachmentProtectionSelect (l. 683)."
  }
];

export function registerUserReportsRoutes(fastify: FastifyInstance): void {
  /**
   * GET /admin/users/:userId/reports - Reports filed BY a user (reporterId).
   * Requires canViewUsers permission.
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string; status?: string };
  }>('/admin/users/:userId/reports', {
    // #4157 — DEUX seuils gouvernaient la même table : `GET /admin/reports`
    // exige `canModerateContent` (MODERATOR, ADMIN, BIGBOSS) quand celle-ci se
    // contentait de `canViewUsers`, qui admet AUDIT en plus. Deux seuils sur
    // une même donnée, c'est le plus bas qui décide — et le filtre par
    // `reporterId` ne change pas la nature de ce qui est lu.
    //
    // #4494 — cette règle vaut pour LES DEUX portes de ce fichier qui lisent
    // `Report`, pas seulement celle-ci : `reported-messages`, plus bas, reste
    // à `canViewUsers` — SEUILS_REPORT dit pourquoi ce n'est pas l'oubli que
    // #4157 a laissé passer ici (AUDIT y garde les métadonnées du signalement,
    // jamais `content`).
    preHandler: [fastify.authenticate, requireUserViewAccess, requirePermission(REPORT_PERMISSION_LA_PLUS_HAUTE)]
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { offset = '0', limit, status } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const where: Record<string, unknown> = { reporterId: userId };
      if (status) {
        where.status = status;
      }

      const [reports, total] = await Promise.all([
        fastify.prisma.report.findMany({
          where,
          select: {
            id: true,
            reportedType: true,
            reportedEntityId: true,
            reportType: true,
            reason: true,
            status: true,
            actionTaken: true,
            createdAt: true,
            resolvedAt: true
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.report.count({ where })
      ]);

      return sendPaginatedSuccess(reply, reports, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + reports.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user reports');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user reports' });
    }
  });

  /**
   * GET /admin/users/:userId/reported-messages - Messages authored by the user
   * that have been reported. Each item is a report joined with its message.
   * Requires canViewUsers permission ; `message.content` requires
   * canModerateContent in addition (#4494 — see SEUILS_REPORT).
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { offset?: string; limit?: string };
  }>('/admin/users/:userId/reported-messages', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const viewerRole = authContext.registeredUser!.role as UserRoleEnum;
      // #4494 — AUDIT franchit `requireUserViewAccess` sans `canModerateContent` :
      // il garde son métier (auditer), pas le corps du message. Voir SEUILS_REPORT.
      const canSeeReportedContent = permissionsService.hasPermission(viewerRole, REPORT_PERMISSION_LA_PLUS_HAUTE);

      const { userId } = request.params;
      const { offset = '0', limit } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 20, maxLimit: 100 });

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const emptyPage = () => sendPaginatedSuccess(reply, [], { total: 0, offset: offsetNum, limit: limitNum, hasMore: false });

      // BORNÉ (#4165), et c'est un compromis À DOCUMENTER, pas un simple
      // `take` ajouté : `Report.reportedEntityId` est POLYMORPHE (message,
      // user, conversation, community, post, story — `schema.prisma`, aucune
      // relation Prisma déclarée), donc aucune requête ne peut pousser
      // "expéditeur du message = userId" DANS `report.findMany` lui-même. Il
      // faut D'ABORD énumérer les messages de l'utilisateur pour construire le
      // filtre `reportedEntityId IN […]` — c'est cette énumération qui était
      // SANS `take` : sur un compte très actif (des dizaines de milliers de
      // messages), CHAQUE page de signalements repayait la totalité de son
      // historique. Ordonnées par récence, les deux requêtes plafonnent large
      // (bien au-delà d'un usage normal) : au-delà, ce sont les conversations/
      // messages les plus ANCIENS qui sortent du périmètre — les plus probables
      // d'être déjà résolus, les moins probables d'être encore sous
      // modération active. Une borne exacte demanderait une relation dédiée
      // sur `Report` (hors territoire de ce lot, `schema.prisma` étant un
      // fichier-carrefour).
      const participants = await fastify.prisma.participant.findMany({
        where: { userId, type: 'user' },
        select: { id: true },
        orderBy: { joinedAt: 'desc' },
        take: REPORTED_MESSAGES_PARTICIPANT_SCAN_CAP
      });
      const participantIds = participants.map((p) => p.id);
      if (participantIds.length === 0) return emptyPage();

      // Message ids authored by the user (bounded by the user's own messages).
      const userMessages = await fastify.prisma.message.findMany({
        where: { senderId: { in: participantIds } },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        take: REPORTED_MESSAGES_MESSAGE_SCAN_CAP
      });
      const messageIds = userMessages.map((m) => m.id);
      if (messageIds.length === 0) return emptyPage();

      const reportWhere = { reportedType: 'message', reportedEntityId: { in: messageIds } };

      const [reports, total] = await Promise.all([
        fastify.prisma.report.findMany({
          where: reportWhere,
          select: {
            id: true,
            reportedEntityId: true,
            reportType: true,
            reason: true,
            status: true,
            reporterId: true,
            reporterName: true,
            createdAt: true,
            resolvedAt: true
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.report.count({ where: reportWhere })
      ]);

      const reportedMessageIds = [...new Set(reports.map((r) => r.reportedEntityId))];
      // Déjà borné IMPLICITEMENT : `reportedMessageIds` dérive de `reports`,
      // la page ≤ `limitNum` posée ci-dessus par `report.findMany`. `take`
      // explicite quand même (#4165) — la borne ne doit pas dépendre d'un
      // raisonnement à distance sur la taille d'un tableau amont.
      const messages = reportedMessageIds.length > 0
        ? await fastify.prisma.message.findMany({
            where: { id: { in: reportedMessageIds } },
            select: { id: true, content: true, conversationId: true, messageType: true, createdAt: true, deletedAt: true },
            take: reportedMessageIds.length
          })
        : [];
      // La ligne reste : un AUDIT doit pouvoir constater qu'un message a été
      // signalé, par qui, pourquoi. Seul `content` — le texte écrit par
      // l'utilisateur — tombe à `null` pour qui n'a pas canModerateContent.
      const messageMap = new Map(
        messages.map((m) => [m.id, canSeeReportedContent ? m : { ...m, content: null }])
      );

      const data = reports.map((r) => ({ ...r, message: messageMap.get(r.reportedEntityId) ?? null }));

      return sendPaginatedSuccess(reply, data, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + reports.length < total
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error fetching user reported messages');
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user reported messages' });
    }
  });
}
