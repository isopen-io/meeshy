import type { Db } from 'mongodb';

export type MigrationEnv = Readonly<Record<string, string | undefined>>;

export type NamedMigrationContext = {
  readonly db: Db;
  readonly dryRun: boolean;
  readonly env: MigrationEnv;
  readonly log: (line: string) => void;
};

/**
 * Une migration nommée de la passerelle, exécutable DANS son image (#10865) :
 * `node dist/src/migrations/named/cli.js <name> [--apply]`.
 */
export type NamedMigration = {
  readonly name: string;
  readonly issue: string;
  readonly summary: string;
  run(context: NamedMigrationContext): Promise<void>;
};
