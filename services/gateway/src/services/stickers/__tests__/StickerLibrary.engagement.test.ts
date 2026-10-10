/**
 * #8959 — un sticker NEUF fait par l'utilisateur (fichier, collage,
 * détourage) crédite `tool.sticker_created` ; une image déjà connue, un sticker
 * reçu et gardé ou un refus ne créditent rien.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import sharp from 'sharp';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { StickerOrigin } from '@meeshy/shared/types/sticker-definition';
import { StickerLibrary } from '../StickerLibrary';

const ALICE = '65f0c0ffee0000000000a11c';

type Row = Record<string, unknown> & { id: string; userId: string; contentHash: string };

function library() {
  const rows: Row[] = [];
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const userSticker = {
    count: async ({ where }: { where: Record<string, unknown> }) => rows.filter((row) => matches(row, where)).length,
    findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find((row) => matches(row, where)) ?? null,
    create: async ({ data }: { data: Omit<Row, 'id'> }) => {
      const row = { ...data, id: `65f0c0ffee00000000${String(rows.length + 1).padStart(6, '0')}` } as Row;
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const index = rows.findIndex((row) => row.id === where.id);
      rows[index] = { ...rows[index], ...data } as Row;
      return rows[index];
    },
  };
  const engagement = { recordActivity: jest.fn<any>(async () => undefined) };
  const lib = new StickerLibrary({
    prisma: { userSticker } as unknown as PrismaClient,
    files: { write: async () => undefined, remove: async () => undefined },
    engagement,
  });
  return { lib, engagement };
}

const png = (red: number) =>
  sharp({ create: { width: 64, height: 64, channels: 4, background: { r: red, g: 10, b: 10, alpha: 0.4 } } }).png().toBuffer();

describe('#8959 — `tool.sticker_created`', () => {
  it.each<StickerOrigin>(['upload', 'paste', 'lift'])('crédite un sticker neuf créé par « %s »', async (origin) => {
    const { lib, engagement } = library();

    const outcome = await lib.create(ALICE, { bytes: await png(10), origin });

    expect(outcome.kind).toBe('created');
    expect(engagement.recordActivity).toHaveBeenCalledTimes(1);
    expect(engagement.recordActivity).toHaveBeenCalledWith(ALICE, 'tool.sticker_created');
  });

  it('ne crédite pas un sticker reçu et gardé', async () => {
    const { lib, engagement } = library();

    expect((await lib.create(ALICE, { bytes: await png(20), origin: 'received' })).kind).toBe('created');
    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('ne recrédite pas une image déjà dans la bibliothèque', async () => {
    const { lib, engagement } = library();
    const bytes = await png(30);

    await lib.create(ALICE, { bytes, origin: 'upload' });
    const again = await lib.create(ALICE, { bytes, origin: 'upload' });

    expect(again.kind).toBe('existing');
    expect(engagement.recordActivity).toHaveBeenCalledTimes(1);
  });

  it("ne crédite rien pour ce qui n'est pas une image", async () => {
    const { lib, engagement } = library();

    expect((await lib.create(ALICE, { bytes: Buffer.from('pas une image'), origin: 'upload' })).kind).toBe('refused');
    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });
});
