import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { UserRoleEnum } from '@meeshy/shared/types';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import {
  liftsSomeoneElsesHold,
  nextModerationState,
  withdrawsAudience,
  type PostModerationAction,
  type PostModerationState,
} from '../../services/admin/publication-moderation';
import { permissionsService as adminPermissionsService } from '../../services/admin/permissions.service';
import { getSharedNotificationService } from '../../services/notifications/notification-service-registry';
import { NOT_DELETED } from '../../services/posts/softDelete';
import { retractPostNotifications } from '../../services/posts/retractPostNotifications';
import { broadcastPostRemoval } from '../../socketio/broadcastPostRemoval';
import { announceCitedPostWithdrawal } from '../../socketio/announceCitedPostWithdrawal';
import { logWarn } from '../../utils/logger';

/**
 * **L'ÉCRITURE D'UN GESTE DE MODÉRATION SUR DES PUBLICATIONS** (#10315, #10392,
 * #10394) — le seul site qui écrit `visibility` et le retrait au nom de
 * l'administration. Trois portes s'en servent : la fiche d'un membre
 * (`user-publications.ts`), la liste de la plateforme (`post-gestures.ts`) et
 * le traitement d'un signalement (`moderation-acts.ts`).
 *
 * Ce qu'il tient, une fois pour les trois :
 * - la hiérarchie du signataire d'un retrait (`outrankedPlans`) et celle des
 *   auteurs des copies (`withinHierarchy`) ;
 * - les copies republiées d'une story ou d'un statut, emportées et rendues
 *   avec leur source (`copyPlans`) ;
 * - l'écriture CONDITIONNELLE sur l'état lu, en transaction, avec une ligne
 *   `AdminAuditLog` par publication changée (`writeModerationPlans`) ;
 * - ce que les clients doivent oublier (`announceWithdrawals`).
 */

export const moderationSelect = {
  id: true,
  authorId: true,
  type: true,
  visibility: true,
  visibilityUserIds: true,
  moderationHiddenAt: true,
  moderationHiddenById: true,
  moderationPriorVisibility: true,
  repostOfId: true,
  originalRepostOfId: true,
} satisfies Prisma.PostSelect;

export type ModerationRow = Prisma.PostGetPayload<{ select: typeof moderationSelect }>;

export type ModerationPlan = {
  readonly row: ModerationRow;
  readonly before: PostModerationState;
  readonly after: PostModerationState | null;
  /** La publication retirée dont cette ligne est la COPIE (republication d'une story ou d'un statut). */
  readonly copyOf?: string;
};

export type ModerationActor = { readonly id: string; readonly role: UserRoleEnum };

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString());

export const stateOf = (row: ModerationRow): PostModerationState => ({
  visibility: row.visibility,
  moderationHiddenAt: row.moderationHiddenAt,
  moderationHiddenById: row.moderationHiddenById,
  moderationPriorVisibility: row.moderationPriorVisibility,
});

const changesOf = (before: PostModerationState, after: PostModerationState) => ({
  visibility: { before: before.visibility, after: after.visibility },
  moderationHiddenAt: { before: iso(before.moderationHiddenAt), after: iso(after.moderationHiddenAt) },
  moderationHiddenById: { before: before.moderationHiddenById, after: after.moderationHiddenById },
  moderationPriorVisibility: { before: before.moderationPriorVisibility, after: after.moderationPriorVisibility },
});

export function actorOf(request: FastifyRequest): ModerationActor {
  const user = (request as UnifiedAuthRequest).authContext.registeredUser!;
  return { id: user.id, role: (user.role ?? 'USER') as UserRoleEnum };
}

/** P2034 (conflit d'écriture / interblocage) : la transaction n'a rien écrit, le lot se dit en conflit. */
const isWriteConflict = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2034';

/**
 * Les retraits que l'acteur n'a pas le rang de lever (#10315, revue de sécurité) :
 * un retrait posé par un autre ne se lève que d'un rang au moins égal au sien.
 * Un signataire INCONNU — retrait antérieur à la signature, ou compte disparu —
 * exige le rang souverain : fail-closed, sans rendre le retrait impossible à lever.
 */
export async function outrankedPlans(fastify: FastifyInstance, plans: readonly ModerationPlan[], actor: ModerationActor): Promise<ReadonlySet<string>> {
  const lifts = plans.filter((plan) => plan.after !== null && liftsSomeoneElsesHold(plan.before, plan.after, actor.id));
  if (lifts.length === 0) return new Set();
  const hiderIds = [...new Set(lifts.map((plan) => plan.before.moderationHiddenById).filter((id): id is string => id !== null))];
  const hiders =
    hiderIds.length === 0 ? [] : await fastify.prisma.user.findMany({ where: { id: { in: hiderIds } }, select: { id: true, role: true }, take: hiderIds.length });
  const sovereign = adminPermissionsService.getRoleLevel(UserRoleEnum.BIGBOSS);
  // Un rang hors de la matrice (niveau 0) ne se compare pas : il compte comme souverain.
  const levelOf = new Map(hiders.map((hider) => [hider.id, adminPermissionsService.getRoleLevel(hider.role as UserRoleEnum) || sovereign]));
  const mine = adminPermissionsService.getRoleLevel(actor.role);
  const required = (plan: ModerationPlan): number =>
    plan.before.moderationHiddenById === null ? sovereign : (levelOf.get(plan.before.moderationHiddenById) ?? sovereign);
  return new Set(lifts.filter((plan) => required(plan) > mine).map((plan) => plan.row.id));
}

