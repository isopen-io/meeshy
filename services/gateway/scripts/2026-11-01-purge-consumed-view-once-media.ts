/**
 * Rattrapage du 2026-11-01 (#11269, S14) — les médias à vue unique DÉJÀ lus
 * par tous leurs destinataires, dont les octets dorment encore sur le disque
 * ou dans le seau : lus avant que la consommation ne programme la purge, ou
 * purgés par l'ancienne purge alors qu'une pièce résistait.
 *
 * FAÇADE MINCE : la logique vit dans
 * `src/services/messaging/viewOnceMediaCatchUp.ts`. Le script ne détruit rien
 * lui-même : il RÉARME l'échéance de purge, et c'est le balayage de la
 * passerelle en marche (`ExpiredMessagesCleanupService.purgeViewOnce`, chaque
 * minute) qui efface — octets partagés gardés tant qu'une autre ligne les cite.
 * Les octets partent donc dans les ~6 minutes qui suivent une écriture.
 *
 * À SEC PAR DÉFAUT : compte les messages et les pièces, sans rien écrire.
 * `APPLY=1` est le SEUL moyen d'écrire. Idempotent : rejoué après le balayage,
 * il ne retrouve plus rien.
 *
 * ⚠ En autonomie sur staging. En production SEULEMENT après feu vert du
 * porteur ET sauvegarde VÉRIFIÉE de la base et du stockage des médias (#9223) :
 * ce qui est effacé ne revient pas.
 *
 * Usage (dans le conteneur de la passerelle, DATABASE_URL de l'environnement) :
 *   cd services/gateway
 *   bunx tsx scripts/2026-11-01-purge-consumed-view-once-media.ts            # à sec
 *   APPLY=1 bunx tsx scripts/2026-11-01-purge-consumed-view-once-media.ts    # écrit
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { catchUpConsumedViewOnceMedia } from '../src/services/messaging/viewOnceMediaCatchUp';

const APPLY = process.env.APPLY === '1';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  console.log('Rattrapage des médias à vue unique lus par tous (#11269)');
  console.log(`  mode : ${APPLY ? 'ÉCRITURE (APPLY=1)' : 'À SEC'}`);
  try {
    const report = await catchUpConsumedViewOnceMedia(prisma, {
      now: new Date(),
      apply: APPLY,
      onFinding: (finding) =>
        console.log(`  ${finding.kind}  message=${finding.messageId}  conversation=${finding.conversationId}  pièces=${finding.attachments}`),
    });
    console.log('');
    console.log(`  vues uniques examinées              : ${report.scanned}`);
    console.log(`  lues par tous, purge non programmée : ${report.consumedUnscheduled}`);
    console.log(`  purgées, pièces restantes           : ${report.burnedWithMedia}`);
    console.log(`  pièces concernées                   : ${report.attachments}`);
    console.log(`  échéances réarmées                  : ${report.rearmed}`);
    if (!APPLY) console.log("\nÀ sec : rien n'a été écrit. Relancer avec APPLY=1 pour réarmer la purge.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du rattrapage :', error);
  process.exit(1);
});
