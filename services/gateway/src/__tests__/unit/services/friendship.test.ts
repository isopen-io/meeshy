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
import { amitieAcceptee } from '../../../services/friendship';
import { findFirstHonouringWhere } from '../../helpers/find-first-honouring-where';
import type { MongoDocument } from '../../helpers/mongo-where';

const ALICE = 'alice-id';
const BOB = 'bob-id';
const CAROL = 'carol-id';

function prismaWith(rows: ReadonlyArray<MongoDocument>) {
  return { friendRequest: { findFirst: findFirstHonouringWhere(rows) } };
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
    const prisma = { friendRequest: { findFirst } };
    await expect(amitieAcceptee(prisma, ALICE, ALICE)).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('est fausse quand un identifiant est vide, SANS interroger Prisma', async () => {
    const findFirst = jest.fn<any>();
    const prisma = { friendRequest: { findFirst } };
    await expect(amitieAcceptee(prisma, '', BOB)).resolves.toBe(false);
    await expect(amitieAcceptee(prisma, ALICE, '')).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('interroge par le couple exact (status accepted + OR des deux sens), preuve par mutation', async () => {
    const findFirst = jest.fn<any>().mockResolvedValue(null);
    const prisma = { friendRequest: { findFirst } };
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
