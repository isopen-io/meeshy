/**
 * Rattrapage du 2026-10-11 (#10151, LP3) — les données de packs des comptes
 * DÉJÀ purgés : choix d'installation, bibliothèque de stickers et ses fichiers
 * `stickers/<userId>/`, propositions non publiées et leurs fichiers ; un pack
 * publié reste en place, auteur anonymisé (PP8, #10184).
 *
 * FAÇADE MINCE : la logique vit dans `src/services/packs/packPurgeBackfill.ts`,
 * qui appelle la purge même du compte (`purgePackData`) — le script ne peut
 * pas dériver de ce qu'il applique.
 *
 * `DRY_RUN=1` : compte comptes, lignes et fichiers, sans rien toucher.
 * Idempotent : rejoué, il ne trouve plus rien.
 *
 * ⚠ À exécuter DANS le conteneur de la passerelle (base ET volume des
 * téléversements : `UPLOAD_PATH`). En autonomie sur staging ; en production
 * SEULEMENT après feu vert du porteur et sauvegarde vérifiée.
 *
 * Usage :
 *   cd services/gateway
 *   DRY_RUN=1 bunx tsx scripts/2026-10-11-purge-pack-data-of-purged-accounts.ts   # à blanc
 *   bunx tsx scripts/2026-10-11-purge-pack-data-of-purged-accounts.ts             # écrit
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { defaultPackFileStore } from '../src/services/packs/PackPrivacy';
import { backfillPackPurge } from '../src/services/packs/packPurgeBackfill';

const DRY_RUN = process.env.DRY_RUN === '1';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  console.log('Rattrapage des packs des comptes déjà purgés (#10151)');
  console.log(`  mode : ${DRY_RUN ? 'À BLANC (DRY_RUN=1)' : 'ÉCRITURE'}`);
  try {
    const report = await backfillPackPurge(prisma, {
      files: defaultPackFileStore(),
      dryRun: DRY_RUN,
      onAccount: (userId, summary) => {
        if (Object.values(summary).some((count) => count > 0)) console.log(`  ${userId}  ${JSON.stringify(summary)}`);
      },
    });
    console.log('');
    console.log(`  comptes anonymisés examinés : ${report.accountsScanned}`);
    console.log(`  comptes avec des données    : ${report.accountsWithData}`);
    console.log(`  choix                       : ${report.totals.choicesDeleted}`);
    console.log(`  stickers de bibliothèque    : ${report.totals.libraryDeleted}`);
    console.log(`  propositions non publiées   : ${report.totals.submissionsDeleted}`);
    console.log(`  packs publiés anonymisés    : ${report.totals.publishedAnonymized}`);
    console.log(`  fichiers                    : ${report.totals.filesDeleted}`);
    console.log(`  packs achetés (possessions) : ${report.totals.ownershipsDeleted}`);
    if (DRY_RUN) console.log("\nÀ blanc : rien n'a été écrit. Relancer sans DRY_RUN pour appliquer.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du rattrapage :', error);
  process.exit(1);
});
