/**
 * Réconciliation de `Sound.usageCount` depuis `SoundUsage`.
 *
 * `usageCount` trie la découverte : une dérive fait remonter ou disparaître un
 * son de la liste publique sans qu'aucune erreur ne soit visible. Trois chemins
 * l'écrivent (capture, édition, purge) ; la source de vérité, elle, est unique
 * — le nombre de lignes `SoundUsage`. Ce script réaligne le compteur dessus.
 *
 * Depuis le lot A, les purges RECOMPTENT au lieu de décrémenter : la dérive ne
 * devrait plus se créer. Ce script rattrape l'existant et vérifie l'invariant
 * après un incident.
 *
 * FAÇADE MINCE : toute la logique vit dans `SoundCaptureService`, pour que le
 * script ne dérive pas du service qu'il est censé auditer.
 *
 * Sans écriture par défaut : `--apply` est OBLIGATOIRE pour corriger.
 *
 * Usage:
 *   cd services/gateway
 *   bunx tsx scripts/reconcile-sound-usage.ts             # à blanc
 *   bunx tsx scripts/reconcile-sound-usage.ts --apply     # corrige
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { SoundCaptureService } from '../src/services/posts/SoundCaptureService';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  console.log('Réconciliation usageCount ← SoundUsage');
  console.log(`  mode : ${APPLY ? 'ÉCRITURE (--apply)' : 'À BLANC (défaut)'}`);
  console.log('');

  try {
    const result = await new SoundCaptureService(prisma).reconcileUsageCounts({
      apply: APPLY,
      onDrift: ({ soundId, from, to }) => console.log(`  dérive  ${soundId}  ${from} → ${to}`),
    });

    console.log('');
    console.log(`examinés  : ${result.examined}`);
    console.log(`en dérive : ${result.drifted}`);
    console.log(`corrigés  : ${result.fixed}`);
    if (!APPLY && result.drifted > 0) {
      console.log('');
      console.log('Aucune écriture : relancer avec --apply après lecture de ce résultat.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
