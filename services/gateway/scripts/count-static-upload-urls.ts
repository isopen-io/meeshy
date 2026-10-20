/**
 * COMPTE, EN BASE, LES ADRESSES QUI PORTENT `static.<domaine>/uploads` (#11256).
 *
 * PRÉALABLE au retrait du montage des uploads de la passerelle dans le nginx
 * statique. Lecture SEULE : ce script n'écrit rien, il n'a pas de mode
 * `--apply`. S'il trouve des lignes, leur réécriture est une MIGRATION DE
 * DONNÉES soumise au feu vert du porteur (#9223), précédée d'une sauvegarde
 * vérifiée — pas un effet de bord de ce compte.
 *
 * FAÇADE MINCE : la décision et le balayage vivent dans
 * `src/services/attachments/staticUploadUrlCount.ts` (sous `src/`, donc lus par
 * `tsc`, comme `normalize-media-urls.ts`), les requêtes dans `mediaUrlStores.ts`.
 *
 * ⚠ Lancé depuis un poste de travail, `DATABASE_URL` cible la base LOCALE. À
 * exécuter DANS le conteneur du gateway de l'environnement visé.
 *
 * Usage:
 *   docker exec -it meeshy-gateway sh -lc 'cd /app && bunx tsx scripts/count-static-upload-urls.ts'
 *
 * Code de sortie : 0 = aucune ligne, le retrait peut suivre ; 3 = des lignes
 * existent (migration de données d'abord) ; 1 = erreur.
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';

import { attachmentUrlStore, postMediaUrlStore } from '../src/services/attachments/mediaUrlStores';
import { countStaticUploadUrls } from '../src/services/attachments/staticUploadUrlCount';

async function main(): Promise<number> {
  const prisma = new PrismaClient();
  try {
    const report = await countStaticUploadUrls({
      stores: [attachmentUrlStore(prisma.messageAttachment), postMediaUrlStore(prisma.postMedia)],
    });

    console.log('Adresses static.<domaine>/uploads en base (#11256)');
    for (const [nom, tally] of Object.entries(report.parCollection)) {
      console.log(`  ${nom}`);
      console.log(`    lignes examinées : ${tally.scanned}`);
      console.log(`    fileUrl          : ${tally.fileUrl}`);
      console.log(`    thumbnailUrl     : ${tally.thumbnailUrl}`);
    }
    for (const exemple of report.exemples) console.log(`    ${exemple}`);
    console.log('');
    console.log(`  TOTAL : ${report.total}`);
    console.log(
      report.total === 0
        ? '  Aucune adresse à migrer : le montage peut être retiré.'
        : '  Des adresses existent : migration de données (feu vert du porteur) AVANT le retrait.',
    );
    return report.total === 0 ? 0 : 3;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
