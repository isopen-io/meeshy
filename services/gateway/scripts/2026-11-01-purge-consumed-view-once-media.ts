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
 * ⚠ En autonomie sur staging (`OPS_ENVIRONMENT=staging`). Partout ailleurs —
 * environnement non déclaré compris —, `APPLY=1` est REFUSÉ sans
 * `BACKUP_VERIFIED=<identifiant>` : la sauvegarde VÉRIFIÉE de la base et du
 * stockage des médias (#9223), dont l'identifiant est journalisé. En
 * production, SEULEMENT après feu vert du porteur : ce qui est effacé ne
 * revient pas.
 *
 * Usage (dans le conteneur de la passerelle, DATABASE_URL de l'environnement) :
 *   cd services/gateway
 *   bunx tsx scripts/2026-11-01-purge-consumed-view-once-media.ts                                  # à sec
 *   APPLY=1 bunx tsx scripts/2026-11-01-purge-consumed-view-once-media.ts                          # écrit (staging)
 *   APPLY=1 BACKUP_VERIFIED=<id> bunx tsx scripts/2026-11-01-purge-consumed-view-once-media.ts     # écrit (production)
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { catchUpConsumedViewOnceMedia } from '../src/services/messaging/viewOnceMediaCatchUp';
import { viewOnceCatchUpWriteAdmission } from '../src/services/messaging/viewOnceMediaCatchUpAdmission';

const admission = viewOnceCatchUpWriteAdmission(process.env);
const APPLY = admission.kind === 'apply';

async function main(): Promise<void> {
  console.log('Rattrapage des médias à vue unique lus par tous (#11269)');
  if (admission.kind === 'refused') {
    console.error(`  REFUSÉ (environnement : ${admission.environment}) : ${admission.reason}`);
    process.exit(2);
  }
  console.log(`  mode : ${APPLY ? 'ÉCRITURE (APPLY=1)' : 'À SEC'}`);
  if (admission.kind === 'apply') {
    console.log(`  environnement : ${admission.environment}`);
    console.log(`  sauvegarde vérifiée : ${admission.backupVerified ?? 'non exigée (staging)'}`);
  }
  const prisma = new PrismaClient();
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
