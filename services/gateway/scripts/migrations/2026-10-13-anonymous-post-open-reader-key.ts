/**
 * Migration nommée 2026-10-13-anonymous-post-open-reader-key (#10483) — FAÇADE de développement.
 *
 * La migration vit dans `src/migrations/named/` et s'exécute DANS l'image de
 * la passerelle (#10865) :
 *   docker exec meeshy-gateway[-staging] node dist/src/migrations/named/cli.js 2026-10-13-anonymous-post-open-reader-key           # à blanc
 *   docker exec meeshy-gateway[-staging] node dist/src/migrations/named/cli.js 2026-10-13-anonymous-post-open-reader-key --apply   # écrit
 *
 * Depuis le dépôt (rétrocompatible : DRY_RUN=1 simule, sans lui elle écrit) :
 *   cd services/gateway
 *   DRY_RUN=1 bunx tsx scripts/migrations/2026-10-13-anonymous-post-open-reader-key.ts
 *
 * En production : feu vert du porteur et sauvegarde vérifiée AVANT d'écrire.
 */
import { runMigrationCli } from '../../src/migrations/named/cli';

const flags = process.env.DRY_RUN === '1' ? [] : ['--apply'];

runMigrationCli(['2026-10-13-anonymous-post-open-reader-key', ...flags]).catch((error: unknown) => {
  console.error('Échec de la migration :', error instanceof Error ? error.message : error);
  process.exit(1);
});
