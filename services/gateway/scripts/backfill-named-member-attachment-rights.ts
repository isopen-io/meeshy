/**
 * Rattrapage des droits de pièce jointe d'un membre NOMMÉ (#6080).
 *
 * Trois portes de création écrivaient une table née fermée sur
 * `canSendVideos`/`canSendAudios` ; depuis #5151, un droit de type
 * explicitement `false` REFUSE la pièce jointe correspondante. Les portes sont
 * corrigées, mais une table n'est pas rétroactive : ce script rouvre les lignes
 * `Participant` déjà écrites.
 *
 * Il ne rouvre QUE les lignes dont la table porte la SIGNATURE EXACTE de la
 * table héritée, sans session anonyme ni `shareLinkId` : une restriction posée
 * par un hôte, et les droits qu'un LIEN de partage impose à ses visiteurs, ne
 * sont jamais effacés. `canViewHistory` est préservé tel que la ligne le porte.
 *
 * FAÇADE MINCE : la logique vit dans
 * `services/conversations/namedMemberRightsBackfill.ts`, pour que le script ne
 * dérive pas de ce qu'il est censé appliquer.
 *
 * Sans écriture par défaut : `--apply` est OBLIGATOIRE pour corriger.
 *
 * ⚠ Lancé depuis un poste de travail, `DATABASE_URL` cible la base LOCALE et le
 * script affichera « succès » sans avoir touché la production — celle-ci
 * n'expose aucun port. À exécuter DANS le conteneur du gateway.
 *
 * Usage:
 *   cd services/gateway
 *   bunx tsx scripts/backfill-named-member-attachment-rights.ts            # à blanc
 *   bunx tsx scripts/backfill-named-member-attachment-rights.ts --apply    # écrit
 *   bunx tsx scripts/backfill-named-member-attachment-rights.ts --verbose  # détaille
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { backfillNamedMemberAttachmentRights } from '../src/services/conversations/namedMemberRightsBackfill';

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  console.log('Rattrapage des droits de pièce jointe — membres nommés (#6080)');
  console.log(`  mode : ${APPLY ? 'ÉCRITURE (--apply)' : 'À BLANC (défaut)'}`);
  console.log('');

  try {
    const report = await backfillNamedMemberAttachmentRights(prisma, {
      apply: APPLY,
      onReopen: VERBOSE
        ? ({ participantId, conversationId }) => console.log(`  ${participantId}  (conversation ${conversationId})`)
        : undefined,
    });

    console.log('');
    console.log(`  examinés (table fermée) : ${report.scanned}`);
    console.log(`  reconnus « nés fermés » : ${report.reopenable}`);
    console.log(`  écartés (restriction, lien, anonyme) : ${report.scanned - report.reopenable}`);
    console.log(`  réécrits                : ${report.reopened}`);
    console.log('');

    if (!APPLY) {
      console.log("À blanc : rien n'a été écrit. Relancer avec --apply.");
      return;
    }
    console.log(`✓ ${report.reopened} participant(s) rouvert(s) — vidéo, vocal et document repartent.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du rattrapage :', error);
  process.exitCode = 1;
});
