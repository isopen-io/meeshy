/**
 * La mesure des packs de cadres de capture (#10169, lot LC ; décision #10187) —
 * combien de comptes ont retiré ou réinstallé chaque ambiance, agrégé par slug
 * et par état, SANS AUCUN identifiant, cellules de moins de 5 comptes
 * supprimées. C'est elle qui tranche le déclencheur 1 de LC2 (#10170).
 *
 * FAÇADE MINCE : la logique vit dans `src/services/packs/captureFramePackMeasure.ts`.
 * LECTURE SEULE (un `findMany`) : sans risque en production, sans feu vert.
 *
 * Usage, dans le conteneur de la passerelle :
 *   cd services/gateway
 *   bunx tsx scripts/measure-capture-frame-packs.ts
 *
 * Première sortie sur staging à la clôture de LC ; seconde en production
 * 30 jours après la promotion. Chaque sortie se cite sur #10187.
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { CAPTURE_FRAME_MEASURE_MIN_ACCOUNTS, readCaptureFramePackMeasure } from '../src/services/packs/captureFramePackMeasure';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const report = await readCaptureFramePackMeasure(prisma);
    console.log(`Mesure des packs de cadres de capture — ${new Date().toISOString()}`);
    console.log(`  cellules de moins de ${CAPTURE_FRAME_MEASURE_MIN_ACCOUNTS} comptes supprimées : ${report.suppressedCells}`);
    console.log(`  comptes ayant touché au moins une ambiance : ${report.accounts ?? `moins de ${CAPTURE_FRAME_MEASURE_MIN_ACCOUNTS}`}`);
    for (const cell of report.cells) console.log(`  ${cell.slug.padEnd(14)} ${cell.state.padEnd(12)} ${cell.accounts}`);
    console.log(JSON.stringify(report));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec de la mesure :', error);
  process.exit(1);
});
