/**
 * #16639 — créer une conversation dans une communauté n'admet que ce que
 * l'appelant a le droit d'admettre.
 *
 * `POST /conversations` avec un `communityId` faisait entrer chaque
 * participant dans la communauté, et réactivait la ligne d'un retiré avec son
 * ancien rang : un simple membre réintégrait un administrateur retiré, ou
 * faisait entrer n'importe qui dans une communauté PRIVÉE. La réconciliation
 * suit désormais la loi de `POST …/invite` : droit d'inviter, compte vivant,
 * aucun blocage, et le rang repart de MEMBER.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { applyCommunityAdmission, planCommunityAdmission } from '../communityMembershipSync';

type Ligne = { readonly id: string; readonly userId: string; readonly isActive: boolean };

const COMMUNITY_ID = 'comm-1';
const MOI = 'moi';
const CREATEUR = 'createur';

function prismaDouble(lignes: readonly Ligne[], options: { readonly vivants?: readonly string[]; readonly bloques?: readonly string[] } = {}) {
  const vivants = new Set(options.vivants ?? ['u1', 'u2', 'u3', MOI, CREATEUR]);
  const bloques = new Set(options.bloques ?? []);
  return {
    communityMember: {
      findMany: jest.fn<any>(async (args: any) => lignes.filter((l) => args.where.userId.in.includes(l.userId))),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      createMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    user: {
      findFirst: jest.fn<any>(async (args: any) => {
        if (args.where.OR) {
          const paires = args.where.OR as Array<{ id: string; blockedUserIds: { has: string } }>;
          return paires.some((p) => bloques.has(p.id) || bloques.has(p.blockedUserIds.has)) ? { id: 'x' } : null;
        }
        return vivants.has(args.where.id) ? { id: args.where.id } : null;
      }),
    },
  };
}

function plan(prisma: ReturnType<typeof prismaDouble>, params: { readonly isPrivate?: boolean; readonly actorRole?: string | null; readonly participantIds: readonly string[]; readonly createdBy?: string }) {
  return planCommunityAdmission(prisma as never, {
    communityId: COMMUNITY_ID,
    actorId: MOI,
    createdBy: params.createdBy ?? CREATEUR,
    isPrivate: params.isPrivate ?? false,
    actorRole: params.actorRole === undefined ? 'member' : params.actorRole,
    participantIds: params.participantIds,
  });
}

const MOI_ACTIF: Ligne = { id: 'cm-moi', userId: MOI, isActive: true };

describe('planCommunityAdmission — qui entre dans la communauté', () => {
  it('communauté PUBLIQUE : un simple membre fait entrer un non-membre, en MEMBER', async () => {
    const prisma = prismaDouble([MOI_ACTIF]);
    const admission = await plan(prisma, { participantIds: ['u1'] });
    expect(admission.kind).toBe('admitted');
    await applyCommunityAdmission(prisma as never, COMMUNITY_ID, admission as never);
    expect(prisma.communityMember.createMany).toHaveBeenCalledWith({
      data: [{ communityId: COMMUNITY_ID, userId: 'u1', role: 'member' }],
    });
  });

  it('communauté PRIVÉE : un simple membre ne fait entrer personne', async () => {
    const prisma = prismaDouble([MOI_ACTIF]);
    expect(await plan(prisma, { isPrivate: true, participantIds: ['u1'] })).toEqual({ kind: 'refused', reason: 'invite-forbidden' });
  });

  it('communauté PRIVÉE : un simple membre ne RÉINTÈGRE pas un membre retiré', async () => {
    const prisma = prismaDouble([MOI_ACTIF, { id: 'cm-u1', userId: 'u1', isActive: false }]);
    expect(await plan(prisma, { isPrivate: true, participantIds: ['u1'] })).toEqual({ kind: 'refused', reason: 'invite-forbidden' });
    expect(prisma.communityMember.updateMany).not.toHaveBeenCalled();
  });

  it('communauté PRIVÉE : un simple membre crée librement avec des membres ACTIFS', async () => {
    const prisma = prismaDouble([MOI_ACTIF, { id: 'cm-u1', userId: 'u1', isActive: true }]);
    const admission = await plan(prisma, { isPrivate: true, participantIds: ['u1'] });
    expect(admission).toEqual({ kind: 'admitted', reactivations: [], creations: [] });
  });

  it.each(['admin', 'moderator'])('communauté PRIVÉE : un %s fait entrer un non-membre', async (role) => {
    const prisma = prismaDouble([MOI_ACTIF]);
    expect((await plan(prisma, { isPrivate: true, actorRole: role, participantIds: ['u1'] })).kind).toBe('admitted');
  });

  it('communauté PRIVÉE : son créateur fait entrer un non-membre', async () => {
    const prisma = prismaDouble([MOI_ACTIF]);
    expect((await plan(prisma, { isPrivate: true, createdBy: MOI, participantIds: ['u1'] })).kind).toBe('admitted');
  });

  it('un membre retiré revient en MEMBER, jamais avec son ancien rang', async () => {
    const prisma = prismaDouble([MOI_ACTIF, { id: 'cm-u1', userId: 'u1', isActive: false }]);
    const admission = await plan(prisma, { actorRole: 'admin', participantIds: ['u1'] });
    await applyCommunityAdmission(prisma as never, COMMUNITY_ID, admission as never);
    expect(prisma.communityMember.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['cm-u1'] }, isActive: false },
      data: { isActive: true, leftAt: null, role: 'member' },
    });
  });

  it('refuse un compte qui n\'est pas vivant (désactivé, supprimé, en attente)', async () => {
    const prisma = prismaDouble([MOI_ACTIF], { vivants: [MOI] });
    expect(await plan(prisma, { participantIds: ['u1'] })).toEqual({ kind: 'refused', reason: 'not-addable' });
  });

  it('refuse un participant bloqué, dans un sens ou dans l\'autre', async () => {
    const prisma = prismaDouble([MOI_ACTIF], { bloques: ['u1'] });
    expect(await plan(prisma, { participantIds: ['u1'] })).toEqual({ kind: 'refused', reason: 'not-addable' });
  });

  it('ne regarde ni le droit ni le compte d\'un participant déjà membre actif', async () => {
    const prisma = prismaDouble([MOI_ACTIF, { id: 'cm-u1', userId: 'u1', isActive: true }], { vivants: [MOI] });
    expect(await plan(prisma, { isPrivate: true, participantIds: ['u1'] })).toEqual({ kind: 'admitted', reactivations: [], creations: [] });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('le créateur de la communauté sans ligne active y revient ADMINISTRATEUR', async () => {
    const prisma = prismaDouble([{ id: 'cm-moi', userId: MOI, isActive: false }]);
    const admission = await plan(prisma, { createdBy: MOI, actorRole: null, participantIds: [] });
    await applyCommunityAdmission(prisma as never, COMMUNITY_ID, admission as never);
    expect(prisma.communityMember.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['cm-moi'] }, isActive: false },
      data: { isActive: true, leftAt: null, role: 'admin' },
    });
  });

  it('n\'ouvre jamais une seconde ligne pour une paire qui en a une', async () => {
    const prisma = prismaDouble([MOI_ACTIF, { id: 'cm-u2', userId: 'u2', isActive: false }]);
    const admission = await plan(prisma, { participantIds: ['u2', 'u3'] });
    await applyCommunityAdmission(prisma as never, COMMUNITY_ID, admission as never);
    expect(prisma.communityMember.createMany).toHaveBeenCalledWith({
      data: [{ communityId: COMMUNITY_ID, userId: 'u3', role: 'member' }],
    });
    expect(prisma.communityMember.updateMany).toHaveBeenCalledTimes(1);
  });
});
