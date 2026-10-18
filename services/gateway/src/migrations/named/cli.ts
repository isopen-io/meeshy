import { MongoClient } from 'mongodb';
import { describeMongoshMigration, listMongoshMigrations, locateMongoshMigrations } from './mongosh';
import { NAMED_MIGRATIONS } from './registry';
import { runNamedMigration } from './runner';

/**
 * L'exécuteur des migrations nommées, DANS le conteneur passerelle (#10865) :
 *
 *   docker exec meeshy-gateway node dist/src/migrations/named/cli.js list
 *   docker exec meeshy-gateway node dist/src/migrations/named/cli.js <nom>           # à blanc
 *   docker exec meeshy-gateway node dist/src/migrations/named/cli.js <nom> --apply   # écrit
 *   node dist/src/migrations/named/cli.js verify-image                               # témoin du Dockerfile
 *
 * Il lit DATABASE_URL et les secrets de la passerelle dans SON environnement :
 * rien n'est recopié ni affiché. En production : feu vert du porteur et
 * sauvegarde vérifiée AVANT --apply.
 */

const USAGE = [
  'Usage :',
  '  node dist/src/migrations/named/cli.js list [--staging]',
  '  node dist/src/migrations/named/cli.js <nom>            (à blanc)',
  '  node dist/src/migrations/named/cli.js <nom> --apply    (écriture)',
  '  node dist/src/migrations/named/cli.js verify-image',
].join('\n');

function list(staging: boolean): void {
  const suffix = staging ? '-staging' : '';
  console.log('Migrations nommées (node, dans le conteneur passerelle) :');
  NAMED_MIGRATIONS.forEach((migration) => {
    console.log(`  ${migration.name} (${migration.issue}) — ${migration.summary}`);
    console.log(`    à blanc  : docker exec meeshy-gateway${suffix} node dist/src/migrations/named/cli.js ${migration.name}`);
    console.log(`    écriture : docker exec meeshy-gateway${suffix} node dist/src/migrations/named/cli.js ${migration.name} --apply`);
  });
  const directory = locateMongoshMigrations();
  if (!directory) {
    console.log('\nMigrations mongosh : répertoire introuvable.');
    return;
  }
  console.log(`\nMigrations mongosh (scripts embarqués, exécutés par le mongosh du conteneur base) :`);
  console.log(`  URI=$(docker exec meeshy-gateway${suffix} printenv DATABASE_URL)`);
  listMongoshMigrations(directory).forEach(({ file, mode }) =>
    describeMongoshMigration({
      file,
      mode,
      gateway: `meeshy-gateway${suffix}`,
      database: `meeshy-database${suffix}`,
    }).forEach((line) => console.log(`  ${line}`)),
  );
}

function verifyImage(): void {
  const directory = locateMongoshMigrations();
  const scripts = directory ? listMongoshMigrations(directory) : [];
  if (NAMED_MIGRATIONS.length === 0) throw new Error('aucune migration nommée enregistrée');
  if (scripts.length === 0) throw new Error('aucune migration mongosh embarquée (packages/shared/prisma/migrations)');
  console.log(`migrations embarquées : ${NAMED_MIGRATIONS.length} nommées, ${scripts.length} mongosh (${directory})`);
}

async function run(name: string, apply: boolean): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquante');
  const client = new MongoClient(url);
  try {
    await client.connect();
    await runNamedMigration({ name, apply, db: client.db(), env: process.env, log: (line) => console.log(line) });
  } finally {
    await client.close();
  }
}

async function main(argv: readonly string[]): Promise<void> {
  const [command, ...flags] = argv;
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    return;
  }
  if (command === 'list') return list(flags.includes('--staging'));
  if (command === 'verify-image') return verifyImage();
  const unknown = flags.filter((flag) => flag !== '--apply');
  if (unknown.length > 0) throw new Error(`option inconnue : ${unknown.join(' ')}\n${USAGE}`);
  await run(command, flags.includes('--apply'));
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error('Échec :', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export { main as runMigrationCli };
