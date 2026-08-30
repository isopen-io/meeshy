#!/usr/bin/env node
// Poids RÉSEAU et Web Vitals d'une page, mesurés par CDP [L-0.5] — conception § 8.2 (2),
// et COMPARÉS aux seuils du § 8.3 / § 8.5 portés par `budgets.json`.
//
//   node apps/web-v3/scripts/mesure-reseau.mjs http://127.0.0.1:3300/stories/abc [autre-url…]
//   node apps/web-v3/scripts/mesure-reseau.mjs --json --repetitions 5 http://127.0.0.1:3300/
//   node apps/web-v3/scripts/mesure-reseau.mjs --sans-emulation <url…>   # réseau local, non opposable
//
// POURQUOI CDP, ET PAS `content-length`
//
// `compare-rendu.js` additionne les en-têtes `content-length`, et retombe sur la
// longueur du corps DÉCOMPRESSÉ quand l'en-tête manque — ce que fait un serveur
// en `Transfer-Encoding: chunked`, c'est-à-dire Next en développement. Le chiffre
// obtenu n'est alors pas ce qui a traversé le réseau : il le sur-estime d'un
// facteur 3 à 4 sur du JS. `Network.loadingFinished.encodedDataLength` est, lui,
// le nombre d'octets réellement reçus, en-têtes compris.
//
// POURQUOI « REQUÊTES AVANT LE PREMIER PIXEL » ET PAS « REQUÊTES »
//
// Le budget du § 8.3 compte les requêtes AVANT le premier pixel utile — un
// beacon, une police décorative ou une image sous la ligne de flottaison partis
// APRÈS ne coûtent rien au visiteur qui regarde. Le compte se fait donc contre
// l'horloge du FCP, et le DOCUMENT lui-même est ajouté : il ne figure pas dans
// `performance.getEntriesByType('resource')`.
//
// POURQUOI « REQUÊTES PENDANTES », UNE SOUSTRACTION
//
// Le § 8.3 pose un GATE nommément neuf sur la lecture partagée : « 0 connexion
// serveur tenue après le premier pixel (aucune requête pending) ». Ses deux
// termes étaient déjà collectés — les requêtes ÉMISES et celles qui se sont
// TERMINÉES — et il ne manquait que la soustraction pour livrer le gate.
//
// POURQUOI UN PROFIL 3G ET UN p75, ET PAS UNE EXÉCUTION
//
// Le § 8.3 exprime le premier pixel utile en « 3G Fast simulé, p75 ». Un LCP
// mesuré une fois, en réseau local, ne s'oppose donc à AUCUN plafond de la
// conception : le chiffre est vrai et hors sujet. La mesure applique le profil
// que `budgets.json` déclare (`Network.emulateNetworkConditions`) et répète
// l'exécution pour rendre un percentile. `--sans-emulation` reste possible, et
// la sortie DIT alors que ses chiffres ne sont opposables à rien.
//
// CE QU'IL NE FAIT JAMAIS
//
// Rendre zéro pour une page qu'il n'a pas pu joindre. Une mesure absente sort en
// statut « à établir » avec sa raison, et TOUTES ses valeurs à `null` — un zéro
// se compare, un `null` se voit.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { plusPrecis } from './lib/motifs.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');
const require_ = createRequire(import.meta.url);

const CHAMPS_NULS = {
  http: null,
  octets_transferes: null,
  requetes: null,
  requetes_avant_premier_pixel: null,
  requetes_pendantes: null,
  octets_par_type: null,
  fcp_ms: null,
  lcp_ms: null,
  cls: null,
  duree_ms: null,
};

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

