import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Les migrations `.mongodb.js` de `packages/shared/prisma/migrations` sont des
 * scripts MONGOSH (globals `db`, `printjson`, appels synchrones) : node ne
 * les exécute pas. L'image passerelle les EMBARQUE (étage `runner`, copie de
 * `packages/shared`), et le `mongosh` du conteneur base les exécute — sans
 * copie par scp ni dépôt sur l'hôte (#10865).
 */
export const MONGOSH_MIGRATIONS_IN_IMAGE = '/app/packages/shared/prisma/migrations';

export type MongoshMode = 'apply-to-write' | 'dry-run-to-simulate' | 'writes-only';

export function mongoshMode(source: string): MongoshMode {
  if (/\bAPPLY\b/.test(source)) return 'apply-to-write';
  if (/\bDRY_RUN\b/.test(source)) return 'dry-run-to-simulate';
  return 'writes-only';
}

const MODE_LABEL: Readonly<Record<MongoshMode, string>> = {
  'apply-to-write': 'à blanc par défaut, APPLY=1 pour écrire',
  'dry-run-to-simulate': 'ÉCRIT par défaut, DRY_RUN=1 pour simuler',
  'writes-only': 'ÉCRIT, aucun mode à blanc',
};

const ENV_FOR: Readonly<Record<MongoshMode, { readonly dry: string | null; readonly write: string }>> = {
  'apply-to-write': { dry: '', write: '-e APPLY=1 ' },
  'dry-run-to-simulate': { dry: '-e DRY_RUN=1 ', write: '' },
  'writes-only': { dry: null, write: '' },
};

export type MongoshMigrationDescription = {
  readonly file: string;
  readonly mode: MongoshMode;
  readonly gateway: string;
  readonly database: string;
};

export function describeMongoshMigration(description: MongoshMigrationDescription): readonly string[] {
  const { file, mode, gateway, database } = description;
  const command = (env: string) =>
    `docker exec ${gateway} cat ${MONGOSH_MIGRATIONS_IN_IMAGE}/${file} | docker exec -i ${env}${database} mongosh "$URI" --quiet`;
  const { dry, write } = ENV_FOR[mode];
  return [
    `${file} — ${MODE_LABEL[mode]}`,
    `  à blanc  : ${dry === null ? '(aucun)' : command(dry)}`,
    `  écriture : ${command(write)}`,
  ];
}

export function locateMongoshMigrations(from: string = __dirname): string | undefined {
  const candidates = [
    path.resolve(from, '../../../../packages/shared/prisma/migrations'),
    path.resolve(from, '../../../../../packages/shared/prisma/migrations'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

export type MongoshMigrationFile = { readonly file: string; readonly mode: MongoshMode };

export function listMongoshMigrations(directory: string): readonly MongoshMigrationFile[] {
  return readdirSync(directory)
    .filter((file) => file.endsWith('.mongodb.js'))
    .sort()
    .map((file) => ({ file, mode: mongoshMode(readFileSync(path.join(directory, file), 'utf8')) }));
}
