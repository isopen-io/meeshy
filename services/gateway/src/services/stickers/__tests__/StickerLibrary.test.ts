/**
 * « Mes stickers » côté serveur (#7938) — créer, retrouver, utiliser, retirer.
 *
 * La base est un double EN MÉMOIRE qui applique la contrainte d'unicité
 * `(userId, contentHash)` comme Mongo : un double qui accepterait un doublon
 * rendrait vert un dédoublonnage qui n'existe pas. La normalisation est la
 * VRAIE (sharp) : c'est elle qui décide ce qu'est une image.
 *
 * @jest-environment node
 */
import sharp from 'sharp';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { STICKER_LIMITS } from '@meeshy/shared/types/sticker-definition';
import { StickerLibrary, type StickerFileStore } from '../StickerLibrary';

type Row = Record<string, unknown> & { id: string; userId: string; contentHash: string; lastUsedAt: Date };

const ALICE = '65f0c0ffee0000000000a11c';
const BOB = '65f0c0ffee0000000000b0b0';

function memoryPrisma() {
  const rows: Row[] = [];
  let seq = 0;
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const userSticker = {
    findMany: async ({ where, take }: { where: Record<string, unknown>; take: number }) =>
      rows
        .filter((row) => matches(row, where))
        .sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime())
        .slice(0, take),
    count: async ({ where }: { where: Record<string, unknown> }) => rows.filter((row) => matches(row, where)).length,
    findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find((row) => matches(row, where)) ?? null,
    create: async ({ data }: { data: Omit<Row, 'id'> }) => {
      if (rows.some((row) => row.userId === data.userId && row.contentHash === data.contentHash)) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      seq += 1;
      const row = { ...data, id: `65f0c0ffee00000000${String(seq).padStart(6, '0')}` } as Row;
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const index = rows.findIndex((row) => row.id === where.id);
      rows[index] = { ...rows[index], ...data } as Row;
      return rows[index];
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const index = rows.findIndex((row) => row.id === where.id);
      return rows.splice(index, 1)[0];
    },
  };
  return { prisma: { userSticker } as unknown as PrismaClient, rows };
}

function memoryFiles() {
  const stored = new Map<string, Buffer>();
  const files: StickerFileStore = {
    write: async (path, bytes) => void stored.set(path, bytes),
    remove: async (path) => void stored.delete(path),
  };
  return { files, stored };
}

function clock(start = Date.parse('2026-09-25T10:00:00Z')) {
  let t = start;
  return () => new Date((t += 1000));
}

function library() {
  const db = memoryPrisma();
  const disk = memoryFiles();
  let fileSeq = 0;
  const lib = new StickerLibrary({
    prisma: db.prisma,
    files: disk.files,
    now: clock(),
    newFileId: () => `file-${(fileSeq += 1)}`,
  });
  return { lib, ...db, ...disk };
}

const png = (red: number, width = 64, height = 64) =>
  sharp({ create: { width, height, channels: 4, background: { r: red, g: 10, b: 10, alpha: 0.4 } } }).png().toBuffer();

describe('StickerLibrary', () => {
  it('creates a sticker from an image and keeps its file where attachments are served', async () => {
    const { lib, stored } = library();

    const outcome = await lib.create(ALICE, { bytes: await png(10, 900, 300), origin: 'paste', name: '  Chat content  ' });

    expect(outcome.kind).toBe('created');
    if (outcome.kind !== 'created') throw new Error('unreachable');
    expect(outcome.sticker).toMatchObject({
      name: 'Chat content',
      origin: 'paste',
      mimeType: 'image/png',
      fileUrl: `stickers/${ALICE}/file-1.png`,
      width: 512,
      height: 171,
      animated: false,
    });
    expect(stored.get(`stickers/${ALICE}/file-1.png`)?.length).toBe(outcome.sticker.sizeBytes);
  });

  it('pasting the same image again brings the existing sticker back to the top instead of doubling it', async () => {
    const { lib, rows } = library();
    const bytes = await png(20);
    const first = await lib.create(ALICE, { bytes, origin: 'upload' });
    await lib.create(ALICE, { bytes: await png(30), origin: 'upload' });

    const again = await lib.create(ALICE, { bytes, origin: 'paste' });

    expect(again.kind).toBe('existing');
    expect(rows).toHaveLength(2);
    const listed = await lib.list(ALICE);
    expect(listed[0]?.id).toBe(first.kind === 'created' ? first.sticker.id : '');
  });

  it('the same image in two libraries makes two stickers — dedup is per owner', async () => {
    const { lib, rows } = library();
    const bytes = await png(40);

    await lib.create(ALICE, { bytes, origin: 'upload' });
    const bobs = await lib.create(BOB, { bytes, origin: 'upload' });

    expect(bobs.kind).toBe('created');
    expect(rows).toHaveLength(2);
  });

  it('refuses what is not an image and writes nothing', async () => {
    const { lib, rows, stored } = library();

    const outcome = await lib.create(ALICE, { bytes: Buffer.from('<svg onload=alert(1)>'), origin: 'paste' });

    expect(outcome).toEqual({ kind: 'refused', reason: 'not-an-image' });
    expect(rows).toHaveLength(0);
    expect(stored.size).toBe(0);
  });

  it('refuses a new sticker once the library is full', async () => {
    const { lib, rows } = library();
    rows.push(
      ...[...Array(STICKER_LIMITS.maxCount)].map((_, i) => ({
        id: `id-${i}`,
        userId: ALICE,
        contentHash: `hash-${i}`,
        lastUsedAt: new Date(0),
      })),
    );

    expect(await lib.create(ALICE, { bytes: await png(50), origin: 'upload' })).toEqual({ kind: 'library-full' });
  });

  it('lists the most recently used first, and marking a sticker used moves it up', async () => {
    const { lib } = library();
    const a = await lib.create(ALICE, { bytes: await png(60), origin: 'upload' });
    await lib.create(ALICE, { bytes: await png(70), origin: 'upload' });
    if (a.kind !== 'created') throw new Error('unreachable');

    await lib.markUsed(ALICE, a.sticker.id);

    expect((await lib.list(ALICE)).map((s) => s.id)[0]).toBe(a.sticker.id);
  });

  it('never lets someone use or remove a sticker that is not theirs', async () => {
    const { lib, rows, stored } = library();
    const alices = await lib.create(ALICE, { bytes: await png(80), origin: 'upload' });
    if (alices.kind !== 'created') throw new Error('unreachable');

    expect(await lib.markUsed(BOB, alices.sticker.id)).toBeNull();
    expect(await lib.remove(BOB, alices.sticker.id)).toBe(false);
    expect(rows).toHaveLength(1);
    expect(stored.size).toBe(1);
  });

  it('removing a sticker deletes its row and its file', async () => {
    const { lib, rows, stored } = library();
    const created = await lib.create(ALICE, { bytes: await png(90), origin: 'upload' });
    if (created.kind !== 'created') throw new Error('unreachable');

    expect(await lib.remove(ALICE, created.sticker.id)).toBe(true);
    expect(rows).toHaveLength(0);
    expect(stored.size).toBe(0);
  });

  it('a race on the same image resolves to the sticker that won, and leaves no orphan file', async () => {
    const { lib, stored } = library();
    const bytes = await png(100);

    const [one, two] = await Promise.all([
      lib.create(ALICE, { bytes, origin: 'paste' }),
      lib.create(ALICE, { bytes, origin: 'paste' }),
    ]);

    expect([one.kind, two.kind].sort()).toEqual(['created', 'existing']);
    expect(stored.size).toBe(1);
  });
});
