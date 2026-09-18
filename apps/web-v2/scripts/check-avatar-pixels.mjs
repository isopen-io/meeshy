#!/usr/bin/env node
/**
 * VÉRIFIE QU'UNE PHOTO DE PROFIL EST **PEINTE**, PAS SEULEMENT PASSÉE (#6975).
 *
 * TOUS les gates d'avatar de cette application mesuraient autre chose : la
 * GÉOMÉTRIE (`check-curve.mjs:199,206,264` — l'anneau, la police des
 * initiales, la pastille à 45°), la CLAIRE-VOIE (`check-floating-clearance
 * .mjs:199-270`), la forme du héros de communauté
 * (`check-communities.mjs:316`) ou la pastille de PRÉSENCE
 * (`avatar.test.tsx:26-45`). **Aucun ne demandait « une photo est-elle
 * peinte ? »** — et c'est exactement pour ça que dix-sept surfaces, dont la
 * liste des conversations, chaque message et chaque en-tête de fil, montaient
 * `Avatar` SANS `src` sans qu'aucun verdict ne rougisse. Une photo absente
 * ressemble trait pour trait à un compte sans photo.
 *
 * ┌─ POURQUOI DES PIXELS ET PAS UNE SOURCE ─────────────────────────────────┐
 * │ Un témoin qui vérifie qu'un `src` est PASSÉ verdit sur une image jamais │
 * │ chargée : URL mal résolue, route absente, `onError` qui masque l'`<img>`│
 * │ — trois défauts RÉELS du dépôt (#5668, #5805, #6388), tous invisibles à │
 * │ un test de source. `naturalWidth > 0` est la seule mesure qui distingue │
 * │ « la photo est là » de « on a demandé la photo ».                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ET IL ATTEND LA **PEINTURE**, PAS `load`. `img.decode()` ne résout que
 * lorsque l'image est prête à être peinte ; `complete` et l'événement `load`
 * de la page se satisfont tous deux d'une image dont les octets sont arrivés
 * mais que le décodeur refuse (le cas mesuré de `MEDIA_BROKEN_IMAGE_DATA_URI`,
 * `fixtures-media.ts:62`). C'est la leçon « un témoin de PIXELS attend la
 * PEINTURE, pas `complete` ».
 *
 * IL PORTE AUSSI SON PROPRE CONTRE-TÉMOIN. Une surface SANS photo doit
 * peindre ses initiales et AUCUNE `<img>` : sans cette moitié, le gate serait
 * indiscernable d'un gate qui affiche une image partout, y compris là où il
 * n'y en a pas (un `<img src="">` parasite, le défaut que la normalisation des
 * chaînes blanches de `resolveParticipantAvatar` ferme).
 *
 * LES TROIS RANGS SONT MESURÉS SÉPARÉMENT, et c'est le cœur du gate :
 *
 *   rang 1  `Participant.avatar`        — `c-amina` (pair : Amina)
 *   rang 2  `Participant.user.avatar`   — `c-nouvelle` (pair : Fatou)
 *   repli   `Conversation.avatar`       — `c-deploiement` (un groupe)
 *   AUCUN   ni l'un ni l'autre          — `c-annonces` (groupe sans photo)
 *
 * **Le rang 2 est celui qui compte.** Au rang 1, la boucle naïve
 * (`participant.avatar` seul) et la loi juste
 * (`resolveParticipantAvatar` = local, puis compte) rendent le MÊME verdict :
 * un témoin écrit là ne peut pas tomber (leçon 261 — un témoin de RANG
 * s'écrit sur un rang AUTRE que le premier). Le rang 2 est de plus le cas
 * NOMINAL : personne ne pose d'avatar par conversation, donc toute photo
 * réelle vient du compte.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { INSTANT } from './lib/instant.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  const p = normalize(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  for (const f of [join(DIST, p), join(DIST, `${p}.html`), join(DIST, p, 'index.html'), join(DIST, 'index.html')]) {
    try {
      if (!(await stat(f)).isFile()) continue;
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
      res.end(await readFile(f));
      return;
    } catch {
      /* candidat suivant */
    }
  }
  res.writeHead(404).end('404');
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

const failures = [];
const constate = (ok, what) => {
  if (!ok) failures.push(what);
};

/**
 * LA LARGEUR INTRINSÈQUE ATTENDUE — **EXTRAITE** de la fixture, jamais
 * recopiée. Le gate n'affirme pas « il y a une image » mais « c'est CETTE
 * image » : une largeur codée en dur ici se désaccorderait en silence du jour
 * où le corpus change de cote, et le gate mesurerait alors une image qu'il ne
 * reconnaît plus — vert par hasard, ou rouge sans cause. Même dispositif que
 * `check-curve.mjs`, qui lit ses constantes amont dans le TypeScript plutôt
 * que de les redéclarer.
 */
