/**
 * Re-scellement des clés d'API LLM de l'agent (`AgentLlmConfig.apiKeyEncrypted`
 * et `fallbackApiKeyEncrypted`) écrites en clair avant le chiffrement au repos.
 *
 * FAÇADE MINCE : la logique vit dans
 * `src/services/admin/agent-llm-secret-reseal.ts`, partagée avec la route
 * admin, pour que le script ne dérive pas de ce que la route écrit.
 *
 * - À BLANC par défaut : n'affiche que des NOMBRES de lignes, jamais une valeur ;
 * - `--apply` est OBLIGATOIRE pour écrire ;
 * - idempotent : une valeur déjà scellée (`v1:`) n'est jamais retouchée ;
 * - refuse de tourner sans `SECRETS_AT_REST_KEY` valide.
 *
 * ⚠ Lancé depuis un poste de travail, `DATABASE_URL` cible la base LOCALE.
 * À exécuter DANS le conteneur du gateway, avec la même `SECRETS_AT_REST_KEY`
 * que le service.
 *
 * Usage:
 *   cd services/gateway
 *   bunx tsx scripts/reseal-agent-llm-secrets.ts             # à blanc
 *   bunx tsx scripts/reseal-agent-llm-secrets.ts --apply     # écrit
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { resealAgentLlmSecrets } from '../src/services/admin/agent-llm-secret-reseal';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  console.log('Re-scellement AgentLlmConfig (clés d\'API LLM)');
  console.log(`  mode : ${APPLY ? 'ÉCRITURE (--apply)' : 'À BLANC (défaut)'}`);

  try {
    const report = await resealAgentLlmSecrets(prisma as never, { apply: APPLY });
    console.log(`  lignes parcourues   : ${report.scanned}`);
    console.log(`  lignes à re-sceller : ${report.rowsToReseal}`);
    console.log(`  lignes re-scellées  : ${report.resealed}`);
    if (!APPLY && report.rowsToReseal > 0) {
      console.log('  relancer avec --apply pour écrire.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Le nom et le message seulement : jamais l'objet entier (il pourrait porter une valeur).
  const message = error instanceof Error ? `${error.name}: ${error.message}` : 'erreur inconnue';
  console.error(`Échec : ${message}`);
  process.exit(1);
});
