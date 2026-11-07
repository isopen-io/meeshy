/**
 * #16695 — entrer dans un SALON d'une communauté privée est entrer dans la
 * communauté : la même loi que `POST /conversations` avec `communityId`
 * (#16639), pour les trois portes qui ajoutent à un salon déjà rattaché —
 * `POST /conversations/:id/invite`, `POST /conversations/:id/participants`,
 * la jonction par lien de partage.
 *
 * Le double honore les `where` que la loi pose : une ligne inactive n'est pas
 * un membre, une communauté désactivée n'est pas lue.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  loadSalonCommunity,
  planSalonEntry,
} from '../../../../services/conversations/communityMembershipSync';

const COMMUNITY = '507f1f77bcf86cd799439044';
const CREATEUR = '507f1f77bcf86cd7994390c0';
const ACTEUR = '507f1f77bcf86cd799439022';
const ENTRANT = '507f1f77bcf86cd799439033';

type Ligne = { readonly userId: string; readonly role: string; readonly isActive: boolean };
type Monde = {
  readonly isPrivate?: boolean;
  readonly isActive?: boolean;
  readonly lignes?: readonly Ligne[];
  readonly vivants?: readonly string[];
  readonly bloque?: boolean;
};

function prismaDouble(monde: Monde = {}) {
  const lignes = monde.lignes ?? [];
  return {
    community: {
      findFirst: jest.fn<any>(async (args: any) => {
        if (args.where.id !== COMMUNITY) return null;
        if (args.where.isActive === true && monde.isActive === false) return null;
        const where = args.select.members.where;
        return {
          createdBy: CREATEUR,
          isPrivate: monde.isPrivate ?? true,
          members: lignes.filter((l) => l.userId === where.userId && l.isActive === where.isActive),
        };
      }),
    },
    communityMember: {
      findMany: jest.fn<any>(async (args: any) => lignes
        .filter((l) => args.where.communityId === COMMUNITY && args.where.userId.in.includes(l.userId))
        .map((l) => ({ id: `cm-${l.userId}`, ...l }))),
    },
    user: {
      findMany: jest.fn<any>(async (args: any) => (args.where.id.in as string[])
        .filter((id) => monde.vivants === undefined || monde.vivants.includes(id))
        .map((id) => ({ id }))),
      findFirst: jest.fn<any>(async () => (monde.bloque ? { id: ENTRANT } : null)),
    },
  };
}

const membre = (userId: string, role = 'member'): Ligne => ({ userId, role, isActive: true });
const retire = (userId: string): Ligne => ({ userId, role: 'admin', isActive: false });

async function entrer(monde: Monde, entrant: { kind: 'registered'; userId: string } | { kind: 'guest' }, actorId = ACTEUR) {
  const prisma = prismaDouble(monde);
  const community = await loadSalonCommunity(prisma as never, { communityId: COMMUNITY, actorId });
  return { verdict: await planSalonEntry(prisma as never, community, entrant), prisma };
}

describe('#16695 — un salon d’une communauté privée n’accueille que ce que la communauté admet', () => {
  it('un simple membre ne fait pas entrer un non-membre', async () => {
    const { verdict } = await entrer({ lignes: [membre(ACTEUR)] }, { kind: 'registered', userId: ENTRANT });
    expect(verdict).toEqual({ kind: 'refused', reason: 'invite-forbidden' });
  });

  it('un simple membre ne fait pas revenir un retiré, et sa ligne n’est pas touchée', async () => {
    const { verdict } = await entrer({ lignes: [membre(ACTEUR), retire(ENTRANT)] }, { kind: 'registered', userId: ENTRANT });
    expect(verdict).toEqual({ kind: 'refused', reason: 'invite-forbidden' });
  });

  it('un simple membre ajoute un membre actif de la communauté, sans rien écrire', async () => {
    const { verdict } = await entrer({ lignes: [membre(ACTEUR), membre(ENTRANT)] }, { kind: 'registered', userId: ENTRANT });
    expect(verdict).toEqual({ kind: 'admitted', reactivations: [], creations: [] });
  });

  it.each(['admin', 'moderator'])('un %s de la communauté y fait entrer un non-membre, comme membre', async (role) => {
    const { verdict } = await entrer({ lignes: [membre(ACTEUR, role)] }, { kind: 'registered', userId: ENTRANT });
    expect(verdict).toEqual({ kind: 'admitted', reactivations: [], creations: [{ userId: ENTRANT, role: 'member' }] });
  });

  it('un admin fait revenir un retiré en simple membre — un rang ne se retrouve pas dans une ligne périmée', async () => {
    const { verdict } = await entrer({ lignes: [membre(ACTEUR, 'admin'), retire(ENTRANT)] }, { kind: 'registered', userId: ENTRANT });
    expect(verdict).toEqual({ kind: 'admitted', reactivations: [{ id: `cm-${ENTRANT}`, role: 'member' }], creations: [] });
  });

  it('le créateur de la communauté y fait entrer quelqu’un, et n’y est pas réinscrit lui-même', async () => {
    const { verdict } = await entrer({ lignes: [] }, { kind: 'registered', userId: ENTRANT }, CREATEUR);
    expect(verdict).toEqual({ kind: 'admitted', reactivations: [], creations: [{ userId: ENTRANT, role: 'member' }] });
  });

  it('un ancien admin retiré de la communauté n’y fait plus entrer personne', async () => {
    const { verdict } = await entrer({ lignes: [retire(ACTEUR)] }, { kind: 'registered', userId: ENTRANT });
    expect(verdict).toEqual({ kind: 'refused', reason: 'invite-forbidden' });
  });

  it('un compte non vivant ou bloqué n’entre pas, même par un admin', async () => {
    const mort = await entrer({ lignes: [membre(ACTEUR, 'admin')], vivants: [ACTEUR] }, { kind: 'registered', userId: ENTRANT });
    expect(mort.verdict).toEqual({ kind: 'refused', reason: 'not-addable' });
    const bloque = await entrer({ lignes: [membre(ACTEUR, 'admin')], bloque: true }, { kind: 'registered', userId: ENTRANT });
    expect(bloque.verdict).toEqual({ kind: 'refused', reason: 'not-addable' });
  });

  it('qui n’est plus membre ne rentre pas par son propre lien', async () => {
    const { verdict } = await entrer({ lignes: [retire(ACTEUR)] }, { kind: 'registered', userId: ACTEUR });
    expect(verdict).toEqual({ kind: 'refused', reason: 'invite-forbidden' });
  });

  it('un invité sans compte n’entre que par le lien d’un créateur, admin ou modérateur', async () => {
    const parMembre = await entrer({ lignes: [membre(ACTEUR)] }, { kind: 'guest' });
    expect(parMembre.verdict).toEqual({ kind: 'refused', reason: 'invite-forbidden' });
    const parAdmin = await entrer({ lignes: [membre(ACTEUR, 'admin')] }, { kind: 'guest' });
    expect(parAdmin.verdict).toEqual({ kind: 'admitted', reactivations: [], creations: [] });
  });

  it('une communauté publique est inchangée : personne n’est refusé, rien n’est écrit ni relu', async () => {
    const { verdict, prisma } = await entrer({ isPrivate: false, lignes: [] }, { kind: 'registered', userId: ENTRANT });
    expect(verdict).toEqual({ kind: 'admitted', reactivations: [], creations: [] });
    expect(prisma.communityMember.findMany).not.toHaveBeenCalled();
  });

  it('un salon hors communauté ne lit aucune communauté', async () => {
    const prisma = prismaDouble();
    const community = await loadSalonCommunity(prisma as never, { communityId: null, actorId: ACTEUR });
    expect(community).toBeNull();
    expect(prisma.community.findFirst).not.toHaveBeenCalled();
    expect(await planSalonEntry(prisma as never, community, { kind: 'guest' })).toEqual({ kind: 'admitted', reactivations: [], creations: [] });
  });
});
