/**
 * La fiche par cercle, côté passerelle (#18861) : l'orchestrateur LIT les accords
 * des deux côtés, le blocage, la communauté, l'âge et le rôle, puis rend le
 * verdict de la loi — il n'écrit aucune comparaison de niveaux.
 *
 * Le double Prisme APPLIQUE ses bornes (la paire, la liste d'ids) : un faux qui
 * rendrait sa ligne quelle que soit la requête verdirait sur une lecture sans borne.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { readProfileCircleView } from '../../../../services/relations/profileCircleView';
import { accordsEntre } from '../../../../services/friendship';

const A = '507f1f77bcf86cd799439011';
const B = '507f1f77bcf86cd799439022';
const LOW = A < B ? A : B;
const HIGH = A < B ? B : A;

type Row = { id: string; userLowId: string; userHighId: string; grantedByLow: string; grantedByHigh: string; transitions: never[] };

const rowOf = (grantedByA: string, grantedByB: string): Row => ({
  id: 'r1',
  userLowId: LOW,
  userHighId: HIGH,
  grantedByLow: LOW === A ? grantedByA : grantedByB,
  grantedByHigh: LOW === A ? grantedByB : grantedByA,
  transitions: [],
});

type Double = {
  row?: Row | null;
  accepted?: boolean;
  blockedByA?: boolean;
  blockedByB?: boolean;
  sharedCommunity?: boolean;
  roles?: Record<string, string>;
  birth?: Record<string, Date | null>;
};

const prismaOf = (d: Double = {}) =>
  ({
    userRelation: { findUnique: jest.fn<any>(async () => d.row ?? null), findMany: jest.fn<any>(async () => (d.row ? [d.row] : [])) },
    friendRequest: {
      findFirst: jest.fn<any>(async () => (d.accepted ? { senderId: A, receiverId: B, respondedAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') } : null)),
      findMany: jest.fn<any>(async () => (d.accepted ? [{ senderId: A, receiverId: B, respondedAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') }] : [])),
    },
    user: {
      findMany: jest.fn<any>(async (args: any) => {
        if (args?.where?.blockedUserIds) return d.blockedByB ? [{ id: B }] : [];
        const ids: string[] = args?.where?.id?.in ?? [];
        return ids.map((id) => ({
          id,
          role: d.roles?.[id] ?? 'USER',
          birthDate: d.birth?.[id] ?? null,
          isActive: true,
          deletedAt: null,
          deactivatedAt: null,
        }));
      }),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: d.blockedByA ? [B] : [] })),
    },
    communityMember: {
      findMany: jest.fn<any>(async (args: any) => {
        if (!d.sharedCommunity) return [];
        return args?.where?.communityId ? [{ userId: B }] : [{ communityId: 'c1' }];
      }),
    },
  }) as never;

describe('accordsEntre — les DEUX accords de la paire, dans le sens du lecteur', () => {
  it('rend ce que chaque côté accorde, pas leur minimum', async () => {
    const accords = await accordsEntre(prismaOf({ row: rowOf('BLOOD', 'CLOSE') }), A, B);
    expect(accords).toEqual({ byViewer: 'BLOOD', byTarget: 'CLOSE' });
  });

  it('le sens suit le LECTEUR : lu de l autre côté, les deux accords s échangent', async () => {
    const accords = await accordsEntre(prismaOf({ row: rowOf('BLOOD', 'CLOSE') }), B, A);
    expect(accords).toEqual({ byViewer: 'CLOSE', byTarget: 'BLOOD' });
  });

  it('sans ligne ni demande : Public des deux côtés', async () => {
    expect(await accordsEntre(prismaOf(), A, B)).toEqual({ byViewer: 'PUBLIC', byTarget: 'PUBLIC' });
  });

  it('une demande acceptée sans ligne se lit Ami des deux côtés, comme le rattrapage la laissera', async () => {
    expect(await accordsEntre(prismaOf({ accepted: true }), A, B)).toEqual({ byViewer: 'FRIEND', byTarget: 'FRIEND' });
  });
});

describe('readProfileCircleView — la loi lue sur la paire réelle', () => {
  it('un lecteur Ami voit la présence ouverte et la détaillée fermée par Proche', async () => {
    const view = await readProfileCircleView(prismaOf({ row: rowOf('FRIEND', 'FRIEND') }), { viewerId: A, targetId: B });
    expect(view.level).toBe('FRIEND');
    expect(view.capabilities.presence?.state).toBe('open');
    expect(view.capabilities.presenceDetailed).toMatchObject({ state: 'locked', circle: 'CLOSE' });
  });

  it('ce qui manque pour monter vient du côté qui n a pas accordé', async () => {
    const view = await readProfileCircleView(prismaOf({ row: rowOf('CLOSE', 'FRIEND') }), { viewerId: A, targetId: B });
    expect(view.missing).toEqual({ level: 'CLOSE', byViewer: false, byTarget: true });
  });

  it('un blocage posé par la CIBLE ferme tout, sur un cercle Proche', async () => {
    const view = await readProfileCircleView(prismaOf({ row: rowOf('CLOSE', 'CLOSE'), blockedByB: true }), { viewerId: A, targetId: B });
    expect(Object.values(view.capabilities).every((c) => c?.state === 'locked')).toBe(true);
    expect(view.missing).toBeNull();
  });

  it('un blocage posé par le LECTEUR ferme tout aussi', async () => {
    const view = await readProfileCircleView(prismaOf({ row: rowOf('CLOSE', 'CLOSE'), blockedByA: true }), { viewerId: A, targetId: B });
    expect(Object.values(view.capabilities).every((c) => c?.state === 'locked')).toBe(true);
  });

  it('une communauté en commun relève un lien Public à Communauté', async () => {
    const view = await readProfileCircleView(prismaOf({ sharedCommunity: true }), { viewerId: A, targetId: B });
    expect(view.level).toBe('COMMUNITY');
    expect(view.sharesCommunity).toBe(true);
  });

  it('un compte de l équipe n ouvre RIEN à un utilisateur ordinaire', async () => {
    const view = await readProfileCircleView(prismaOf({ roles: { [A]: 'MODERATOR' } }), { viewerId: A, targetId: B });
    expect(view.level).toBe('PUBLIC');
    expect(view.capabilities.locationLive?.state).toBe('locked');
  });

  it('soi-même : aucune lecture de lien, tout est ouvert sauf ce qui s adresse à un autre', async () => {
    const prisma = prismaOf();
    const view = await readProfileCircleView(prisma, { viewerId: A, targetId: A });
    expect(view.isSelf).toBe(true);
    expect(view.capabilities.presence?.state).toBe('open');
    expect(view.capabilities.talkie).toBeUndefined();
    expect((prisma as any).userRelation.findUnique).not.toHaveBeenCalled();
  });
});
