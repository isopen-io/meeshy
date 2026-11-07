import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type CommunityMembershipSyncPrisma = Pick<PrismaClient, 'communityMember' | 'user'>;

type AdmittedRole = 'admin' | 'member';

export type CommunityAdmission =
  | {
      readonly kind: 'admitted';
      readonly reactivations: ReadonlyArray<{ readonly id: string; readonly role: AdmittedRole }>;
      readonly creations: ReadonlyArray<{ readonly userId: string; readonly role: AdmittedRole }>;
    }
  | { readonly kind: 'refused'; readonly reason: 'invite-forbidden' | 'not-addable' };

export type CommunityAdmissionRequest = {
  readonly communityId: string;
  readonly actorId: string;
  readonly createdBy: string;
  readonly isPrivate: boolean;
  /** Le rang de la ligne ACTIVE de l'appelant, `null` s'il n'en a pas (le créateur parti). */
  readonly actorRole: string | null;
  readonly participantIds: readonly string[];
  /**
   * L'appelant entre-t-il lui-même ? Oui quand il CRÉE un salon (le créateur de
   * la communauté parti y revient administrateur) ; jamais quand il ajoute
   * quelqu'un à un salon existant — inviter ne réinscrit pas l'inviteur.
   */
  readonly admitActor?: boolean;
};

const INVITING_ROLES: ReadonlySet<string> = new Set(['admin', 'moderator']);

function mayAdmitOthers(request: CommunityAdmissionRequest): boolean {
  if (!request.isPrivate) return true;
  if (request.actorId === request.createdBy) return true;
  return request.actorRole !== null && INVITING_ROLES.has(request.actorRole);
}

/**
 * La loi de `isAddableUser` (compte vivant, aucun blocage dans un sens ou dans
 * l'autre), en DEUX lectures pour tout un lot : un salon peut naître avec des
 * centaines de participants, et deux requêtes par personne feraient une rafale.
 */
async function everyoneAddable(
  prisma: CommunityMembershipSyncPrisma,
  actorId: string,
  userIds: readonly string[],
): Promise<boolean> {
  if (userIds.length === 0) return true;
  const ids = [...userIds];
  const living = await prisma.user.findMany({
    where: { id: { in: ids }, isActive: true, deactivatedAt: null, deletedAt: null },
    select: { id: true },
    take: ids.length,
  });
  const livingIds = new Set(living.map((user) => user.id));
  if (!ids.every((id) => livingIds.has(id))) return false;
  const blocking = await prisma.user.findFirst({
    where: {
      OR: [
        { id: actorId, blockedUserIds: { hasSome: ids } },
        { id: { in: ids }, blockedUserIds: { has: actorId } },
      ],
    },
    select: { id: true },
  });
  return blocking === null;
}

/**
 * QUI ENTRE DANS LA COMMUNAUTÉ quand on y crée une conversation (#16639).
 *
 * `POST /conversations` avec un `communityId` fait entrer ses participants
 * dans la communauté hôte. C'est une INVITATION, et elle suit la loi de
 * `POST …/invite` : dans une communauté privée, seuls son créateur, ses
 * administrateurs et ses modérateurs font entrer quelqu'un ; la personne a un
 * compte vivant et aucun blocage avec l'appelant (la loi d'`isAddableUser`) ; une ligne
 * laissée par un départ ou un retrait (#5760) se réactive en MEMBER — un rang
 * se donne, il ne se retrouve pas dans une ligne périmée. Un participant déjà
 * membre actif n'entre pas : il n'est ni vérifié ni touché.
 *
 * Le plan se calcule AVANT la création, pour refuser sans rien écrire. Le
 * seul appelant sans ligne active admis par la route est le créateur de la
 * communauté : il y revient administrateur.
 */
export async function planCommunityAdmission(
  prisma: CommunityMembershipSyncPrisma,
  request: CommunityAdmissionRequest,
): Promise<CommunityAdmission> {
  const participantIds = [...new Set(request.participantIds)].filter((id) => id !== request.actorId);
  const userIds = [request.actorId, ...participantIds];
  const rows = await prisma.communityMember.findMany({
    where: { communityId: request.communityId, userId: { in: userIds } },
    select: { id: true, userId: true, isActive: true },
  });
  // Aucun index unique ne tient la paire (communityId, userId) : si une course
  // en a laissé deux, la ligne ACTIVE fait foi.
  const rowOf = new Map(
    [...rows].sort((a, b) => Number(a.isActive) - Number(b.isActive)).map((row) => [row.userId, row]),
  );
  const entering = participantIds.filter((userId) => rowOf.get(userId)?.isActive !== true);

  if (entering.length > 0 && !mayAdmitOthers(request)) {
    return { kind: 'refused', reason: 'invite-forbidden' };
  }
  if (!(await everyoneAddable(prisma, request.actorId, entering))) {
    return { kind: 'refused', reason: 'not-addable' };
  }

  const actorEntering = request.admitActor === false || rowOf.get(request.actorId)?.isActive === true
    ? []
    : [request.actorId];
  const admissions = [
    ...actorEntering.map((userId) => ({ userId, role: 'admin' as const })),
    ...entering.map((userId) => ({ userId, role: 'member' as const })),
  ];
  return {
    kind: 'admitted',
    reactivations: admissions.flatMap(({ userId, role }) => {
      const row = rowOf.get(userId);
      return row ? [{ id: row.id, role }] : [];
    }),
    creations: admissions.filter(({ userId }) => !rowOf.has(userId)),
  };
}

