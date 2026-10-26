/**
 * LE RATTRAPAGE DES EMPREINTES DES FICHIERS DE PACKS DE STICKERS (#10188).
 *
 * Une proposition grave depuis #10188 l'empreinte des octets qu'elle garde
 * (`StickerPackItem.sha256`) : c'est l'adresse du fichier dans le magasin
 * `/pack-assets`. Les fichiers proposés AVANT n'en ont pas, et restent servis
 * par leur seul ancien chemin (`/attachments/file/*`). Ce rattrapage relit
 * chacun sur le volume et grave l'empreinte de ce qu'il y trouve.
 *
 * Il ne grave RIEN quand il ne peut pas prouver l'adresse : un fichier absent
 * du volume (`missing`), ou dont la taille ne correspond plus à `sizeBytes`
 * (`sizeMismatch` — la référence servie annoncerait une taille fausse, et un
 * client qui la vérifie refuserait les octets). Ceux-là restent sur l'ancien
 * chemin, et le compte rendu les nomme.
 *
 * `dryRun` compte sans rien écrire. Idempotent : rejoué, il ne retrouve que ce
 * qu'il n'a pas pu prouver. Un champ ABSENT (lignes d'avant le schéma) et un
 * champ `null` se lisent tous deux (`packages/shared/CLAUDE.md`, idiome Mongo).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { sha256Hex, type StickerPackFileReader } from './stickerPackAssets';

export type StickerPackHashBackfillOptions = {
  readonly files: StickerPackFileReader;
  readonly dryRun: boolean;
  readonly batchSize?: number;
};

export type StickerPackHashBackfillReport = {
  readonly scanned: number;
  readonly hashed: number;
  readonly missing: number;
  readonly sizeMismatch: number;
};

type Outcome = 'hashed' | 'missing' | 'sizeMismatch';

type Unhashed = { readonly id: string; readonly filePath: string; readonly sizeBytes: number };

export async function backfillStickerPackHashes(
  prisma: Pick<PrismaClient, 'stickerPackItem'>,
  options: StickerPackHashBackfillOptions,
): Promise<StickerPackHashBackfillReport> {
  const take = options.batchSize ?? 200;
  const hashOne = async (row: Unhashed): Promise<Outcome> => {
    const bytes = await options.files.read(row.filePath);
    if (bytes === null) return 'missing';
    if (bytes.length !== row.sizeBytes) return 'sizeMismatch';
    if (!options.dryRun) await prisma.stickerPackItem.update({ where: { id: row.id }, data: { sha256: sha256Hex(bytes) } });
    return 'hashed';
  };

  let cursor: string | null = null;
  let report: StickerPackHashBackfillReport = { scanned: 0, hashed: 0, missing: 0, sizeMismatch: 0 };
  for (;;) {
    const rows: readonly Unhashed[] = await prisma.stickerPackItem.findMany({
      where: { OR: [{ sha256: null }, { sha256: { isSet: false } }], ...(cursor === null ? {} : { id: { gt: cursor } }) },
      select: { id: true, filePath: true, sizeBytes: true },
      orderBy: { id: 'asc' },
      take,
    });
    for (const row of rows) {
      const outcome = await hashOne(row);
      report = { ...report, scanned: report.scanned + 1, [outcome]: report[outcome] + 1 };
    }
    if (rows.length < take) return report;
    cursor = rows[rows.length - 1].id;
  }
}
