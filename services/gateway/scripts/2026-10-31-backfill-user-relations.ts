/**
 * Rattrapage du 2026-10-31 (#13926) — une ligne `UserRelation` FRIEND/FRIEND
 * (origine `backfill-friend`) pour chaque demande d'amitié ACCEPTÉE.
 *
 * FAÇADE MINCE : la logique vit dans `src/services/relations/userRelationBackfill.ts`.
 *
 * `DRY_RUN=1` : compte sans rien écrire. Idempotent : rejoué, il ne crée que ce
 * qui manque et n'écrase JAMAIS une ligne existante (une montée de niveau
 * survit au rattrapage).
 *
 * ⚠ À jouer APRÈS la migration d'index
 * `packages/shared/prisma/migrations/2026-10-31-user-relation-indexes.mongodb.js`
 * (l'unique de paire refuse le doublon quand deux écrivains se croisent).
 * En autonomie sur staging ; en production SEULEMENT après feu vert du porteur
 * et sauvegarde vérifiée (#9223).
 *
 * Usage :
 *   cd services/gateway
 *   DRY_RUN=1 bunx tsx scripts/2026-10-31-backfill-user-relations.ts   # à blanc
 *   bunx tsx scripts/2026-10-31-backfill-user-relations.ts             # écrit
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { backfillUserRelations } from '../src/services/relations/userRelationBackfill';

const DRY_RUN = process.env.DRY_RUN === '1';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  console.log('Rattrapage des liens entre personnes (#13926)');
  console.log(`  mode : ${DRY_RUN ? 'À BLANC (DRY_RUN=1)' : 'ÉCRITURE'}`);
  try {
    const report = await backfillUserRelations(prisma, { dryRun: DRY_RUN, now: new Date() });
    console.log('');
    console.log(`  demandes acceptées examinées : ${report.scanned}`);
    console.log(`  liens créés                  : ${report.created}`);
    console.log(`  déjà présents (ou doublons)  : ${report.alreadyPresent}`);
    console.log(`  ignorées (auto-demande)      : ${report.skippedSelf}`);
    if (DRY_RUN) console.log("\nÀ blanc : rien n'a été écrit. Relancer sans DRY_RUN pour appliquer.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du rattrapage :', error);
  process.exit(1);
});
