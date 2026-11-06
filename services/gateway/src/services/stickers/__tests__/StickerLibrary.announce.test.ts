/**
 * « Mes stickers » traverse les appareils du compte (#16515).
 *
 * `UserSticker` est par UTILISATEUR. Les quatre chemins d'écriture de
 * `StickerLibrary` ne diffusaient rien : la grille d'un second appareil
 * restait périmée — et, le web tenant la liste cinq minutes
 * (`STICKERS_STALE_TIME`), périmée pour de bon jusqu'à un relevé manuel.
 *
 * Ces témoins tiennent l'obligation là où elle doit vivre : chez l'écrivain
 * UNIQUE, pas chez ses appelants. C'est la forme de
 * `personalMessageVisibilitySync` — « keeping them in one module is what
 * stops a fourth writer from honouring only part of the contract ».
 *
 * Le double de la base applique l'unicité `(userId, contentHash)` comme Mongo,
 * et la normalisation est la VRAIE (sharp) : un double permissif rendrait vert
 * un dédoublonnage qui n'existe pas, donc une annonce `promoted` qui ne
 * partirait jamais.
 *
 * @jest-environment node
 */
import sharp from 'sharp';
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { StickerLibraryUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { StickerLibrary, type StickerFileStore } from '../StickerLibrary';

type Row = Record<string, unknown> & { id: string; userId: string; contentHash: string; lastUsedAt: Date };

const ALICE = '65f0c0ffee0000000000a11c';

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
  return { files };
}

function clock(start = Date.parse('2026-11-06T10:00:00Z')) {
  let t = start;
  return () => new Date((t += 1000));
}

function library(announce?: (event: StickerLibraryUpdatedEventData) => void) {
  const db = memoryPrisma();
  const disk = memoryFiles();
  let fileSeq = 0;
  const announced: StickerLibraryUpdatedEventData[] = [];
  const lib = new StickerLibrary({
    prisma: db.prisma,
    files: disk.files,
    now: clock(),
    newFileId: () => `file-${(fileSeq += 1)}`,
    announce:
      announce ??
      ((event) => {
        announced.push(event);
      }),
  });
  return { lib, announced, ...db };
}

const png = (red: number, width = 64, height = 64) =>
  sharp({ create: { width, height, channels: 4, background: { r: red, g: 10, b: 10, alpha: 0.4 } } })
    .png()
    .toBuffer();