const EPHEMERAL_TYPES: ReadonlySet<string> = new Set(['STORY', 'STATUS']);
const COPIES_MAX = 500;

export type HierarchySplit = { readonly plans: readonly ModerationPlan[]; readonly outranked: number };

const NO_COPIES: HierarchySplit = { plans: [], outranked: 0 };

/**
 * La hiérarchie vaut pour chaque publication ÉCRITE (troisième passe #10315) :
 * celle d'un rang égal ou supérieur n'est pas touchée, elle se compte. Un auteur
 * introuvable ou au rang hors matrice ne se laisse pas comparer : fail-closed.
 */
export async function withinHierarchy(fastify: FastifyInstance, plans: readonly ModerationPlan[], actor: ModerationActor): Promise<HierarchySplit> {
  const others = [...new Set(plans.map((plan) => plan.row.authorId).filter((id) => id !== actor.id))];
  const authors =
    others.length === 0 ? [] : await fastify.prisma.user.findMany({ where: { id: { in: others } }, select: { id: true, role: true }, take: others.length });
  const roleOf = new Map(authors.map((author) => [author.id, author.role as UserRoleEnum]));
  const manageable = (plan: ModerationPlan): boolean => {
    if (plan.row.authorId === actor.id) return true;
    const role = roleOf.get(plan.row.authorId);
    return role !== undefined && adminPermissionsService.getRoleLevel(role) > 0 && adminPermissionsService.canManageUser(actor.role, role);
  };
  const kept = plans.filter(manageable);
  return { plans: kept, outranked: plans.length - kept.length };
}

/**
 * **LES COPIES SUIVENT LEUR SOURCE** (contre-audit #10315, B-1). Republier une
 * story ou un statut en DUPLIQUE le contenu dans la republication d'un autre :
 * retirer la source sans ses copies laissait le contenu servi partout. La mise
 * hors ligne les retire avec elle, datée et signée comme elle ; la remise en
 * ligne ne rend que celles que CE retrait avait emportées (même date, même
 * signataire) — jamais une copie retirée pour elle-même.
 */
export async function copyPlans(
  fastify: FastifyInstance,
  action: PostModerationAction,
  primary: readonly ModerationPlan[],
  context: { readonly now: Date; readonly actor: ModerationActor },
): Promise<HierarchySplit> {
  if (action === 'make-private') return NO_COPIES;
  const sources = primary.filter((plan) => plan.after !== null && EPHEMERAL_TYPES.has(plan.row.type));
  if (sources.length === 0) return NO_COPIES;
  const sourceIds = sources.map((plan) => plan.row.id);
  const copies = await fastify.prisma.post.findMany({
    where: { OR: [{ repostOfId: { in: sourceIds } }, { originalRepostOfId: { in: sourceIds } }], isQuote: false, deletedAt: NOT_DELETED },
    select: moderationSelect,
    take: COPIES_MAX,
  });
  const byId = new Map(sources.map((plan) => [plan.row.id, plan]));
  const planned = copies.flatMap((copy): ModerationPlan[] => {
    const source = byId.get(copy.originalRepostOfId ?? '') ?? byId.get(copy.repostOfId ?? '');
    if (source === undefined || byId.has(copy.id)) return [];
    const before = stateOf(copy);
    const sameHold =
      before.moderationHiddenAt !== null &&
      source.before.moderationHiddenAt !== null &&
      before.moderationHiddenAt.getTime() === source.before.moderationHiddenAt.getTime() &&
      before.moderationHiddenById === source.before.moderationHiddenById;
    if (action === 'restore' && !sameHold) return [];
    const after = nextModerationState(action, before, { now: context.now, actorId: context.actor.id });
    return after === null ? [] : [{ row: copy, before, after, copyOf: source.row.id }];
  });
  return withinHierarchy(fastify, planned, context.actor);
}

/**
 * Ce que les CLIENTS doivent oublier, et ce que l'inbox doit retirer : effets hors
 * transaction, jamais bloquants. `withdrawing` dit si le geste RETIRE (mettre hors
 * ligne, en privé, passer en PRIVATE) — une remise en ligne ne retire rien.
 */
