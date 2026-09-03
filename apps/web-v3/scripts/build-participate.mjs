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
// DEUX modules, pas un — et la raison est un POIDS mesuré, pas un goût
// d'architecture. `participate.js` pèse 26 173 o gzip (budgets-mesures.json) :
// c'est le prix du fil — composeur, réserve, plein écran, réactions, peinture
// de bulles. La LISTE n'a besoin d'aucun d'eux, et le lui faire télécharger
// après son premier pixel coûterait plus d'une seconde sur la 3G rurale du
// § 12.6, pour du code qu'elle n'exécute jamais. Le socle qu'ils PARTAGENT —
// socket.io-client — reste un seul actif, à une seule adresse, donc mis en
// cache une seule fois pour les deux écrans.
const SOURCES = [
  { base: 'participate', chemin: join(RACINE, 'lib', 'realtime', 'participate.ts') },
  { base: 'liste', chemin: join(RACINE, 'lib', 'realtime', 'liste.ts') },
];
const DOSSIER = join(RACINE, '.rt');
const SOCKET = join(RACINE, 'node_modules', 'socket.io-client', 'dist', 'socket.io.esm.min.js');
const MESURES = join(RACINE, 'budgets-mesures.json');

const gzip = (chemin) => gzipSync(readFileSync(chemin), { level: 9 }).length;

const compileUn = ({ base, chemin }) => {
  const sortie = join(DOSSIER, `${base}.js`);
  execFileSync(
    'bun',
    ['build', chemin, '--format=esm', '--target=browser', '--minify', `--outfile=${sortie}`],
    { cwd: RACINE, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  if (!existsSync(sortie)) throw new Error(`bun build n'a pas produit ${sortie}`);
  return { brut: readFileSync(sortie).length, gzip: gzip(sortie) };
};

export const compile = () => {
  mkdirSync(DOSSIER, { recursive: true });
  const modules = Object.fromEntries(SOURCES.map((source) => [source.base, compileUn(source)]));
  return {
    ...modules,
    socket: existsSync(SOCKET) ? { brut: readFileSync(SOCKET).length, gzip: gzip(SOCKET) } : null,
  };
};

const ecrisLaMesure = (poids) => {
  const mesures = JSON.parse(readFileSync(MESURES, 'utf8'));
  mesures.participate = {
    quoi:
      'Le poids des DEUX modules de participation (lib/realtime/participate.ts pour le fil, lib/realtime/liste.ts pour /chats, compilés par bun build et servis sous /__v3/rt/<base>.<hash>.js) et de socket.io-client tel que servi (socket.io.esm.min.js, sous /__v3/rt/socket.io.<hash>.js). Tous arrivent APRÈS le premier pixel de /chats, /chats/:cle et /chat/:lien (§ 12.4) : ils n’entrent ni dans requetes_avant_premier_pixel ni dans le JS de page. Un écran ne télécharge QUE son module — la liste ne paie pas le fil.',
    participate_brut_octets: poids.participate.brut,
    participate_gzip_9_octets: poids.participate.gzip,
    liste_brut_octets: poids.liste.brut,
    liste_gzip_9_octets: poids.liste.gzip,
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
    SOURCES.map(({ base }) => `${base}.js : ${poids[base].brut} o bruts, ${poids[base].gzip} o gzip -9`).join(' · ') +
      (poids.socket === null ? '' : ` · socket.io.esm.min.js : ${poids.socket.brut} o bruts, ${poids.socket.gzip} o gzip -9`) +
      '\n',
  );
  if (process.argv.includes('--mesure')) ecrisLaMesure(poids);
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) main();