describe('StickerLibrary — chaque écriture atteint les autres appareils du compte', () => {
  it('annonce `added` avec la définition servie quand un sticker est créé', async () => {
    const { lib, announced } = library();

    const outcome = await lib.create(ALICE, { bytes: await png(10), origin: 'paste', name: 'Chat' });
    if (outcome.kind !== 'created') throw new Error('unreachable');

    expect(announced).toEqual([
      { userId: ALICE, change: 'added', sticker: outcome.sticker, at: outcome.sticker.createdAt },
    ]);
  });

  /**
   * Re-coller la MÊME image remonte l'existante. L'ordre de la grille EST
   * `lastUsedAt desc` : sans cette annonce, le second appareil garde un ordre
   * faux dès le premier doublon — un défaut qui ne ressemble pas à une
   * désynchronisation, mais à un tri cassé.
   */
  it('annonce `promoted` quand une image déjà connue remonte en tête', async () => {
    const { lib, announced } = library();
    const bytes = await png(20);
    await lib.create(ALICE, { bytes, origin: 'upload' });
    announced.length = 0;

    const again = await lib.create(ALICE, { bytes, origin: 'upload' });
    if (again.kind !== 'existing') throw new Error('unreachable');

    expect(announced).toEqual([
      { userId: ALICE, change: 'promoted', sticker: again.sticker, at: again.sticker.lastUsedAt },
    ]);
  });

  it('annonce `promoted` quand un sticker part dans un message', async () => {
    const { lib, announced } = library();
    const created = await lib.create(ALICE, { bytes: await png(30), origin: 'lift' });
    if (created.kind !== 'created') throw new Error('unreachable');
    announced.length = 0;

    const used = await lib.markUsed(ALICE, created.sticker.id);
    if (used === null) throw new Error('unreachable');

    expect(announced).toEqual([{ userId: ALICE, change: 'promoted', sticker: used, at: used.lastUsedAt }]);
  });

  /**
   * Le retrait est le membre qui n'a RIEN à servir : la ligne n'existe plus,
   * donc la charge ne porte qu'un identifiant. C'est aussi le plus coûteux à
   * manquer — un sticker retiré ici reste touchable là-bas, et le toucher
   * envoie un sticker dont la ligne est partie.
   */
  it('annonce `removed` avec le seul identifiant quand un sticker est retiré', async () => {
    const { lib, announced } = library();
    const created = await lib.create(ALICE, { bytes: await png(40), origin: 'upload' });
    if (created.kind !== 'created') throw new Error('unreachable');
    announced.length = 0;

    expect(await lib.remove(ALICE, created.sticker.id)).toBe(true);

    expect(announced).toHaveLength(1);
    const [event] = announced;
    expect(event).toMatchObject({ userId: ALICE, change: 'removed', stickerId: created.sticker.id });
    // L'instant est celui de l'horloge du service, pas un tic compté à la main :
    // ce qui s'affirme ici est l'ORDRE — le retrait suit la création.
    expect(Date.parse(event!.at)).toBeGreaterThan(Date.parse(created.sticker.createdAt));
    // Et le membre `removed` ne porte RIEN d'autre : la ligne n'existe plus.
    expect(Object.keys(event!).sort()).toEqual(['at', 'change', 'stickerId', 'userId']);
  });

  it('n’annonce rien quand l’écriture n’a pas lieu — identifiant inconnu, ou sticker d’autrui', async () => {
    const { lib, announced } = library();
    const created = await lib.create(ALICE, { bytes: await png(50), origin: 'upload' });
    if (created.kind !== 'created') throw new Error('unreachable');
    announced.length = 0;

    expect(await lib.markUsed('65f0c0ffee0000000000b0b0', created.sticker.id)).toBeNull();
    expect(await lib.remove('65f0c0ffee0000000000b0b0', created.sticker.id)).toBe(false);

    expect(announced).toEqual([]);
  });

  /**
   * La diffusion est un canal LATÉRAL : une écriture qui a eu lieu ne se
   * rapporte jamais comme un échec, sans quoi l'utilisateur rejoue un geste
   * qui a déjà pris effet. Même posture que `personalMessageVisibilitySync`,
   * et que `creditCreation` dix lignes plus bas dans ce service.
   *
   * On ne s'appuie PAS sur le fait que `broadcastToUser` avale ses erreurs :
   * c'est une propriété du collaborateur, pas une garantie du site d'appel.
   */
  it('une annonce qui lève ne fait pas échouer l’écriture', async () => {
    const { lib, rows } = library(() => {
      throw new Error('socket layer down');
    });

    const outcome = await lib.create(ALICE, { bytes: await png(60), origin: 'upload' });

    expect(outcome.kind).toBe('created');
    expect(rows).toHaveLength(1);
    if (outcome.kind !== 'created') throw new Error('unreachable');
    expect(await lib.markUsed(ALICE, outcome.sticker.id)).not.toBeNull();
    expect(await lib.remove(ALICE, outcome.sticker.id)).toBe(true);
    expect(rows).toHaveLength(0);
  });

  /** Un service construit sans annonceur écrit exactement comme avant. */
  it('sans annonceur, les écritures se font quand même', async () => {
    const db = memoryPrisma();
    const lib = new StickerLibrary({ prisma: db.prisma, files: memoryFiles().files, now: clock(), newFileId: () => 'file-1' });

    const outcome = await lib.create(ALICE, { bytes: await png(70), origin: 'upload' });

    expect(outcome.kind).toBe('created');
    expect(db.rows).toHaveLength(1);
  });
});
