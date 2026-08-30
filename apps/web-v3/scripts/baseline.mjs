#!/usr/bin/env node
/**
 * La LIGNE DE BASE « AVANT » : ce que la production actuelle (`apps/web`)
 * coute aujourd'hui, ecran par ecran (§ 8.2 mesure n° 3).
 *
 *   node scripts/baseline.mjs [--sortie e2e/visual/baseline.json] [url ...]
 *   node scripts/baseline.mjs --verifier e2e/visual/baseline.json
 *
 * Elle est mesuree par le MEME instrument que la v3 (`lib/poids-reseau.mjs`) :
 * une ligne de base pesee a une autre balance ne compare rien.
 *
 * La loi du fichier, verifiee par `--verifier` et par son temoin :
 *   statut « mesure »   ⇒ des nombres ET une date de mesure ET un code HTTP
 *                         SERVI (2xx/3xx) ET les conditions de la mesure ;
 *   tout autre statut   ⇒ tous les champs a `null` ET une raison ecrite.
 * Un chiffre invente dans un point de COMPARAISON est pire qu'un chiffre
 * absent : il fabrique un progres ou une regression qui n'ont jamais eu lieu.
 *
 * Un 404 pese des octets, peint un premier pixel et rend un LCP : la FORME de
 * ses chiffres est irreprochable. C'est pourquoi `--verifier` ne peut pas se
 * contenter de la forme — il exige le code HTTP, et refuse un « mesure » pose
 * sur une page d'erreur. Une ligne de base batie sur des pages d'erreur
 * montrerait un progres spectaculaire le jour ou la v3 sert de vraies pages.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  agregerReseau,
  cheminChromium,
  collecter,
  ouvrirNavigateur,
  p75DeMesures,
  PROFILS_RESEAU,
} from './lib/poids-reseau.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const ZONE = join(ICI, '..');
const args = process.argv.slice(2);
const arg = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : defaut;
};

const profilReseau = arg('--reseau', '3g-fast');
const tirages = Math.max(1, Number(arg('--tirages', '3')) || 1);

const CHAMPS_MESURES = [
  'octets_total',
  'requetes_total',
  'requetes_avant_premier_pixel',
  'premier_pixel_ms',
  'lcp_ms',
  'cls',
];

/**
 * Les quatre ecrans du role premier cites au § 8.2, sur la production. Les
 * identifiants entre chevrons sont a completer par qui lance la mesure : une
 * URL qui en porte n'est PAS mesurable, et le script le dit au lieu de mesurer
 * une 404. L'accueil, lui, n'a besoin d'aucun identifiant — c'est le point de
 * comparaison qu'une session peut toujours tenter.
 */
const ECRANS_PAR_DEFAUT = [
  { id: 'accueil', url: 'https://meeshy.me/' },
  { id: 'linkRedirect', url: 'https://meeshy.me/l/<token>' },
  { id: 'story', url: 'https://meeshy.me/story/<id>' },
  { id: 'reel', url: 'https://meeshy.me/reel/<id>' },
  { id: 'post', url: 'https://meeshy.me/post/<id>' },
];

const commandeDe = (url) => `node apps/web-v3/scripts/baseline.mjs ${url}`;

/** Une reponse qui n'est pas une page : 4xx, 5xx, ou un code qu'on ne sait pas lire. */
const estPageServie = (code) => typeof code === 'number' && code >= 200 && code < 400;

const vide = (ecran, raison) => ({
  ...ecran,
  commande: commandeDe(ecran.url),
  statut: 'a-etablir',
  raison,
  statut_http: null,
  conditions: null,
  ...Object.fromEntries(CHAMPS_MESURES.map((c) => [c, null])),
});

