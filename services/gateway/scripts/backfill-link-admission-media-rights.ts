/**
 * Rattrapage des droits vidéo/audio d'un ENTRANT PAR LIEN — anonyme ou nommé
 * (#6091).
 *
 * `link-admission.ts` inventait `canSendVideos: false, canSendAudios: false`
 * sur les deux portes d'entrée par lien, sans jamais consulter le lien de
 * partage : ni `allowAnonymousFiles` (une vidéo EST un fichier), ni le droit
 * d'écrire dans la conversation (dont la voix suit le sort). Les deux portes
 * sont corrigées ; une table n'est pas rétroactive : ce script rouvre les
 * lignes `Participant` déjà écrites — seulement ce que les drapeaux du lien
 * impliquent, jamais plus. `canSendFiles`/`canSendImages` ne sont jamais
 * touchés : ce sont des choix explicites de l'hôte.
 *
 * FAÇADE MINCE : la logique vit dans
 * `services/conversations/linkAdmissionMediaRightsBackfill.ts`, pour que le
 * script ne dérive pas de ce qu'il est censé appliquer.
 *
 * Sans écriture par défaut : `--apply` est OBLIGATOIRE pour corriger.
 *
 * ⚠ NE JAMAIS exécuter contre la production ni le staging sans l'accord
 * explicite du porteur — même à blanc, même en lecture seule (#6091). Lancé
 * depuis un poste de travail, `DATABASE_URL` cible la base LOCALE et le
 * script affichera « succès » sans avoir touché la production — celle-ci
 * n'expose aucun port. À exécuter DANS le conteneur du gateway, sur accord.
 *
 * Usage:
 *   cd services/gateway
 *   bunx tsx scripts/backfill-link-admission-media-rights.ts            # à blanc
 *   bunx tsx scripts/backfill-link-admission-media-rights.ts --apply    # écrit
 *   bunx tsx scripts/backfill-link-admission-media-rights.ts --verbose  # détaille
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { backfillLinkAdmissionMediaRights } from '../src/services/conversations/linkAdmissionMediaRightsBackfill';

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  console.log('Rattrapage des droits vidéo/audio — entrées par lien (#6091)');
  console.log(`  mode : ${APPLY ? 'ÉCRITURE (--apply)' : 'À BLANC (défaut)'}`);
  console.log('');

  try {
    const report = await backfillLinkAdmissionMediaRights(prisma, {
      apply: APPLY,
      onReopen: VERBOSE
        ? ({ participantId, shareLinkId }) => console.log(`  ${participantId}  (lien ${shareLinkId})`)
        : undefined,
    });

    console.log('');
    console.log(`  examinés (candidats)      : ${report.scanned}`);
    console.log(`  à ouvrir                  : ${report.reopenable}`);
    console.log(`  réécrits                  : ${report.reopened}`);
    console.log(`  dont canSendVideos        : ${report.byRight.canSendVideos}`);
    console.log(`  dont canSendAudios        : ${report.byRight.canSendAudios}`);
    console.log('  par lien :');
    const liens = Object.entries(report.byLink);
    if (liens.length === 0) console.log('    (aucun)');
    for (const [linkId, count] of liens) {
      console.log(`    ${linkId} : ${count}`);
    }
    console.log('');

    if (!APPLY) {
      console.log("À blanc : rien n'a été écrit. Relancer avec --apply.");
      return;
    }
    console.log(`✓ ${report.reopened} participant(s) rouvert(s) — vidéo et/ou voix repart(ent).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du rattrapage :', error);
  process.exitCode = 1;
});