const FIXTURES = new URL('../src/lib/api/fixtures-base.ts', import.meta.url).pathname;
const PORTRAIT_WIDTH = (() => {
  const source = readFileSync(FIXTURES, 'utf8');
  const bloc = source.slice(source.indexOf('export const portraitStandIn'));
  const cote = /width="(\d+)"/u.exec(bloc);
  if (cote === null) {
    console.error(
      "check-avatar-pixels: ROUGE — `portraitStandIn` (`fixtures-base.ts`) ne déclare plus de `width` sur son <svg> : sans taille INTRINSÈQUE, `naturalWidth` n'est pas déterministe et ce gate ne peut plus rien mesurer.",
    );
    process.exit(1);
  }
  return Number(cote[1]);
})();

/**
 * LA MESURE, ÉCRITE UNE FOIS — pour chaque racine d'avatar sous `root`, ce que
 * le navigateur a vraiment peint.
 *
 * `decode()` d'abord, sur CHAQUE `<img>` de la sous-arborescence : c'est lui
 * qui fait la différence entre « les octets sont arrivés » et « le décodeur
 * accepte de peindre ». Un échec n'est pas une panne du gate — il laisse
 * `naturalWidth` à 0, ce que la mesure rapporte.
 *
 * `hidden` — une `<img>` que `onError` a masquée (`avatar.tsx`,
 * `style.display = 'none'`) n'est PAS une photo servie, même si ses octets
 * sont là. La compter verdirait sur exactement le défaut que #6388 a corrigé.
 */
const peintures = async (page, root) =>
  page.evaluate(async (selector) => {
    const hote = document.querySelector(selector);
    if (hote === null) return null;
    const racines = [...hote.querySelectorAll('.avatar-root')];
    await Promise.all(
      racines.flatMap((r) => [...r.querySelectorAll('img')]).map((img) => img.decode().then(() => null, () => null)),
    );
    return racines.map((racine) => {
      const img = racine.querySelector('img');
      return {
        aUneImg: img !== null,
        largeurNaturelle: img === null ? 0 : img.naturalWidth,
        masquee: img === null ? false : getComputedStyle(img).display === 'none',
        initiales: (racine.textContent ?? '').trim(),
      };
    });
  }, root);

/** « CETTE surface peint une photo » — le verdict, pas la source. */
const peintUnePhoto = (mesures) =>
  mesures !== null && mesures.some((m) => m.aUneImg && !m.masquee && m.largeurNaturelle === PORTRAIT_WIDTH);

const ouvre = async (chemin) => {
  const page = await context.newPage();
  await page.clock.setFixedTime(INSTANT);
  await page.goto(`${BASE}${chemin}`, { waitUntil: 'load' });
  return page;
};

// ─────────────────────────────────── 1. LA LISTE DES CONVERSATIONS (le premier écran)
const liste = await ouvre('/');
await liste.waitForSelector('[data-row]');
await liste.waitForTimeout(400);

const RANGS = [
  { row: 'c-amina', rang: 'rang 1 — `Participant.avatar` (avatar LOCAL du pair)' },
  { row: 'c-nouvelle', rang: 'rang 2 — `Participant.user.avatar` (photo du COMPTE du pair)' },
  { row: 'c-deploiement', rang: 'repli — `Conversation.avatar` (un groupe porte la sienne)' },
];

for (const { row, rang } of RANGS) {
  const mesures = await peintures(liste, `[data-row="${row}"]`);
  constate(mesures !== null, `la rangée « ${row} » est introuvable dans la Lentille`);
  constate(
    mesures === null || mesures.length > 0,
    `la rangée « ${row} » ne monte AUCUN avatar (.avatar-root absent)`,
  );
  constate(
    peintUnePhoto(mesures),
    `LISTE DES CONVERSATIONS — aucune photo PEINTE sur « ${row} » (${rang}) : ${JSON.stringify(mesures)}`,
  );
}

/**
 * LE CONTRE-TÉMOIN — `c-annonces` est un salon PUBLIC (donc un groupe du point
 * de vue de la vue, `isGroup`) SANS `Conversation.avatar` : il n'a aucune
 * photo à servir et doit peindre ses initiales seules. Sans cette assertion,
 * le gate ne distinguerait pas une résolution juste d'un `<img>` posé partout.
 */