export function announceWithdrawals(fastify: FastifyInstance, withdrawing: boolean, applied: readonly ModerationPlan[]): void {
  applied
    .filter((plan) => plan.after !== null && withdrawsAudience(plan.before, plan.after))
    .forEach((plan) =>
      broadcastPostRemoval(
        fastify.socialEvents,
        { id: plan.row.id, authorId: plan.row.authorId, type: plan.row.type, visibility: plan.before.visibility, visibilityUserIds: plan.row.visibilityUserIds },
        (err) => logWarn(fastify.log, '[admin publications] broadcast withdrawal failed', err),
      ),
    );

  const withdrawn = applied.filter((plan) => plan.after !== null && plan.after.visibility === 'PRIVATE' && withdrawing);
  if (withdrawn.length === 0) return;
  // Les citations ouvertes dans les conversations se disent retirées sur-le-champ, comme au retrait définitif.
  const io = fastify.socketIOHandler?.getManager?.()?.getIO();
  // Une socket jointe à la salle du post quand il était lisible y resterait, et
  // recevrait les éditions de l'auteur pendant le retrait : la salle se vide, et
  // `post:join` refait passer la porte de visibilité à qui revient.
  withdrawn.forEach((plan) => io?.in(ROOMS.post(plan.row.id)).socketsLeave(ROOMS.post(plan.row.id)));
  withdrawn
    .filter((plan) => plan.after?.moderationHiddenAt != null)
    .forEach((plan) =>
      announceCitedPostWithdrawal({ prisma: fastify.prisma, io, post: { id: plan.row.id, type: plan.row.type, moderationHiddenAt: plan.after?.moderationHiddenAt ?? null } }).catch((err) =>
        logWarn(fastify.log, '[admin publications] cited withdrawal announce failed', err),
      ),
    );
  retractPostNotifications(
    fastify.prisma,
    withdrawn.map((plan) => plan.row.id),
    getSharedNotificationService(),
  ).catch((err) => logWarn(fastify.log, '[admin publications] notification retraction failed', err));
}

/** L'état LU, posé en condition de l'écriture : une valeur absente du document vaut `null` lu. */
function expectedStateWhere(plan: ModerationPlan): Prisma.PostWhereInput {
  const nullable = (field: 'moderationHiddenAt' | 'moderationHiddenById' | 'moderationPriorVisibility', value: unknown): Prisma.PostWhereInput =>
    value === null ? { OR: [{ [field]: null }, { [field]: { isSet: false } }] } : { [field]: value };
  return {
    id: plan.row.id,
    authorId: plan.row.authorId,
    deletedAt: NOT_DELETED,
    visibility: plan.before.visibility,
    AND: [
      nullable('moderationHiddenAt', plan.before.moderationHiddenAt),
      nullable('moderationHiddenById', plan.before.moderationHiddenById),
      nullable('moderationPriorVisibility', plan.before.moderationPriorVisibility),
    ],
  };
}

/**
 * Écriture CONDITIONNELLE et SÉQUENTIELLE dans une transaction : chaque mise à jour
 * ne porte que sur l'état lu ; une publication changée entre-temps n'est pas écrasée
 * et se dit `conflict`. Le journal n'écrit que ce qui a changé. Une transaction
 * avortée par un conflit d'écriture concurrent rend `[]` — jamais un 500 ni un
 * changement partiel. `extra` écrit, dans la MÊME transaction, ce que le geste
 * engage à côté (le statut d'un signalement).
 */
export async function writeModerationPlans(
  fastify: FastifyInstance,
  request: FastifyRequest,
  input: {
    readonly writes: readonly ModerationPlan[];
    readonly actorId: string;
    readonly metadataOf: (plan: ModerationPlan) => Record<string, unknown>;
    readonly extra?: (tx: Prisma.TransactionClient, applied: readonly ModerationPlan[]) => Promise<void>;
  },
): Promise<readonly ModerationPlan[]> {
  if (input.writes.length === 0 && input.extra === undefined) return [];
  return fastify.prisma
    .$transaction(async (tx) => {
      const done: ModerationPlan[] = [];
      for (const plan of input.writes) {
        const result = await tx.post.updateMany({ where: expectedStateWhere(plan), data: plan.after as PostModerationState });
        if (result.count === 1) done.push(plan);
      }
      if (done.length > 0) {
        await tx.adminAuditLog.createMany({
          data: done.map((plan) => ({
            userId: plan.row.authorId,
            adminId: input.actorId,
            action: 'MODERATE_POST',
            entity: 'Post',
            entityId: plan.row.id,
            changes: JSON.stringify(changesOf(plan.before, plan.after as PostModerationState)),
            metadata: JSON.stringify({ type: plan.row.type, ...input.metadataOf(plan), ...(plan.copyOf === undefined ? {} : { copyOf: plan.copyOf }) }),
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
          })),
        });
      }
      if (input.extra !== undefined) await input.extra(tx, done);
      return done;
    })
    .catch((error: unknown) => {
      if (isWriteConflict(error)) return [];
      throw error;
    });
}
