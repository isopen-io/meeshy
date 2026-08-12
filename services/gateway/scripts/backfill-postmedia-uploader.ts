/**
 * Rattrapage de `PostMedia.uploaderId` — préalable à la phase 2.
 *
 * `PostMedia` n'a longtemps porté aucun propriétaire : le rattachement d'un
 * média téléversé se réduisait à « personne ne l'a pris avant moi », et un
 * tiers pouvait s'approprier le média d'autrui en devinant son id (les
 * ObjectId voisins ne diffèrent que d'un compteur). Le champ existe désormais
 * et toute création le pose ; ce script rattrape l'existant.
 *
 * Tant que `unresolvedClaimable` n'est pas à ZÉRO, la garde de rattachement
 * doit rester tolérante — donc le trou reste ouvert. C'est ce chiffre, et lui
 * seul, qui autorise la phase 2 (`claimableMediaWhere` → égalité stricte).
 *
 * FAÇADE MINCE : la logique vit dans `services/posts/mediaOwnershipBackfill.ts`,
 * pour que le script ne dérive pas de ce qu'il est censé appliquer.
 *
 * Sans écriture par défaut : `--apply` est OBLIGATOIRE pour corriger.
 *
 * ⚠ Lancé depuis un poste de travail, `DATABASE_URL` cible la base LOCALE et le
 * script affichera « succès » sans avoir touché la production — celle-ci
 * n'expose aucun port. À exécuter DANS le conteneur du gateway.
 *
 * Usage:
 *   cd services/gateway
 *   bunx tsx scripts/backfill-postmedia-uploader.ts             # à blanc
 *   bunx tsx scripts/backfill-postmedia-uploader.ts --apply     # écrit
 *   bunx tsx scripts/backfill-postmedia-uploader.ts --verbose   # détaille
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { backfillPostMediaUploader } from '../src/services/posts/mediaOwnershipBackfill';

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  console.log('Rattrapage PostMedia.uploaderId');
  console.log(`  mode : ${APPLY ? 'ÉCRITURE (--apply)' : 'À BLANC (défaut)'}`);
  console.log('');

  try {
    const report = await backfillPostMediaUploader(prisma, {
      apply: APPLY,
      onResolve: VERBOSE
        ? ({ mediaId, uploaderId, source }) => console.log(`  ${mediaId}  ← ${uploaderId}  (${source})`)
        : undefined,
      onUnresolved: ({ mediaId, filePath, claimable }) => {
        console.log(`  NON RÉSOLU ${mediaId}${claimable ? '  [RÉCLAMABLE]' : ''}  path=${filePath ?? 'ø'}`);
      },
    });

    console.log('');
    console.log(`  examinés            : ${report.scanned}`);
    console.log(`  résolus via post    : ${report.fromPost}`);
    console.log(`  résolus via comment : ${report.fromComment}`);
    console.log(`  résolus via chemin  : ${report.fromFilePath}   (inféré — cf. en-tête)`);
    console.log(`  non résolus         : ${report.unresolved}`);
    console.log(`  dont RÉCLAMABLES    : ${report.unresolvedClaimable}`);
    console.log('');

    if (!APPLY) {
      console.log('À blanc : rien n\'a été écrit. Relancer avec --apply.');
      return;
    }
    if (report.unresolvedClaimable > 0) {
      console.log(`⚠ ${report.unresolvedClaimable} média(s) réclamable(s) restent sans propriétaire.`);
      console.log('  NE PAS passer la garde en égalité stricte : ces médias deviendraient');
      console.log('  impossibles à rattacher, en silence. Les traiter d\'abord (purge des');
      console.log('  orphelins anciens, ou attribution manuelle).');
      process.exitCode = 1;
      return;
    }
    console.log('✓ Aucun média réclamable sans propriétaire — la phase 2 peut être appliquée.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du rattrapage :', error);
  process.exit(1);
});
