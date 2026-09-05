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
// NEUF modules, pas un — et la raison est un POIDS mesuré, pas un goût
// d'architecture. `participate.js` pèse 26 173 o gzip (budgets-mesures.json) :
// c'est le prix du fil — composeur, réserve, plein écran, réactions, peinture
// de bulles. La LISTE n'a besoin d'aucun d'eux, et le FIL SOCIAL (#5031)
// n'a besoin ni d'eux ni d'un socket — aimer et reposter sont des allers
// simples (`lib/realtime/feed.ts`) — et les lui faire télécharger après leur
// premier pixel coûterait sur la 3G rurale du § 12.6, pour du code qu'ils
// n'exécutent jamais. Les NOTIFICATIONS (#4898) n'ont ni composeur ni gestes
// de ligne : leur module écoute, peint, et intercepte « Tout lire » — rien
// d'autre. La GALERIE (`plein`, `/chats/:cle/medias`, #4525) n'a NI l'un ni
// l'autre NI de socket : elle n'a besoin que d'Échap sur sa surimpression, un
// seul appel à `prendsLePleinEcran()` — le lui faire payer via `participate.js`
// aurait été le défaut même que ces huit autres modules existent pour éviter.
// Le socle que `participate` et `liste` PARTAGENT — socket.io-client — reste
// UN actif, à UNE adresse ; `feed` et `plein` ne l'importent pas du tout.
const SOURCES = [
  { base: 'participate', chemin: join(RACINE, 'lib', 'realtime', 'participate.ts') },
  { base: 'liste', chemin: join(RACINE, 'lib', 'realtime', 'liste.ts') },
  { base: 'feed', chemin: join(RACINE, 'lib', 'realtime', 'feed.ts') },
  { base: 'notifs', chemin: join(RACINE, 'lib', 'realtime', 'notifs.ts') },
  { base: 'contacts', chemin: join(RACINE, 'lib', 'realtime', 'contacts.ts') },
  { base: 'recherche', chemin: join(RACINE, 'lib', 'realtime', 'recherche.ts') },
  { base: 'liens', chemin: join(RACINE, 'lib', 'realtime', 'liens.ts') },
  { base: 'commentaires', chemin: join(RACINE, 'lib', 'realtime', 'commentaires.ts') },
  { base: 'plein', chemin: join(RACINE, 'lib', 'realtime', 'plein.ts') },
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
      'Le poids des NEUF modules de participation (lib/realtime/participate.ts pour le fil, lib/realtime/liste.ts pour /chats, lib/realtime/feed.ts pour /feed [#5031], lib/realtime/notifs.ts pour /notifications [#4898], lib/realtime/contacts.ts pour /contacts [#4921], lib/realtime/recherche.ts pour /search [#4897], lib/realtime/liens.ts pour /links [#5090], lib/realtime/commentaires.ts pour /post/:id [#5091], lib/realtime/plein.ts pour /chats/:cle/medias [#4525], compilés par bun build et servis sous /__v3/rt/<base>.<hash>.js) et de socket.io-client tel que servi (socket.io.esm.min.js, sous /__v3/rt/socket.io.<hash>.js — feed.js ne l’importe pas). Tous arrivent APRÈS le premier pixel de /chats, /chats/:cle, /chat/:lien et /feed (§ 12.4) : ils n’entrent ni dans requetes_avant_premier_pixel ni dans le JS de page. Un écran ne télécharge QUE son module — la liste ne paie pas le fil, le fil social ne paie ni l’un ni l’autre.',
    participate_brut_octets: poids.participate.brut,
    participate_gzip_9_octets: poids.participate.gzip,
    liste_brut_octets: poids.liste.brut,
    liste_gzip_9_octets: poids.liste.gzip,
    feed_brut_octets: poids.feed.brut,
    feed_gzip_9_octets: poids.feed.gzip,
    notifs_brut_octets: poids.notifs.brut,
    notifs_gzip_9_octets: poids.notifs.gzip,
    contacts_brut_octets: poids.contacts.brut,
    contacts_gzip_9_octets: poids.contacts.gzip,
    recherche_brut_octets: poids.recherche.brut,
    recherche_gzip_9_octets: poids.recherche.gzip,
    liens_brut_octets: poids.liens.brut,
    liens_gzip_9_octets: poids.liens.gzip,
    commentaires_brut_octets: poids.commentaires.brut,
    commentaires_gzip_9_octets: poids.commentaires.gzip,
    plein_brut_octets: poids.plein.brut,
    plein_gzip_9_octets: poids.plein.gzip,
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
