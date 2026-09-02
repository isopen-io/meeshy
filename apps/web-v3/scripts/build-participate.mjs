#!/usr/bin/env node
// LE MODULE DE PARTICIPATION, COMPILÉ — conception § 12.4.
//
//   cd apps/web-v3 && node scripts/build-participate.mjs          # → .rt/participate.js
//   node scripts/build-participate.mjs --mesure                    # + écrit budgets-mesures.json → participate
//
// `lib/realtime/participate.ts` est écrit en TypeScript strict et n'est JAMAIS
// importé par `app/` : il devient UN module ES de navigateur, minifié, que
// `app/__v3/rt/[nom]/route.ts` sert sous un nom haché (`lib/actifs-rt.ts`).
// La compilation se fait par `bun build` — bun est le gestionnaire de paquets
// de la CI et de l'image (`Dockerfile`) — AVANT `next build`, pour que
// `outputFileTracingIncludes` trouve le fichier à tracer.
//
// Ce script est le seul producteur de `.rt/`, et le seul à MESURER le poids du
// module : un chiffre qu'on n'a pas mesuré ne s'invente pas (§ 12.6), et le
// mesurer ici est ce qui le rend rejouable en une ligne.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');
const SOURCE = join(RACINE, 'lib', 'realtime', 'participate.ts');
const DOSSIER = join(RACINE, '.rt');
const SORTIE = join(DOSSIER, 'participate.js');
const SOCKET = join(RACINE, 'node_modules', 'socket.io-client', 'dist', 'socket.io.esm.min.js');
const MESURES = join(RACINE, 'budgets-mesures.json');

const gzip = (chemin) => gzipSync(readFileSync(chemin), { level: 9 }).length;

export const compile = () => {
  mkdirSync(DOSSIER, { recursive: true });
  execFileSync(
    'bun',
    ['build', SOURCE, '--format=esm', '--target=browser', '--minify', `--outfile=${SORTIE}`],
    { cwd: RACINE, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  if (!existsSync(SORTIE)) throw new Error(`bun build n'a pas produit ${SORTIE}`);
  return {
    participate: { brut: readFileSync(SORTIE).length, gzip: gzip(SORTIE) },
    socket: existsSync(SOCKET) ? { brut: readFileSync(SOCKET).length, gzip: gzip(SOCKET) } : null,
  };
};

const ecrisLaMesure = (poids) => {
  const mesures = JSON.parse(readFileSync(MESURES, 'utf8'));
  mesures.participate = {
    quoi:
      'Le poids du module de participation (lib/realtime/participate.ts compilé par bun build, servi sous /__v3/rt/participate.<hash>.js) et de socket.io-client tel que servi (socket.io.esm.min.js, sous /__v3/rt/socket.io.<hash>.js). Tous deux arrivent APRÈS le premier pixel de /chats/:cle et /chat/:lien (§ 12.4) : ils n’entrent ni dans requetes_avant_premier_pixel ni dans le JS de page.',
    participate_brut_octets: poids.participate.brut,
    participate_gzip_9_octets: poids.participate.gzip,
    socket_io_client_brut_octets: poids.socket?.brut ?? null,
    socket_io_client_gzip_9_octets: poids.socket?.gzip ?? null,
    commande: 'cd apps/web-v3 && node scripts/build-participate.mjs --mesure',
    date: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(MESURES, `${JSON.stringify(mesures, null, 1)}\n`);
};

const main = () => {
  const poids = compile();
  process.stdout.write(
    `participate.js : ${poids.participate.brut} o bruts, ${poids.participate.gzip} o gzip -9` +
      (poids.socket === null ? '' : ` · socket.io.esm.min.js : ${poids.socket.brut} o bruts, ${poids.socket.gzip} o gzip -9`) +
      '\n',
  );
  if (process.argv.includes('--mesure')) ecrisLaMesure(poids);
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) main();
