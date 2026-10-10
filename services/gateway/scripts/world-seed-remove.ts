/**
 * Retrait du seed World Wide (#10000) — le retour arrière DOCUMENTÉ.
 *
 * Retirer le code ne retire pas les lignes : ce script s'en charge, à blanc
 * par défaut (`--apply` est OBLIGATOIRE pour écrire).
 *
 *   --close  (défaut)  ferme le lien `mshy_world` et désactive la conversation
 *                      `world` : la landing n'offre plus d'entrée, plus
 *                      personne n'entre. RÉVERSIBLE, rien n'est supprimé.
 *   --purge            supprime le lien, les participations et la conversation
 *                      — REFUSÉ dès qu'un message existe : effacer ce que des
 *                      personnes ont écrit est une purge de données de
 *                      production, qui ne passe pas par ce script.
 *
 * Avant tout retrait, couper le seed (`WORLD_SEED_ENABLED` absent ou ≠ true),
 * sans quoi un `--purge` serait refait au démarrage suivant.
 *
 * FAÇADE MINCE : la logique vit dans `src/services/world/worldSeedOperations.ts`.
 *
 * ⚠ NE JAMAIS exécuter contre la production sans le feu vert du porteur et une
 * sauvegarde vérifiée (CLAUDE.md racine, #9223). Exécuter DANS le conteneur du
 * gateway : lancé d'un poste, `DATABASE_URL` vise la base LOCALE.
 *
 * Usage:
 *   cd services/gateway
 *   bunx tsx scripts/world-seed-remove.ts                    # à blanc, mode close
 *   bunx tsx scripts/world-seed-remove.ts --close --apply    # ferme
 *   bunx tsx scripts/world-seed-remove.ts --purge --apply    # supprime (sans message seulement)
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { removeWorldSeed } from '../src/services/world/worldSeedOperations';

const APPLY = process.argv.includes('--apply');
const MODE = process.argv.includes('--purge') ? 'purge' : 'close';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    console.log('Retrait du seed World Wide (#10000)');
    console.log(`  mode : ${MODE} — ${APPLY ? 'ÉCRITURE (--apply)' : 'À BLANC (défaut)'}`);

    const report = await removeWorldSeed(prisma, { mode: MODE, apply: APPLY });

    console.log(`  conversation "world" : ${report.conversation}`);
    console.log(`  messages             : ${report.messages}`);
    console.log(`  participations       : ${report.participants}`);
    console.log(`  liens de partage     : ${report.shareLinks}`);
    console.log(`  issue                : ${report.outcome}`);

    if (report.outcome === 'refused-has-messages') {
      console.log('✗ Purge refusée : World Wide porte des messages. Utiliser --close, ou instruire une purge de données avec le porteur.');
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du retrait :', error);
  process.exitCode = 1;
});
