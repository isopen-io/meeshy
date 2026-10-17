import type { Db } from 'mongodb';
import { readOnlyDb } from './read-only-db';
import { NAMED_MIGRATIONS } from './registry';
import type { MigrationEnv, NamedMigration } from './types';

export type RunNamedMigrationOptions = {
  readonly name: string;
  readonly apply: boolean;
  readonly db: Db;
  readonly env: MigrationEnv;
  readonly log: (line: string) => void;
  readonly migrations?: readonly NamedMigration[];
};

export function findNamedMigration(
  name: string,
  migrations: readonly NamedMigration[] = NAMED_MIGRATIONS,
): NamedMigration {
  const migration = migrations.find((candidate) => candidate.name === name);
  if (migration) return migration;
  const known = migrations.map((candidate) => candidate.name).join(', ');
  throw new Error(`Migration inconnue : ${name}. Disponibles : ${known}`);
}

/**
 * À blanc par défaut : sans `apply`, la migration reçoit une base qui refuse
 * toute écriture (`readOnlyDb`) EN PLUS de sa propre branche à blanc.
 */
export async function runNamedMigration(options: RunNamedMigrationOptions): Promise<void> {
  const migration = findNamedMigration(options.name, options.migrations);
  const dryRun = !options.apply;
  options.log(`${migration.name} (${migration.issue}) — ${migration.summary}`);
  options.log(`  mode : ${dryRun ? 'À BLANC (aucune écriture)' : 'ÉCRITURE (--apply)'}`);
  await migration.run({
    db: dryRun ? readOnlyDb(options.db) : options.db,
    dryRun,
    env: options.env,
    log: options.log,
  });
  if (dryRun) options.log("\nÀ blanc : rien n'a été écrit. Relancer avec --apply pour appliquer.");
}
