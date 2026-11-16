/**
 * #18556 — le feu annoncé à l'expéditeur se GRAVE sur sa propre ligne de
 * statut, une seule fois : le gagnant de la gravure est le seul à annoncer.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { claimSenderBurn } from '../afterReadSenderBurn';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

const CONV = '507f1f77bcf86cd799439011';
const FLAME = '507f1f77bcf86cd799439031';
const SENDER = '507f1f77bcf86cd7994390af';
const AT = new Date('2026-11-14T12:00:00.000Z');

function prismaOf(seed: MongoDocument[] = [], options: { raceOnCreate?: MongoDocument } = {}) {
  const entries = seed.map((entry) => ({ ...entry }));
  let raced = false;
  const prisma = {
    messageStatusEntry: {
      updateMany: async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
        const hit = entries.filter((entry) => matchesMongoWhere(entry, where));
        hit.forEach((entry) => Object.assign(entry, data));
        return { count: hit.length };
      },
      findFirst: async ({ where }: { where: MongoDocument }) =>
        entries.find((entry) => matchesMongoWhere(entry, where)) ?? null,
      create: async ({ data }: { data: MongoDocument }) => {
        if (options.raceOnCreate && !raced) {
          raced = true;
          entries.push({ ...options.raceOnCreate, id: 'e-race' });
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        const row = { id: `e-${entries.length + 1}`, ...data };
        entries.push(row);
        return row;
      },
    },
  };
  return { prisma: prisma as never, entries };
}

const claim = (prisma: never) =>
  claimSenderBurn(prisma, { messageId: FLAME, conversationId: CONV, senderParticipantId: SENDER, at: AT });

const authorRow = (overrides: MongoDocument = {}): MongoDocument => ({
  id: 'e-author',
  messageId: FLAME,
  conversationId: CONV,
  participantId: SENDER,
  ...overrides,
});

describe('claimSenderBurn (#18556)', () => {
  it('crée la ligne de l’auteur à l’échéance annoncée, et la rend pour l’annonce', async () => {
    const { prisma, entries } = prismaOf();

    const entry = await claim(prisma);

    expect(entry).toMatchObject({ messageId: FLAME, conversationId: CONV, participantId: SENDER, ephemeralExpiresAt: AT });
    expect(entries).toHaveLength(1);
  });

  it('complète la ligne que l’auteur porte déjà (vue unique ouverte par lui), sans la doubler', async () => {
    const { prisma, entries } = prismaOf([authorRow({ viewedOnceAt: new Date('2026-11-14T11:00:00.000Z') })]);

    const entry = await claim(prisma);

    expect(entry).toMatchObject({ id: 'e-author', ephemeralExpiresAt: AT });
    expect(entries).toHaveLength(1);
    expect(entries[0].viewedOnceAt).toBeInstanceOf(Date);
  });

  it('une échéance déjà gravée ne se regrave pas : le rejeu rend null et n’annonce rien', async () => {
    const earlier = new Date('2026-11-14T11:30:00.000Z');
    const { prisma, entries } = prismaOf([authorRow({ ephemeralExpiresAt: earlier })]);

    expect(await claim(prisma)).toBeNull();
    expect(entries[0].ephemeralExpiresAt).toEqual(earlier);
  });

  it('deux gravures concurrentes : celle qui perd la création contre une ligne DÉJÀ datée n’annonce pas', async () => {
    const { prisma } = prismaOf([], { raceOnCreate: authorRow({ ephemeralExpiresAt: AT }) });

    expect(await claim(prisma)).toBeNull();
  });

  it('la création perdue contre une ligne SANS échéance (ouverture de vue unique concurrente) grave quand même', async () => {
    const { prisma, entries } = prismaOf([], { raceOnCreate: authorRow({ viewedOnceAt: AT }) });

    const entry = await claim(prisma);

    expect(entry).toMatchObject({ id: 'e-race', ephemeralExpiresAt: AT });
    expect(entries).toHaveLength(1);
  });

  it('une erreur de base qui n’est pas un doublon remonte', async () => {
    const { prisma } = prismaOf();
    (prisma as unknown as { messageStatusEntry: { create: unknown } }).messageStatusEntry.create = async () => {
      throw new Error('mongo down');
    };

    await expect(claim(prisma)).rejects.toThrow('mongo down');
  });
});
