/**
 * @jest-environment node
 *
 * **LE TRANSPORT DES LIENS PARTAGÉS APPARIE LE TRIO** (#19960) — et c'est le
 * site le plus exposé des trois, parce que c'est le SEUL dont dispose un
 * invité anonyme : aucun autre chemin ne lui reste quand celui-ci se trompe.
 *
 * L'index partiel garde `(conversationId, clientMessageId)` : il lève donc
 * aussi quand un AUTRE participant tient la clé. Relire sans `senderId`
 * rendait SA ligne à l'invité — `isDuplicate: true`, donc la route sautait
 * l'écriture, la diffusion et les mentions — pendant que le message de
 * l'invité n'était écrit nulle part. Un succès RENDU sur une perte.
 *
 * Le double honore le `where` : sans cela, le témoin ne pourrait pas tomber.
 */
import { describe, expect, it } from '@jest/globals';
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';

import { writeLinkMessageIdempotently } from '../../../routes/links/messageIdempotency';
import { isClientMessageIdTakenError } from '../../../services/messaging/clientMessageIdOwnership';

const CONV_ID = '507f1f77bcf86cd799439011';
const GUEST = '507f1f77bcf86cd7994390a0';
const ALICE = '507f1f77bcf86cd7994390b9';
const CID = 'cid_550e8400-e29b-41d4-a716-446655440000';
const ALICE_SECRET = 'Le code de la porte est 4471';

type Row = Record<string, unknown>;

function prismaWith(rows: Row[]) {
  const table = [...rows];
  return {
    message: {
      create: async ({ data }: { data: Row }) => {
        if (table.some((r) => r.conversationId === data.conversationId && r.clientMessageId === data.clientMessageId)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const created = { ...data, id: 'written', sender: null, attachments: [], translations: null };
        table.push(created);
        return created;
      },
      findFirst: async ({ where }: { where: Row }) =>
        table.find((row) => Object.entries(where).every(([k, v]) =>
          v === null || typeof v === 'object' ? true : row[k] === v)) ?? null,
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    participant: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
  } as unknown as PrismaClient;
}

const aliceRow = (): Row => ({
  id: 'alice-row', conversationId: CONV_ID, senderId: ALICE, clientMessageId: CID,
  content: ALICE_SECRET, sender: null, attachments: [], translations: null,
});

const guestWrite = (): Prisma.MessageUncheckedCreateInput => ({
  conversationId: CONV_ID, senderId: GUEST, content: 'bonjour', originalLanguage: 'fr',
  messageType: 'text', clientMessageId: CID,
} as Prisma.MessageUncheckedCreateInput);

describe('le transport des liens apparie la clé AVEC son auteur (#19960)', () => {
  it('le rejeu de SA propre clé rend SA ligne, en doublon — inchangé', async () => {
    const prisma = prismaWith([{ ...aliceRow(), senderId: GUEST, content: 'bonjour' }]);

    const written = await writeLinkMessageIdempotently({
      prisma, data: guestWrite(), conversationId: CONV_ID, clientMessageId: CID,
    });

    expect(written.isDuplicate).toBe(true);
    expect(written.row).toMatchObject({ senderId: GUEST, content: 'bonjour' });
  });

  it('la clé tenue par un AUTRE ne rend PAS sa ligne : l’envoi est refusé, nommément', async () => {
    const prisma = prismaWith([aliceRow()]);

    const refusal = await writeLinkMessageIdempotently({
      prisma, data: guestWrite(), conversationId: CONV_ID, clientMessageId: CID,
    }).then(() => null, (err: unknown) => err);

    expect(isClientMessageIdTakenError(refusal)).toBe(true);
    expect(JSON.stringify(refusal)).not.toContain(ALICE_SECRET);
  });

  it('la clé LIBRE écrit la ligne de l’invité', async () => {
    const prisma = prismaWith([]);

    const written = await writeLinkMessageIdempotently({
      prisma, data: guestWrite(), conversationId: CONV_ID, clientMessageId: CID,
    });

    expect(written.isDuplicate).toBe(false);
    expect(written.row).toMatchObject({ senderId: GUEST, clientMessageId: CID });
  });
});
