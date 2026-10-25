/**
 * La mesure de l'immortalisation (D15, #10185 — lot L20 #10176) — REQUÊTE D'ADMINISTRATION EN LECTURE SEULE.
 *
 * Rend, en JSON sur la sortie standard, des agrégats ANONYMES du registre `GamePhotoMoment` et des notifications
 * `game_photo_moment` : jour UTC × famille × clé agrégée × événement (`presented`, `notified`, `kept`) × surface
 * grossière, le taux d'immortalisation par famille et par clé, les push envoyés et lus. Aucun identifiant ne sort ;
 * une cellule de moins de dix comptes distincts est supprimée ; un compte qui a refusé l'analyse ne compte pas.
 * Rien n'est écrit : rejouer la requête ne change rien en base.
 *
 * FAÇADE MINCE : la logique et ses témoins vivent dans `src/services/game/photoMomentsMeasure.ts`.
 *
 * Usage (dans le conteneur de la passerelle, staging ou production) :
 *   cd services/gateway
 *   bunx tsx scripts/game-photo-moments-measure.ts                                  # les 7 derniers jours UTC
 *   bunx tsx scripts/game-photo-moments-measure.ts --from 2026-10-18 --to 2026-10-25
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { measurePhotoMoments, parsePhotoMeasureArgs, type PhotoMeasureReader } from '../src/services/game/photoMomentsMeasure';

async function main(): Promise<void> {
  const now = new Date();
  const window = parsePhotoMeasureArgs(process.argv.slice(2), now);
  if ('reason' in window) {
    console.error(`✗ Arguments (${window.reason}) : [--from AAAA-MM-JJ] [--to AAAA-MM-JJ], fenêtre non vide, au plus 25 mois en arrière.`);
    process.exitCode = 1;
    return;
  }
  const prisma = new PrismaClient();
  try {
    const reader: PhotoMeasureReader = { gamePhotoMoment: prisma.gamePhotoMoment, notification: prisma.notification, user: prisma.user };
    const report = await measurePhotoMoments(reader, { ...window, now });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec de la mesure photo :', error);
  process.exitCode = 1;
});