const annonces = await peintures(liste, '[data-row="c-annonces"]');
constate(annonces !== null && annonces.length > 0, 'la rangée « c-annonces » est introuvable dans la Lentille');
constate(
  annonces === null || annonces.every((m) => !m.aUneImg),
  `LISTE DES CONVERSATIONS — « c-annonces » n'a aucune photo à servir et monte pourtant une <img> : ${JSON.stringify(annonces)}`,
);
constate(
  annonces === null || annonces.every((m) => m.initiales !== ''),
  `LISTE DES CONVERSATIONS — « c-annonces » ne peint même pas ses initiales : ${JSON.stringify(annonces)}`,
);

/**
 * LE RAIL DES STORIES — même écran, autre surface. Une seule autrice du corpus
 * porte une photo (`u-camille`) ; les autres n'en ont pas, donc l'assertion
 * porte sur « AU MOINS une tuile peint », jamais sur « toutes ».
 */
const rail = await peintures(liste, '[data-rail="grande"]');
constate(rail !== null && rail.length > 0, 'le grand rail des stories ne monte aucun avatar');
constate(
  peintUnePhoto(rail),
  `RAIL DES STORIES — aucune tuile ne peint la photo de son autrice : ${JSON.stringify(rail)}`,
);

/**
 * MA PASTILLE DU RAIL — `Viewer.avatar` (`lib/api/viewer.ts`) avait été ajouté
 * POUR elle, son doc-comment le dit, et `StoryRailSelfEntry` n'avait aucun
 * champ pour le porter : la valeur mourait dans le type. Ce témoin est la
 * preuve, en pixels, que la chaîne session → loi → tuile est enfin continue.
 */
const moi = await peintures(liste, '[data-story-self]');
constate(moi !== null && moi.length > 0, 'la pastille « moi » du rail est introuvable');
constate(
  peintUnePhoto(moi),
  `MA PASTILLE DU RAIL — \`Viewer.avatar\` est servi et aucune photo n'est peinte : ${JSON.stringify(moi)}`,
);

/**
 * CE QUE CE GATE NE PEUT **PAS** MESURER, ET POURQUOI — le DISQUE DE PROFIL
 * (`floating-menus.tsx`). Son avatar n'apparaît que si
 * `session.status === 'authenticated'` ; en mode FIXTURES l'application n'a
 * aucune session (mesuré : `aria-label="Menu, 3 unread notifications"`, un
 * glyphe, aucun `.avatar-root`), donc le disque rend le glyphe de repli. Le
 * brancher est source-prouvé (`session.user.avatar`, déjà lu pour le nom) mais
 * PIXEL-prouvable seulement contre un compte réel. Le dire ici plutôt que
 * d'asserter au hasard : un gate qui interroge une surface absente sort vert
 * par OMISSION.
 */

// ─────────────────────────────────── 2. LE FIL (en-tête + rangées de message)
const fil = await ouvre('/c/c-deploiement');
await fil.waitForSelector('[data-message]');
await fil.waitForTimeout(400);

const entete = await peintures(fil, 'header');
constate(entete !== null && entete.length > 0, 'l’en-tête du fil ne monte aucun avatar');
constate(
  peintUnePhoto(entete),
  `EN-TÊTE DE CONVERSATION — aucune photo peinte alors que « c-deploiement » porte la sienne : ${JSON.stringify(entete)}`,
);

/**
 * LES RANGÉES DE MESSAGE — `m1` est d'Amina (rang 1), `m4` de Kwame (rang 2).
 * Une rangée de CONTINUATION ne monte aucun avatar : la mesure porte sur la
 * rangée de TÊTE de chaque groupe, celle qui en monte un.
 */
const EXPEDITEURS = [
  { message: 'm1', qui: 'Amina', rang: 'rang 1 — `Participant.avatar`' },
  { message: 'm4', qui: 'Kwame', rang: 'rang 2 — `Participant.user.avatar`' },
];

for (const { message, qui, rang } of EXPEDITEURS) {
  const mesures = await peintures(fil, `[data-message="${message}"]`);
  constate(mesures !== null, `la rangée du message « ${message} » (${qui}) est introuvable dans le fil`);
  constate(
    peintUnePhoto(mesures),
    `RANGÉE DE MESSAGE — aucune photo peinte pour ${qui} sur « ${message} » (${rang}) : ${JSON.stringify(mesures)}`,
  );
}

await browser.close();
server.close();

if (failures.length > 0) {
  console.error('check-avatar-pixels: ROUGE');
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log('check-avatar-pixels: vert — les trois rangs de la photo sont PEINTS, et une surface sans photo n’en peint aucune.');