export const raisonLisible = (erreur) =>
  String(erreur && erreur.message ? erreur.message : erreur)
    .replace(ANSI, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

export const octetsTransferes = (chargements) =>
  chargements.reduce((somme, c) => somme + (c.encodedDataLength || 0), 0);

export const octetsParType = (reponses, chargements) => {
  const type = new Map(reponses.map((r) => [r.requestId, r.type]));
  return chargements.reduce((table, c) => {
    const cle = type.get(c.requestId) || 'autre';
    const vu = table[cle] || { requetes: 0, octets: 0 };
    return { ...table, [cle]: { requetes: vu.requetes + 1, octets: vu.octets + (c.encodedDataLength || 0) } };
  }, {});
};

export const requetesAvantPremierPixel = (ressources, fcpMs) =>
  fcpMs === null || fcpMs === undefined
    ? null
    : ressources.filter((r) => r.startTime <= fcpMs).length + 1;

export const requetesPendantes = (emises, terminees) => Math.max(0, emises - terminees);

// UN CODE D'ERREUR N'EST PAS UNE MESURE. `page.goto` RÉUSSIT sur un 404 : le
// serveur a répondu, la page a peint, le CDP a compté des octets. Sans ce
// verrou, un identifiant de contenu mort — ou deviné faux — rendait `statut:
// 'mesuré'` sur une page d'erreur, et son poids devenait un chiffre commité
// contre lequel la v3 se serait comparée. Une réponse absente (`http: 0`, quand
// `page.goto` ne rend aucune réponse principale) tombe par la même porte.
export const estCodeDeMesure = (http) => typeof http === 'number' && http >= 200 && http < 400;

export const mesureIndisponible = ({ url, commande, raison }) => ({
  url,
  commande,
  statut: 'à établir',
  raison,
  ...CHAMPS_NULS,
});

const mesureChiffree = ({
  url,
  commande,
  http,
  dureeMs,
  requetesEmises,
  requetesTerminees,
  reponses,
  chargements,
  ressources,
  fcpMs,
  lcpMs,
  cls,
}) => ({
  url,
  commande,
  statut: 'mesuré',
  raison: null,
  http,
  octets_transferes: octetsTransferes(chargements),
  requetes: requetesEmises,
  requetes_avant_premier_pixel: requetesAvantPremierPixel(ressources, fcpMs),
  requetes_pendantes: requetesPendantes(requetesEmises, requetesTerminees ?? chargements.length),
  octets_par_type: octetsParType(reponses, chargements),
  fcp_ms: fcpMs ?? null,
  lcp_ms: lcpMs ?? null,
  cls: cls ?? null,
  duree_ms: dureeMs,
});

export const composeMesure = (args) =>
  estCodeDeMesure(args.http)
    ? mesureChiffree(args)
    : mesureIndisponible({
        url: args.url,
        commande: args.commande,
        raison: `HTTP ${args.http} — la page servie n'est pas le geste visé (identifiant mort, redirection perdue ou réponse absente) : un chiffre pris sur une page d'erreur est pire qu'un « à établir »`,
      });

const CHAMPS_AGREGES = [
  'octets_transferes',
  'requetes',
  'requetes_avant_premier_pixel',
  'requetes_pendantes',
  'fcp_ms',
  'lcp_ms',
  'cls',
  'duree_ms',
];

export const percentile = (valeurs, rang) => {
  const nombres = valeurs.filter((v) => typeof v === 'number');
  if (nombres.length === 0) return null;
  const tri = [...nombres].sort((a, b) => a - b);
  return tri[Math.min(tri.length - 1, Math.ceil((rang / 100) * tri.length) - 1)];
};

// Une exécution unique ne rend pas un p75. Un p75 ne rend pas non plus une table
// `octets_par_type` : on prend celle de l'exécution REPRÉSENTATIVE, celle dont
// les octets transférés valent le percentile retenu, pour que la ligne CSS
// comparée au § 8.5 vienne d'une exécution réelle et non d'une moyenne fabriquée.
export const agregeExecutions = ({ url, commande, executions, rang }) => {
  const echouee = executions.find((e) => e.statut !== 'mesuré');
  if (echouee || executions.length === 0) {
    return mesureIndisponible({
      url,
      commande,
      raison: echouee
        ? `${echouee.raison} (exécution ${executions.indexOf(echouee) + 1}/${executions.length})`
        : 'aucune exécution',
    });
  }

  const agreges = Object.fromEntries(
    CHAMPS_AGREGES.map((champ) => [champ, percentile(executions.map((e) => e[champ]), rang)]),
  );
  const representative =
    executions.find((e) => e.octets_transferes === agreges.octets_transferes) ?? executions[0];

  return {
    ...representative,
    ...agreges,
    executions: executions.length,
    percentile: rang,
  };
};

const VALEUR_MESUREE = {
  requetes_avant_premier_pixel: (m) => m.requetes_avant_premier_pixel,
  requetes_pendantes: (m) => m.requetes_pendantes,
  lcp_ms: (m) => m.lcp_ms,
  fcp_ms: (m) => m.fcp_ms,
  cls: (m) => m.cls,
  css_ko: (m) =>
    m.octets_par_type
      ? Math.round(((m.octets_par_type.Stylesheet?.octets ?? 0) / 1024) * 10) / 10
      : null,
};

export const cheminDe = (url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

export const plafondsDuChemin = (chemin, reseau) => {
  const regle = plusPrecis(reseau?.ecrans ?? [], () => chemin).choix;
  return { ...(reseau?.transverses ?? {}), ...(regle?.plafonds ?? {}) };
};

export const franchissementsReseau = (mesure, reseau) => {
  if (!reseau || mesure.statut !== 'mesuré') return [];
  return Object.entries(plafondsDuChemin(cheminDe(mesure.url), reseau)).flatMap(
    ([cle, plafond]) => {
      const lire = VALEUR_MESUREE[cle];
      if (!lire || !plafond || plafond.valeur === null || plafond.valeur === undefined) return [];
      const valeur = lire(mesure);
      if (valeur === null || valeur === undefined || valeur <= plafond.valeur) return [];
      return [
        {
          url: mesure.url,
          mesure: cle,
          statut: plafond.statut,
          texte: `${mesure.url} — ${cle} : ${valeur} > ${plafond.valeur} (${plafond.statut})`,
        },
      ];
    },
  );
};

export const composeVerdictReseau = (mesures, reseau) => {
  const franchissements = mesures.flatMap((m) => franchissementsReseau(m, reseau));
  const absentes = mesures.filter((m) => m.statut !== 'mesuré');
  return {
    mesures,
    depassements: franchissements.filter((f) => f.statut === 'GATE').map((f) => f.texte),
    avertissements: franchissements.filter((f) => f.statut !== 'GATE').map((f) => f.texte),
    non_mesurees: absentes.map((m) => `${m.url} — ${m.raison}`),
    rc: franchissements.some((f) => f.statut === 'GATE') || absentes.length > 0 ? 1 : 0,
  };
};

const VITALS = `() => new Promise((resolve) => {
  const lu = { fcp: null, lcp: null, cls: 0 };
  const observe = (type, sur) => { try { new PerformanceObserver(sur).observe({ type, buffered: true }); } catch { /* non supporté */ } };
  observe('paint', (l) => l.getEntries().forEach((e) => { if (e.name === 'first-contentful-paint') lu.fcp = e.startTime; }));
  observe('largest-contentful-paint', (l) => l.getEntries().forEach((e) => { lu.lcp = e.startTime; }));
  observe('layout-shift', (l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) lu.cls += e.value; }));
  setTimeout(() => resolve({
    fcp: lu.fcp === null ? null : Math.round(lu.fcp),
    lcp: lu.lcp === null ? null : Math.round(lu.lcp),
    cls: Math.round(lu.cls * 1000) / 1000,
    ressources: performance.getEntriesByType('resource').map((r) => ({ startTime: r.startTime })),
  }), 600);
})`;

export const mesurePage = async ({ url, commande, navigateur, viewport, timeoutMs, profil }) => {
  const contexte = await navigateur.newContext({
    viewport: viewport || { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await contexte.newPage();
  const cdp = await contexte.newCDPSession(page);
  const reponses = [];
  const chargements = [];
  const echecs = [];
  const emises = new Set();
  await cdp.send('Network.enable');
  if (profil) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profil.latence_ms,
      downloadThroughput: profil.download_bps,
      uploadThroughput: profil.upload_bps,
    });
  }
  cdp.on('Network.requestWillBeSent', (e) => emises.add(e.requestId));
  cdp.on('Network.responseReceived', (e) => reponses.push({ requestId: e.requestId, type: e.type }));
  cdp.on('Network.loadingFinished', (e) =>
    chargements.push({ requestId: e.requestId, encodedDataLength: e.encodedDataLength }),
  );
  cdp.on('Network.loadingFailed', (e) => echecs.push(e.requestId));

  try {
    const depart = Date.now();
    const reponse = await page.goto(url, { waitUntil: 'load', timeout: timeoutMs || 45000 });
    const vitals = await page.evaluate(`(${VITALS})()`);
    return composeMesure({
      url,
      commande,
      http: reponse ? reponse.status() : 0,
      dureeMs: Date.now() - depart,
      requetesEmises: emises.size,
      requetesTerminees: chargements.length + echecs.length,
      reponses,
      chargements,
      ressources: vitals.ressources,
      fcpMs: vitals.fcp,
      lcpMs: vitals.lcp,
      cls: vitals.cls,
    });
  } catch (erreur) {
    return mesureIndisponible({ url, commande, raison: raisonLisible(erreur) });
  } finally {
    await contexte.close();
  }
};

export const mesureUrls = async (urls, commandePour, options) => {
  const repetitions = options?.repetitions ?? 1;
  const rang = options?.rang ?? 75;
  const { chromiumPath, vendorRequire } = require_(join(ICI, '../../../scripts/lib/navigateur.cjs'));
  const { chromium } = vendorRequire('playwright-core');
  const navigateur = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  try {
    const mesures = [];
    for (const url of urls) {
      const commande = commandePour(url);
      const executions = [];
      for (let i = 0; i < repetitions; i += 1) {
        executions.push(
          await mesurePage({ url, commande, navigateur, profil: options?.profil }),
        );
      }
      mesures.push(
        repetitions === 1 ? executions[0] : agregeExecutions({ url, commande, executions, rang }),
      );
    }
    return mesures;
  } finally {
    await navigateur.close();
  }
};

// LE SITE UNIQUE DU PROFIL RÉSEAU. Le gate de la v3 et la ligne de base « AVANT »
// (`baseline.mjs`) doivent s'exécuter dans les MÊMES conditions, sans quoi leurs
// chiffres ne se comparent pas — § 9.2 : « la même mesure sert le gate de la v3
// ET la ligne de base ». Partager le module ne suffisait pas : ses conditions se
// lisent ici, une fois, et voyagent avec lui.
export const budgetsReseau = () => {
  const chemin = join(RACINE, 'budgets.json');
  return existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')).reseau : null;
};

export const profilReseau = () => budgetsReseau()?.profil ?? null;

const entier = (args, drapeau, defaut) => {
  const i = args.indexOf(drapeau);
  const valeur = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(valeur) && valeur > 0 ? Math.trunc(valeur) : defaut;
};

const main = async () => {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const urls = args.filter((a) => !a.startsWith('--') && /^https?:/.test(a));
  if (urls.length === 0) {
    process.stderr.write(
      'usage : node apps/web-v3/scripts/mesure-reseau.mjs [--json] [--repetitions N] [--sans-emulation] <url…>\n',
    );
    return 1;
  }

  const reseau = budgetsReseau();
  const profil = args.includes('--sans-emulation') ? null : reseau?.profil ?? null;
  const repetitions = entier(args, '--repetitions', profil ? (reseau?.profil?.repetitions ?? 1) : 1);
  const rang = reseau?.profil?.percentile ?? 75;

  const commandePour = (url) =>
    `node apps/web-v3/scripts/mesure-reseau.mjs --repetitions ${repetitions} ${url}`;
  const mesures = await mesureUrls(urls, commandePour, { repetitions, rang, profil }).catch((erreur) =>
    urls.map((url) => mesureIndisponible({ url, commande: commandePour(url), raison: raisonLisible(erreur) })),
  );

  const verdict = composeVerdictReseau(mesures, reseau);
  const sortie = {
    ...verdict,
    profil: profil ?? {
      nom: 'aucune émulation — chiffres NON opposables aux plafonds du § 8.3, exprimés en 3G Fast simulé, p75',
    },
    repetitions,
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(sortie, null, 1)}\n`);
    return verdict.rc;
  }

  mesures.forEach((m) =>
    process.stdout.write(
      m.statut === 'mesuré'
        ? `${m.url} — HTTP ${m.http} · ${Math.round(m.octets_transferes / 1024)} Ko · ${m.requetes} requêtes (${m.requetes_avant_premier_pixel} avant le premier pixel, ${m.requetes_pendantes} pendantes) · FCP ${m.fcp_ms} ms · LCP ${m.lcp_ms} ms · CLS ${m.cls}\n`
        : `${m.url} — à établir : ${m.raison}\n`,
    ),
  );
  verdict.avertissements.forEach((a) => process.stdout.write(`! CIBLE dépassée — ${a}\n`));
  verdict.depassements.forEach((d) => process.stdout.write(`✗ GATE dépassé — ${d}\n`));
  if (!profil) {
    process.stdout.write(
      '· sans émulation réseau : ces chiffres ne sont opposables à aucun plafond du § 8.3\n',
    );
  }
  return verdict.rc;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((rc) => process.exit(rc));
}
