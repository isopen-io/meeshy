/**
 * Rattrapage du 2026-10-25 (#10188) — l'empreinte des fichiers des packs de
 * stickers de tiers proposés AVANT que la proposition la grave. Sans elle, un
 * fichier n'a pas d'adresse dans le magasin `/api/v1/pack-assets/` et reste
 * servi par son seul ancien chemin (`/attachments/file/*`).
 *
 * FAÇADE MINCE : la logique vit dans `src/services/packs/stickerPackHashBackfill.ts`.
 *
 * `DRY_RUN=1` : compte sans rien écrire. Idempotent : rejoué, il ne retrouve
 * que les fichiers absents du volume ou d'une autre taille que leur ligne.
 *
 * ⚠ À exécuter DANS le conteneur de la passerelle (base ET volume des
 * téléversements : `UPLOAD_PATH`). En autonomie sur staging ; en production
 * SEULEMENT après feu vert du porteur et sauvegarde vérifiée.
 *
 * Usage :
 *   cd services/gateway
 *   DRY_RUN=1 bunx tsx scripts/2026-10-25-backfill-sticker-pack-hashes.ts   # à blanc
 *   bunx tsx scripts/2026-10-25-backfill-sticker-pack-hashes.ts             # écrit
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { defaultStickerPackFileReader } from '../src/services/packs/stickerPackAssets';
import { backfillStickerPackHashes } from '../src/services/packs/stickerPackHashBackfill';

const DRY_RUN = process.env.DRY_RUN === '1';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  console.log('Rattrapage des empreintes des fichiers de packs de stickers (#10188)');
  console.log(`  mode : ${DRY_RUN ? 'À BLANC (DRY_RUN=1)' : 'ÉCRITURE'}`);
  try {
    const report = await backfillStickerPackHashes(prisma, { files: defaultStickerPackFileReader(), dryRun: DRY_RUN });
    console.log('');
    console.log(`  fichiers sans empreinte examinés : ${report.scanned}`);
    console.log(`  empreintes gravées               : ${report.hashed}`);
    console.log(`  absents du volume                : ${report.missing}`);
    console.log(`  taille différente de la ligne    : ${report.sizeMismatch}`);
    if (DRY_RUN) console.log("\nÀ blanc : rien n'a été écrit. Relancer sans DRY_RUN pour appliquer.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du rattrapage :', error);
  process.exit(1);
});