export function verifier(baseline) {
  const fautes = [];
  const mesureLe = typeof baseline.mesure_le === 'string' && baseline.mesure_le !== '';

  for (const ecran of baseline.ecrans ?? []) {
    const ou = ecran.id ?? ecran.url ?? '?';
    if (typeof ecran.commande !== 'string' || ecran.commande.trim() === '') {
      fautes.push(`${ou} : commande absente — un chiffre sans sa commande est un chiffre sans preuve`);
    }

    if (ecran.statut === 'mesure') {
      if (!mesureLe) fautes.push(`${ou} : statut « mesure » sans mesure_le au niveau du fichier`);
      for (const champ of CHAMPS_MESURES) {
        if (typeof ecran[champ] !== 'number') {
          fautes.push(`${ou} : statut « mesure » mais ${champ} n'est pas un nombre`);
        }
      }
      if (typeof ecran.statut_http !== 'number') {
        fautes.push(
          `${ou} : statut « mesure » sans statut_http — on ne sait pas si ces octets sont ceux d'un ecran ou d'une page d'erreur`,
        );
      } else if (!estPageServie(ecran.statut_http)) {
        fautes.push(
          `${ou} : statut « mesure » sur une page en erreur (HTTP ${ecran.statut_http}) — une page d'erreur pese, peint et rend un LCP ; ses chiffres ne sont pas ceux de l'ecran`,
        );
      }
      if (typeof ecran.conditions?.reseau !== 'string' || typeof ecran.conditions?.tirages !== 'number') {
        fautes.push(
          `${ou} : statut « mesure » sans conditions (reseau, tirages) — une mesure qui ne dit pas a quelle balance elle a ete pesee ne se compare a rien`,
        );
      }
      continue;
    }

    if (typeof ecran.raison !== 'string' || ecran.raison.trim() === '') {
      fautes.push(`${ou} : statut « ${ecran.statut} » sans raison ecrite`);
    }
    for (const champ of CHAMPS_MESURES) {
      if (ecran[champ] !== null) {
        fautes.push(
          `${ou} : ${champ} porte une valeur alors que l'ecran n'est pas mesure — aucun chiffre ne s'invente`,
        );
      }
    }
  }

  return fautes;
}

const aVerifier = arg('--verifier', null);
if (aVerifier) {
  const fichier = resolve(aVerifier);
  if (!existsSync(fichier)) {
    process.stderr.write(`[baseline] introuvable : ${fichier}\n`);
    process.exit(2);
  }
  const fautes = verifier(JSON.parse(readFileSync(fichier, 'utf8')));
  if (fautes.length) {
    process.stderr.write('[baseline] ECHEC — la ligne de base porte des valeurs non prouvees :\n');
    for (const f of fautes) process.stderr.write(`  - ${f}\n`);
    process.exit(1);
  }
  process.stdout.write('[baseline] OK — chaque chiffre a sa commande, chaque trou a sa raison.\n');
  process.exit(0);
}

const sortie = resolve(arg('--sortie', join(ZONE, 'e2e', 'visual', 'baseline.json')));
const urls = args.filter((a) => a.startsWith('http'));
const ecrans = urls.length
  ? urls.map((url) => ({ id: new URL(url).pathname.split('/').filter(Boolean)[0] ?? 'accueil', url }))
  : ECRANS_PAR_DEFAUT;

const mesurables = ecrans.filter((e) => !e.url.includes('<'));

let navigateur = null;
if (mesurables.length && cheminChromium()) {
  try {
    navigateur = await ouvrirNavigateur();
  } catch (erreur) {
    process.stderr.write(`[baseline] navigateur indisponible — ${erreur.message}\n`);
  }
} else if (mesurables.length) {
  process.stderr.write(
    `[baseline] aucun Chromium sous ${process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'} — les ecrans resteront « a etablir ».\n`,
  );
}

