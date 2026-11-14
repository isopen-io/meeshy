/**
 * #18104 — la sortie d'un créateur sans héritier inscrit ferme les liens de son
 * salon PENDANT la requête (#16712). Si cette écriture lève, rien n'est marqué
 * et rien ne la rejoue : les invités restent seuls dans un salon sans
 * gouvernance. Le balayage horaire retrouve ces salons et les ferme.
 *
 * Le double honore les `where` que le balayage pose.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import { closeLinksOfOrphanedSalons } from '../../../../services/conversations/orphanedSalonLinks';

const NOW = new Date('2026-11-14T02:00:00.000Z');
const PRIVEE = '507f1f77bcf86cd799439044';
const PUBLIQUE = '507f1f77bcf86cd799439055';
const DESACTIVEE = '507f1f77bcf86cd799439066';
const ORPHELIN = '507f1f77bcf86cd7994390a1';
const GOUVERNE = '507f1f77bcf86cd7994390b2';
const JAMAIS_DE_CREATEUR = '507f1f77bcf86cd7994390c3';
const SALON_PUBLIC = '507f1f77bcf86cd7994390d4';
const SALON_CLOS = '507f1f77bcf86cd7994390e5';
const SALON_DESACTIVEE = '507f1f77bcf86cd7994390f6';
const ORPHELIN_SANS_LIEN = '507f1f77bcf86cd799439017';

type Communaute = { readonly id: string; readonly isPrivate: boolean; readonly isActive: boolean };
type Salon = { readonly id: string; readonly communityId: string; readonly isActive: boolean };
type Ligne = { readonly conversationId: string; readonly role: string; readonly isActive: boolean; readonly userId: string | null };
type Lien = { id: string; conversationId: string; isActive: boolean; guestRevocationPendingAt: Date | null };

type Monde = {
  readonly communautes: readonly Communaute[];
  readonly salons: readonly Salon[];
  readonly lignes: readonly Ligne[];
  readonly liens: Lien[];
};

const inFilter = (filter: unknown, value: string) =>
  filter === undefined || (typeof filter === 'string' ? filter === value : (filter as { in: string[] }).in.includes(value));

function prismaDouble(monde: Monde, options: { readonly closeFails?: boolean } = {}) {
  return {
    community: {
      findMany: jest.fn<any>(async (args: any) => monde.communautes
        .filter((c) => args.where.OR.some((clause: Partial<Communaute>) =>
          Object.entries(clause).every(([k, v]) => c[k as keyof Communaute] === v)))
        .map((c) => ({ id: c.id }))),
    },
    conversation: {
      findMany: jest.fn<any>(async (args: any) => monde.salons
        .filter((s) => inFilter(args.where.communityId, s.communityId))
        .filter((s) => args.where.isActive === undefined || s.isActive === args.where.isActive)
        .map((s) => ({ id: s.id }))),
    },
    participant: {
      findMany: jest.fn<any>(async (args: any) => monde.lignes
        .filter((l) => inFilter(args.where.conversationId, l.conversationId))
        .filter((l) => args.where.isActive === undefined || l.isActive === args.where.isActive)
        .filter((l) => args.where.role === undefined || args.where.role.in.includes(l.role))
        .map((l) => ({ conversationId: l.conversationId, role: l.role, isActive: l.isActive, userId: l.userId }))),
    },
    conversationShareLink: {
      findMany: jest.fn<any>(async (args: any) => monde.liens
        .filter((l) => inFilter(args.where.conversationId, l.conversationId))
        .filter((l) => args.where.isActive === undefined || l.isActive === args.where.isActive)
        .map((l) => ({ id: l.id, conversationId: l.conversationId }))),
      updateMany: jest.fn<any>(async (args: any) => {
        if (options.closeFails) throw new Error('pool saturé');
        const touched = monde.liens.filter((l) => args.where.id.in.includes(l.id));
        touched.forEach((l) => { l.isActive = args.data.isActive; l.guestRevocationPendingAt = args.data.guestRevocationPendingAt; });
        return { count: touched.length };
      }),
    },
  } as never;
}

const createurParti = (conversationId: string): Ligne => ({ conversationId, role: 'creator', isActive: false, userId: 'u-parti' });
const lien = (id: string, conversationId: string): Lien => ({ id, conversationId, isActive: true, guestRevocationPendingAt: null });

function monde(): Monde {
  return {
    communautes: [
      { id: PRIVEE, isPrivate: true, isActive: true },
      { id: PUBLIQUE, isPrivate: false, isActive: true },
      { id: DESACTIVEE, isPrivate: false, isActive: false },
    ],
    salons: [
      { id: ORPHELIN, communityId: PRIVEE, isActive: true },
      { id: GOUVERNE, communityId: PRIVEE, isActive: true },
      { id: JAMAIS_DE_CREATEUR, communityId: PRIVEE, isActive: true },
      { id: SALON_PUBLIC, communityId: PUBLIQUE, isActive: true },
      { id: SALON_CLOS, communityId: PRIVEE, isActive: false },
      { id: SALON_DESACTIVEE, communityId: DESACTIVEE, isActive: true },
      { id: ORPHELIN_SANS_LIEN, communityId: PRIVEE, isActive: true },
    ],
    lignes: [
      createurParti(ORPHELIN),
      createurParti(GOUVERNE),
      { conversationId: GOUVERNE, role: 'creator', isActive: true, userId: 'u-heritier' },
      createurParti(SALON_PUBLIC),
      createurParti(SALON_CLOS),
      createurParti(SALON_DESACTIVEE),
      createurParti(ORPHELIN_SANS_LIEN),
    ],
    liens: [
      lien('l-orphelin-1', ORPHELIN),
      lien('l-orphelin-2', ORPHELIN),
      lien('l-gouverne', GOUVERNE),
      lien('l-jamais', JAMAIS_DE_CREATEUR),
      lien('l-public', SALON_PUBLIC),
      lien('l-clos', SALON_CLOS),
      lien('l-desactivee', SALON_DESACTIVEE),
    ],
  };
}

const fermes = (m: Monde) => m.liens.filter((l) => !l.isActive).map((l) => l.id).sort();

describe('closeLinksOfOrphanedSalons (#18104)', () => {
  it('ferme et marque les liens d\'un salon vivant d\'une communauté privée dont le créateur est sorti sans héritier', async () => {
    const m = monde();
    const closed = await closeLinksOfOrphanedSalons(prismaDouble(m), NOW);

    expect([...closed].sort()).toEqual(['l-desactivee', 'l-orphelin-1', 'l-orphelin-2']);
    const orphelin = m.liens.find((l) => l.id === 'l-orphelin-1');
    expect(orphelin).toEqual(expect.objectContaining({ isActive: false, guestRevocationPendingAt: NOW }));
  });

  it('ferme aussi les salons d\'une communauté publique DÉSACTIVÉE (elle garde ses salons comme une privée)', async () => {
    const m = monde();
    await closeLinksOfOrphanedSalons(prismaDouble(m), NOW);
    expect(fermes(m)).toContain('l-desactivee');
  });

  it('ne touche ni un salon avec héritier, ni une communauté publique vivante, ni un salon clos, ni un salon qui n\'a jamais eu de créateur', async () => {
    const m = monde();
    await closeLinksOfOrphanedSalons(prismaDouble(m), NOW);
    expect(fermes(m)).not.toEqual(expect.arrayContaining(['l-gouverne']));
    expect(fermes(m)).not.toContain('l-public');
    expect(fermes(m)).not.toContain('l-clos');
    expect(fermes(m)).not.toContain('l-jamais');
  });

  it('un créateur actif sans compte n\'est pas un héritier : le salon reste orphelin', async () => {
    const m = monde();
    const avecInvitéCréateur: Monde = {
      ...m,
      lignes: [...m.lignes, { conversationId: ORPHELIN, role: 'creator', isActive: true, userId: null }],
    };
    await closeLinksOfOrphanedSalons(prismaDouble(avecInvitéCréateur), NOW);
    expect(fermes(avecInvitéCréateur)).toContain('l-orphelin-1');
  });

  it('une passe sans salon orphelin n\'écrit rien', async () => {
    const m: Monde = { ...monde(), liens: [lien('l-gouverne', GOUVERNE)] };
    const prisma = prismaDouble(m) as unknown as { conversationShareLink: { updateMany: jest.Mock } };
    const closed = await closeLinksOfOrphanedSalons(prisma as never, NOW);
    expect(closed).toEqual([]);
    expect(prisma.conversationShareLink.updateMany).not.toHaveBeenCalled();
  });

  it('une fermeture qui lève ne rejette pas et ne compte rien comme fermé (la passe suivante reprendra)', async () => {
    const m = monde();
    await expect(closeLinksOfOrphanedSalons(prismaDouble(m, { closeFails: true }), NOW)).resolves.toEqual([]);
    expect(fermes(m)).toEqual([]);
  });
});