/** Écrit un plan admis par `planCommunityAdmission`, après la création de la conversation. */
export async function applyCommunityAdmission(
  prisma: Pick<PrismaClient, 'communityMember'>,
  communityId: string,
  admission: Extract<CommunityAdmission, { kind: 'admitted' }>,
): Promise<void> {
  const roles: readonly AdmittedRole[] = ['admin', 'member'];
  for (const role of roles) {
    const ids = admission.reactivations.filter((r) => r.role === role).map((r) => r.id);
    if (ids.length === 0) continue;
    await prisma.communityMember.updateMany({
      where: { id: { in: ids }, isActive: false },
      data: { isActive: true, leftAt: null, role },
    });
  }
  if (admission.creations.length > 0) {
    await prisma.communityMember.createMany({
      data: admission.creations.map(({ userId, role }) => ({ communityId, userId, role })),
    });
  }
}

const NOTHING_TO_WRITE: CommunityAdmission = { kind: 'admitted', reactivations: [], creations: [] };

/** La communauté PRIVÉE et vivante qui héberge un salon, vue depuis celui qui y fait entrer. */
export type SalonCommunity = {
  readonly communityId: string;
  readonly createdBy: string;
  readonly actorId: string;
  /** Le rang de la ligne ACTIVE de l'appelant, `null` s'il n'en a pas. */
  readonly actorRole: string | null;
};

export type SalonEntrant =
  | { readonly kind: 'registered'; readonly userId: string }
  | { readonly kind: 'guest' };

export type SalonCommunityPrisma = Pick<PrismaClient, 'community' | 'communityMember' | 'user'>;

/**
 * Lit, UNE fois par requête, la communauté qui héberge un salon. `null` quand
 * le salon n'en a pas, ou quand elle est publique : rien n'y change (#16695).
 */
export async function loadSalonCommunity(
  prisma: Pick<PrismaClient, 'community'>,
  salon: { readonly communityId: string | null | undefined; readonly actorId: string },
): Promise<SalonCommunity | null> {
  if (!salon.communityId) return null;
  const community = await prisma.community.findFirst({
    where: { id: salon.communityId, isActive: true },
    select: { createdBy: true, isPrivate: true, members: { where: { userId: salon.actorId, isActive: true }, select: { role: true }, take: 1 } },
  });
  if (!community?.isPrivate) return null;
  return {
    communityId: salon.communityId,
    createdBy: community.createdBy,
    actorId: salon.actorId,
    actorRole: community.members[0]?.role ?? null,
  };
}

/**
 * QUI ENTRE DANS UN SALON D'UNE COMMUNAUTÉ PRIVÉE (#16695).
 *
 * Y entrer, c'est lire ce que la communauté réserve à ses membres : c'est donc
 * y être admis, sous la loi de `planCommunityAdmission` — un membre actif entre
 * sans rien écrire ; un autre n'entre que par le créateur, un administrateur ou
 * un modérateur de la communauté, et y devient membre. L'« appelant » est
 * celui qui ajoute (`…/invite`, `…/participants`) ou l'auteur du lien de
 * partage : un lien ne donne que ce que son auteur pourrait donner
 * aujourd'hui. Un invité sans compte ne peut pas être membre : il n'entre que
 * par le lien de quelqu'un qui peut faire entrer, et rien ne s'écrit.
 */
export async function planSalonEntry(
  prisma: SalonCommunityPrisma,
  community: SalonCommunity | null,
  entrant: SalonEntrant,
): Promise<CommunityAdmission> {
  if (!community) return NOTHING_TO_WRITE;
  const request: CommunityAdmissionRequest = {
    communityId: community.communityId,
    actorId: community.actorId,
    createdBy: community.createdBy,
    isPrivate: true,
    actorRole: community.actorRole,
    participantIds: entrant.kind === 'registered' ? [entrant.userId] : [],
    admitActor: false,
  };
  if (entrant.kind === 'guest') {
    return mayAdmitOthers(request) ? NOTHING_TO_WRITE : { kind: 'refused', reason: 'invite-forbidden' };
  }
  if (entrant.userId === community.actorId) {
    return community.actorRole !== null || community.actorId === community.createdBy
      ? NOTHING_TO_WRITE
      : { kind: 'refused', reason: 'invite-forbidden' };
  }
  return planCommunityAdmission(prisma, request);
}