const mesurer = async (ecran) => {
  if (ecran.url.includes('<')) {
    return vide(
      ecran,
      "URL a completer : l'identifiant reel (token, id) n'a pas ete fourni a la commande — sans lui, la mesure porterait sur une 404",
    );
  }
  if (!navigateur) {
    return vide(ecran, `aucun navigateur disponible pour mesurer ${ecran.url}`);
  }

  /**
   * Un contexte NEUF par tirage : deux tirages dans le meme contexte
   * partageraient le cache HTTP, et le second ne pesera plus ce qu'un visiteur
   * telecharge. Le p75 porterait alors sur une grandeur qui n'existe pas.
   */
  const tirer = async () => {
    const contexte = await navigateur.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
    });
    const page = await contexte.newPage();
    try {
      return await collecter({ page, url: ecran.url, reseau: profilReseau });
    } finally {
      await contexte.close();
    }
  };

  try {
    const lot = [];
    for (let tirage = 0; tirage < tirages; tirage += 1) {
      const journal = await tirer();
      lot.push({
        journal,
        mesure: agregerReseau({
          url: ecran.url,
          evenements: journal.evenements,
          premierPixelMs: journal.premier_pixel_ms,
          lcpMs: journal.lcp_ms,
          cls: journal.cls,
          statutHttp: journal.statut_http,
          reseau: journal.reseau,
        }),
      });
    }

    /**
     * Le refus qui manquait : une 404 pese, peint et rend un LCP. Ses chiffres
     * ont la FORME d'une mesure et n'en sont pas une — les retenir mettrait
     * dans le point de comparaison le cout d'une page d'erreur, et fabriquerait
     * un « progres » le jour ou la v3 sert la vraie page.
     */
    const enErreur = lot.find(({ journal }) => !estPageServie(journal.statut_http));
    if (enErreur) {
      return vide(
        ecran,
        `page en erreur (HTTP ${enErreur.journal.statut_http}) — ses octets sont ceux d'une page d'erreur, pas ceux de l'ecran`,
      );
    }

    const mesure = p75DeMesures(lot.map((t) => t.mesure));
    if (CHAMPS_MESURES.some((c) => typeof mesure[c] !== 'number')) {
      return vide(
        ecran,
        `page atteinte (HTTP ${lot[0].journal.statut_http}) mais une metrique manque — mesure incomplete, donc non retenue`,
      );
    }
    return {
      ...ecran,
      commande: commandeDe(ecran.url),
      statut: 'mesure',
      statut_http: lot[0].journal.statut_http,
      conditions: { reseau: profilReseau, tirages, rang: 'p75' },
      ...Object.fromEntries(CHAMPS_MESURES.map((c) => [c, mesure[c]])),
    };
  } catch (erreur) {
    return vide(ecran, String(erreur.message).split('\n')[0].slice(0, 300));
  }
};

const mesures = [];
for (const ecran of ecrans) mesures.push(await mesurer(ecran));
if (navigateur) await navigateur.close();

const aucuneMesure = mesures.every((m) => m.statut !== 'mesure');
const baseline = {
  _loi: "statut « mesure » ⇒ des nombres et une date ; tout autre statut ⇒ tous les champs a null et une raison. Verifiable : node apps/web-v3/scripts/baseline.mjs --verifier apps/web-v3/e2e/visual/baseline.json",
  cible: 'https://meeshy.me — apps/web (zone legacy) en production, telle que servie a la date ci-dessous',
  genere_par: `node apps/web-v3/scripts/baseline.mjs${urls.length ? ` ${urls.join(' ')}` : ''}`,
  genere_le: new Date().toISOString(),
  mesure_le: aucuneMesure ? null : new Date().toISOString(),
  statut: aucuneMesure ? 'a-etablir' : 'partielle',
  a_completer: mesures
    .filter((m) => m.statut !== 'mesure')
    .map((m) => `${m.id} : ${m.raison} — rejouer « ${m.commande} » depuis une machine qui atteint la cible, avec un identifiant reel`),
  instrument: {
    fichier: 'scripts/lib/poids-reseau.mjs',
    methode:
      'Chromium (Playwright) en 390x844 dSF 3 ; octets = CDP Network.loadingFinished.encodedDataLength ; FCP/LCP/CLS = PerformanceObserver de la page ; « requetes avant le premier pixel » = requetes ACHEVEES avant le FCP (une requete pendante ou echouee n\'a pas de fin et n\'y entre pas)',
    conditions: {
      reseau: profilReseau,
      tirages,
      rang: 'p75',
      bridage:
        PROFILS_RESEAU[profilReseau]?.bride === true
          ? `CDP Network.emulateNetworkConditions, profil « ${profilReseau} » (scripts/lib/poids-reseau.mjs, PROFILS_RESEAU)`
          : 'AUCUN — les plafonds de temps du § 8.3 sont ecrits pour « 3G Fast simule, p75 » et ne se comparent pas a cette mesure',
    },
  },
  ecrans: mesures,
};

mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, `${JSON.stringify(baseline, null, 2)}\n`);

for (const m of mesures) {
  process.stdout.write(
    `[baseline] ${m.id.padEnd(14)} ${m.statut === 'mesure' ? `${(m.octets_total / 1024).toFixed(1)} Ko, LCP ${Math.round(m.lcp_ms)} ms, ${m.requetes_avant_premier_pixel} req avant 1er pixel` : `a etablir — ${m.raison}`}\n`,
  );
}
process.stdout.write(`[baseline] ecrit : ${sortie}\n`);
