/**
 * `amitieAcceptee` — le site UNIQUE de « ces deux comptes sont-ils amis ? »
 * (#4866). Consolidé depuis trois copies (PresenceVisibilityService,
 * routes/signal-protocol.ts, la garde de visibilité d'un post), la loi
 * n'avait aucun témoin propre : un `friendRequest.findFirst` doublé
 * inconditionnellement dans les suites qui la traversent rend vert
 * n'importe quel `where`, y compris un `where` qui aurait perdu
 * `status: 'accepted'`.
 *
 * Le double ici HONORE le `where` (`findFirstHonouringWhere`, #4585) : la
 * fixture porte, entre les DEUX mêmes comptes, une ligne `pending` et une
 * `rejected` — ce que le `where` doit écarter, sans quoi le double n'a rien
 * à honorer.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { amitieAcceptee, amisAcceptes, amisAcceptesParmi, niveauEffectif, niveauxParmi } from '../../../services/friendship';
import { relationStore } from '../../helpers/user-relation-store';
import { findFirstHonouringWhere } from '../../helpers/find-first-honouring-where';
import type { MongoDocument } from '../../helpers/mongo-where';

const ALICE = 'alice-id';
const BOB = 'bob-id';
const CAROL = 'carol-id';

const NO_RELATION = { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) };

function prismaWith(rows: ReadonlyArray<MongoDocument>) {
  return { friendRequest: { findFirst: findFirstHonouringWhere(rows) }, userRelation: NO_RELATION };
}

describe('amitieAcceptee', () => {
  it('est vraie quand la demande ACCEPTÉE va du premier compte vers le second', async () => {
    const prisma = prismaWith([{ id: 'fr-1', senderId: ALICE, receiverId: BOB, status: 'accepted' }]);
    await expect(amitieAcceptee(prisma, ALICE, BOB)).resolves.toBe(true);
  });

  it('est vraie quand la demande ACCEPTÉE va du second compte vers le premier — les deux sens comptent', async () => {
    const prisma = prismaWith([{ id: 'fr-1', senderId: BOB, receiverId: ALICE, status: 'accepted' }]);
    await expect(amitieAcceptee(prisma, ALICE, BOB)).resolves.toBe(true);
  });

  it("est fausse quand la seule demande entre les deux comptes est EN ATTENTE", async () => {
    const prisma = prismaWith([{ id: 'fr-1', senderId: ALICE, receiverId: BOB, status: 'pending' }]);
    await expect(amitieAcceptee(prisma, ALICE, BOB)).resolves.toBe(false);
  });

  it('est fausse quand la seule demande entre les deux comptes a été REFUSÉE', async () => {
    const prisma = prismaWith([{ id: 'fr-1', senderId: ALICE, receiverId: BOB, status: 'rejected' }]);
    await expect(amitieAcceptee(prisma, ALICE, BOB)).resolves.toBe(false);
  });

  it('écarte une demande pending ET une demande rejected entre les deux comptes, même en présence de bruit tiers accepté', async () => {
    const prisma = prismaWith([
      { id: 'fr-pending', senderId: ALICE, receiverId: BOB, status: 'pending' },
      { id: 'fr-rejected', senderId: BOB, receiverId: ALICE, status: 'rejected' },
      // Bruit : une amitié acceptée, mais avec un TIERS — ne doit pas faire
      // gagner ALICE/BOB par erreur d'appariement du OR.
      { id: 'fr-tiers', senderId: ALICE, receiverId: CAROL, status: 'accepted' },
    ]);
    await expect(amitieAcceptee(prisma, ALICE, BOB)).resolves.toBe(false);
  });

  it('accorde le verdict quand une ligne pending/rejected coexiste avec la ligne acceptée entre les deux mêmes comptes', async () => {
    const prisma = prismaWith([
      { id: 'fr-pending', senderId: ALICE, receiverId: BOB, status: 'pending' },
      { id: 'fr-rejected', senderId: BOB, receiverId: ALICE, status: 'rejected' },
      { id: 'fr-accepted', senderId: ALICE, receiverId: BOB, status: 'accepted' },
    ]);
    await expect(amitieAcceptee(prisma, ALICE, BOB)).resolves.toBe(true);
  });

  it('est fausse pour deux identifiants identiques, SANS interroger Prisma', async () => {
    const findFirst = jest.fn<any>();
    const prisma = { friendRequest: { findFirst }, userRelation: NO_RELATION };
    await expect(amitieAcceptee(prisma, ALICE, ALICE)).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('est fausse quand un identifiant est vide, SANS interroger Prisma', async () => {
    const findFirst = jest.fn<any>();
    const prisma = { friendRequest: { findFirst }, userRelation: NO_RELATION };
    await expect(amitieAcceptee(prisma, '', BOB)).resolves.toBe(false);
    await expect(amitieAcceptee(prisma, ALICE, '')).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('interroge par le couple exact (status accepted + OR des deux sens), preuve par mutation', async () => {
    const findFirst = jest.fn<any>().mockResolvedValue(null);
    const prisma = { friendRequest: { findFirst }, userRelation: NO_RELATION };
    await amitieAcceptee(prisma, ALICE, BOB);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        status: 'accepted',
        OR: [
          { senderId: ALICE, receiverId: BOB },
          { senderId: BOB, receiverId: ALICE },
        ],
      },
      select: { id: true },
    });
  });
});


// ── #13927 : le site UNIQUE du niveau effectif ───────────────────────────────

const LOW = 'a'.repeat(24);
const HIGH = 'b'.repeat(24);
const OTHER = 'c'.repeat(24);
const FAR = 'd'.repeat(24);

const relationRow = (over: Record<string, unknown> = {}) => ({
  id: 'rel-1',
  userLowId: LOW,
  userHighId: HIGH,
  grantedByLow: 'FRIEND',
  grantedByHigh: 'FRIEND',
  transitions: [],
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  ...over,
});

const acceptedRequest = (senderId: string, receiverId: string, over: Record<string, unknown> = {}) => ({
  id: `fr-${senderId.slice(0, 2)}${receiverId.slice(0, 2)}`,
  senderId,
  receiverId,
  status: 'accepted',
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  ...over,
});

describe('niveauEffectif', () => {
  it('est le MINIMUM des deux accords de la ligne UserRelation, dans les deux orientations', async () => {
    const { prisma } = relationStore({ relations: [relationRow({ grantedByLow: 'BLOOD', grantedByHigh: 'CLOSE' })] });
    await expect(niveauEffectif(prisma as never, LOW, HIGH)).resolves.toBe('CLOSE');
    await expect(niveauEffectif(prisma as never, HIGH, LOW)).resolves.toBe('CLOSE');
  });

  it('ne sert rien à sens unique : un accord PUBLIC d\'un côté ramène le lien à PUBLIC', async () => {
    const { prisma } = relationStore({ relations: [relationRow({ grantedByLow: 'BLOOD', grantedByHigh: 'PUBLIC' })] });
    await expect(niveauEffectif(prisma as never, LOW, HIGH)).resolves.toBe('PUBLIC');
  });

  it('à défaut de ligne, une demande ACCEPTÉE se lit FRIEND (repli, sans rétrogradation rétroactive)', async () => {
    const { prisma } = relationStore({ friendRequests: [acceptedRequest(HIGH, LOW)] });
    await expect(niveauEffectif(prisma as never, LOW, HIGH)).resolves.toBe('FRIEND');
  });

  it('à défaut de ligne, une demande en attente ou refusée ne vaut rien', async () => {
    const { prisma } = relationStore({
      friendRequests: [acceptedRequest(LOW, HIGH, { status: 'pending' }), acceptedRequest(HIGH, LOW, { status: 'rejected' })],
    });
    await expect(niveauEffectif(prisma as never, LOW, HIGH)).resolves.toBe('PUBLIC');
  });

  it('la ligne l\'emporte sur la demande : une baisse gravée n\'est pas relevée par une vieille demande acceptée', async () => {
    const { prisma } = relationStore({
      relations: [relationRow({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'FRIEND' })],
      friendRequests: [acceptedRequest(LOW, HIGH)],
    });
    await expect(niveauEffectif(prisma as never, LOW, HIGH)).resolves.toBe('ACQUAINTANCE');
  });

  it('lit un niveau illisible comme PUBLIC et deux identifiants identiques ou vides comme PUBLIC', async () => {
    const { prisma } = relationStore({ relations: [relationRow({ grantedByLow: 'GALAXY' })] });
    await expect(niveauEffectif(prisma as never, LOW, HIGH)).resolves.toBe('PUBLIC');
    await expect(niveauEffectif(prisma as never, LOW, LOW)).resolves.toBe('PUBLIC');
    await expect(niveauEffectif(prisma as never, '', HIGH)).resolves.toBe('PUBLIC');
  });
});

describe('niveauxParmi', () => {
  const world = () =>
    relationStore({
      relations: [
        relationRow({ grantedByLow: 'CLOSE', grantedByHigh: 'BLOOD' }),
        relationRow({ id: 'rel-2', userLowId: LOW, userHighId: FAR, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE' }),
      ],
      friendRequests: [acceptedRequest(OTHER, LOW)],
    });

  it('rend un niveau par candidat : ligne, repli sur la demande acceptée, PUBLIC sinon — soi écarté', async () => {
    const levels = await niveauxParmi(world().prisma as never, LOW, [HIGH, OTHER, FAR, 'e'.repeat(24), LOW]);
    expect(Object.fromEntries(levels)).toEqual({
      [HIGH]: 'CLOSE',
      [OTHER]: 'FRIEND',
      [FAR]: 'ACQUAINTANCE',
      ['e'.repeat(24)]: 'PUBLIC',
    });
  });

  it('lit la paire du côté high comme du côté low', async () => {
    const levels = await niveauxParmi(world().prisma as never, HIGH, [LOW]);
    expect(levels.get(LOW)).toBe('CLOSE');
  });

  it('ne lit rien pour une liste vide', async () => {
    expect((await niveauxParmi(world().prisma as never, LOW, [])).size).toBe(0);
  });
});

describe('amitieAcceptee / amisAcceptesParmi — des PROJECTIONS du niveau (niveau >= FRIEND)', () => {
  const world = () =>
    relationStore({
      relations: [
        relationRow({ grantedByLow: 'BLOOD', grantedByHigh: 'BLOOD' }),
        relationRow({ id: 'rel-2', userLowId: LOW, userHighId: FAR, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE' }),
      ],
    });

  it('un lien Sang est une amitié, un lien Connaissance n\'en est pas une', async () => {
    const { prisma } = world();
    await expect(amitieAcceptee(prisma as never, LOW, HIGH)).resolves.toBe(true);
    await expect(amitieAcceptee(prisma as never, LOW, FAR)).resolves.toBe(false);
  });

  it('l\'éventail ne garde que les liens >= Ami', async () => {
    const { prisma } = world();
    expect([...(await amisAcceptesParmi(prisma as never, LOW, [HIGH, FAR, OTHER]))]).toEqual([HIGH]);
  });
});

describe('amisAcceptes', () => {
  it('rend les liens >= Ami (lignes ET repli sur les demandes acceptées), sans doublon, les plus récents d\'abord', async () => {
    const { prisma } = relationStore({
      relations: [
        relationRow({ updatedAt: new Date('2026-10-05T00:00:00.000Z') }),
        relationRow({ id: 'rel-2', userLowId: LOW, userHighId: FAR, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'FRIEND' }),
      ],
      friendRequests: [
        acceptedRequest(LOW, HIGH),
        acceptedRequest(OTHER, LOW, { updatedAt: new Date('2026-10-09T00:00:00.000Z') }),
        acceptedRequest(LOW, FAR),
      ],
    });
    await expect(amisAcceptes(prisma as never, LOW)).resolves.toEqual([OTHER, HIGH]);
  });

  it('borne le nombre de liens rendus aux plus récents', async () => {
    const { prisma } = relationStore({
      friendRequests: [
        acceptedRequest(LOW, HIGH, { updatedAt: new Date('2026-10-01T00:00:00.000Z') }),
        acceptedRequest(LOW, OTHER, { updatedAt: new Date('2026-10-03T00:00:00.000Z') }),
        acceptedRequest(LOW, FAR, { updatedAt: new Date('2026-10-02T00:00:00.000Z') }),
      ],
    });
    await expect(amisAcceptes(prisma as never, LOW, { limit: 2 })).resolves.toEqual([OTHER, FAR]);
  });

  it('ne rend rien pour un sujet vide', async () => {
    const { prisma } = relationStore();
    await expect(amisAcceptes(prisma as never, '')).resolves.toEqual([]);
  });
});
