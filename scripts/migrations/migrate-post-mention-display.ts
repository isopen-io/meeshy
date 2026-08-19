/**
 * `PostMention.source` → `PostMention.display`.
 *
 * `CONTENT` devient `INLINE`, `CANVAS` devient `PINNED`. Les lignes SANS champ
 * ne sont pas touchées : elles se lisent déjà INLINE (`readDisplay`), et les
 * réécrire coûterait une passe complète pour un résultat identique.
 *
 * Piège Prisma-Mongo : `{ source: null }` ne matche PAS un document où la clé
 * est absente. On cible donc `isSet: true`, seul prédicat qui distingue « champ
 * présent » de « champ jamais écrit ».
 *
 * Usage : npx tsx scripts/migrations/migrate-post-mention-display.ts [--dry-run]
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const MAPPING = [
  { from: 'CONTENT', to: 'INLINE' },
  { from: 'CANVAS', to: 'PINNED' },
] as const;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();

  try {
    for (const { from, to } of MAPPING) {
      const matched = await prisma.postMention.count({
        where: { source: { isSet: true, equals: from } } as never,
      });

      if (dryRun) {
        console.log(`[dry-run] ${from} → ${to} : ${matched} ligne(s)`);
        continue;
      }

      const result = await prisma.$runCommandRaw({
        update: 'PostMention',
        updates: [{
          q: { source: from },
          u: { $set: { display: to }, $unset: { source: '' } },
          multi: true,
        }],
      });
      console.log(`${from} → ${to} : ${matched} ligne(s) attendues, résultat`, result);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[migrate-post-mention-display] échec', error);
  process.exit(1);
});
