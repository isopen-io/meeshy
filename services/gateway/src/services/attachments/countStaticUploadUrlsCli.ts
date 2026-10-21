/**
 * LE COMPTE `static.<domaine>/uploads` EN LIGNE DE COMMANDE (#11256).
 *
 * Sous `src/` pour être COMPILÉ dans l'image : le conteneur de production ne
 * porte que `dist/` (ni `scripts/` ni `tsx`). Lecture SEULE, sans `--apply`.
 *
 *   docker exec meeshy-gateway-staging node dist/src/services/attachments/countStaticUploadUrlsCli.js
 *   docker exec meeshy-gateway         node dist/src/services/attachments/countStaticUploadUrlsCli.js
 *
 * Code de sortie : 0 = aucune ligne, le retrait peut suivre ; 3 = des lignes
 * existent (migration de données d'abord, feu vert du porteur) ; 1 = erreur.
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';

import { countStaticUploadUrls, type StaticUploadUrlReport } from './staticUploadUrlCount';
import { staticUploadUrlStores } from './staticUploadUrlStores';

export function formatStaticUploadUrlReport(report: StaticUploadUrlReport): readonly string[] {
  const collections = Object.entries(report.parCollection).flatMap(([nom, tally]) => [
    `  ${nom} — lignes examinées : ${tally.scanned}`,
    ...Object.entries(tally.parColonne).map(([colonne, n]) => `    ${colonne.padEnd(14)}: ${n}`),
  ]);
  return [
    'Adresses static.<domaine>/uploads en base (#11256)',
    ...collections,
    ...report.exemples.map((exemple) => `    ${exemple}`),
    '',
    `  TOTAL : ${report.total}`,
    report.total === 0
      ? '  Aucune adresse à migrer : le montage peut être retiré.'
      : '  Des adresses existent : migration de données (feu vert du porteur) AVANT le retrait.',
  ];
}

export async function runStaticUploadUrlCount(): Promise<number> {
  const prisma = new PrismaClient();
  try {
    const report = await countStaticUploadUrls({ stores: staticUploadUrlStores(prisma) });
    formatStaticUploadUrlReport(report).forEach((ligne) => console.log(ligne));
    return report.total === 0 ? 0 : 3;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runStaticUploadUrlCount()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
