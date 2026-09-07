#!/usr/bin/env node
/**
 * LE GATE DE POIDS de la v4 — l'heritier direct de check-bundle-budget.mjs de
 * la v3, porte du manifeste Next au manifeste Vite.
 *
 * Il mesure ce que le lecteur TELECHARGE AVANT LE PREMIER PIXEL, pas la somme
 * du repertoire : seuls comptent le document, sa feuille et les modules que le
 * document reference lui-meme. Un chunk d'ecran charge a la demande ne se
 * compte pas ici — c'est tout l'interet de l'avoir sorti du socle.
 *
 * Usage :
 *   node scripts/mesure-poids.mjs [--dist <chemin>] [--json] [--ratchet]
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');

const args = process.argv.slice(2);
const valeurDe = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
};
const dist = join(RACINE, valeurDe('--dist', 'dist'));
const enJson = args.includes('--json');
const ratchet = args.includes('--ratchet');

const CHEMIN_BUDGETS = join(RACINE, 'budgets.json');
const CHEMIN_MESURES = join(RACINE, 'budgets-mesures.json');

if (!existsSync(dist)) {
  console.error(`Rien a mesurer : ${dist} n'existe pas. Lancer d'abord \`bun run build\`.`);
  process.exit(1);
}

const gz = (chemin) => gzipSync(readFileSync(chemin), { level: 9 }).length;
const ko = (octets) => Math.round((octets / 1024) * 100) / 100;

/**
 * Ce que le DOCUMENT reference — la seule definition honnete de « avant le
 * premier pixel ». On lit l'index produit plutot que le manifeste : c'est ce
 * que le navigateur lit, lui aussi.
 */
const index = readFileSync(join(dist, 'index.html'), 'utf8');
const referencesDuDocument = [
  ...index.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g),
]
  /**
   * La base de construction change la FORME des chemins : « /assets/x.js » en
   * web, « ./assets/x.js » sous Capacitor (base relative). Sans cette
   * normalisation, les chunks critiques ne se retrouvaient pas dans
   * l'inventaire du repertoire et se comptaient une SECONDE fois comme
   * « a la demande » — un chiffre faux dans le sens rassurant.
   */
  .map((m) => m[1].replace(/^\.?\//, ''));

const critiques = referencesDuDocument
  .filter((f) => existsSync(join(dist, f)))
  .map((f) => ({ fichier: f, gzip: gz(join(dist, f)) }));

const documentGzip = gzipSync(Buffer.from(index), { level: 9 }).length;

// Tout le reste du repertoire : les ecrans a la demande.
const tousLesActifs = [];
const parcourt = (rep, prefixe = '') => {
  for (const entree of readdirSync(rep, { withFileTypes: true })) {
    const chemin = join(rep, entree.name);
    const relatif = prefixe ? `${prefixe}/${entree.name}` : entree.name;
    if (entree.isDirectory()) parcourt(chemin, relatif);
    else if (/\.(js|css)$/.test(entree.name)) tousLesActifs.push({ fichier: relatif, gzip: gz(chemin) });
  }
};
parcourt(dist);

const nomsCritiques = new Set(critiques.map((c) => c.fichier));
const aLaDemande = tousLesActifs.filter((a) => !nomsCritiques.has(a.fichier));

const jsCritique = critiques.filter((c) => c.fichier.endsWith('.js')).reduce((s, c) => s + c.gzip, 0);
const cssCritique = critiques.filter((c) => c.fichier.endsWith('.css')).reduce((s, c) => s + c.gzip, 0);
const premierePeinture = documentGzip + jsCritique + cssCritique;

const budgets = JSON.parse(readFileSync(CHEMIN_BUDGETS, 'utf8'));
const profil = budgets.reseau.profil;
/** Le temps de TELECHARGEMENT seul, hors latence — un plancher, jamais un LCP. */
const secondes = (octets) => Math.round(((octets * 8) / profil.download_bps) * 100) / 100;

const mesure = {
  runtime: process.env.MEESHY_RUNTIME === 'react' ? 'react' : 'preact',
  cible: process.env.MEESHY_CIBLE === 'capacitor' ? 'capacitor' : 'web',
  document_gzip_9_octets: documentGzip,
  js_critique_gzip_9_octets: jsCritique,
  css_critique_gzip_9_octets: cssCritique,
  premiere_peinture_gzip_9_octets: premierePeinture,
  premiere_peinture_ko: ko(premierePeinture),
  requetes_avant_premier_pixel: 1 + critiques.length,
  telechargement_3g_s: secondes(premierePeinture),
  a_la_demande_gzip_9_octets: aLaDemande.reduce((s, a) => s + a.gzip, 0),
  detail_critique: Object.fromEntries(critiques.map((c) => [c.fichier, c.gzip])),
};

if (enJson) {
  console.log(JSON.stringify(mesure, null, 2));
} else {
  console.log(`\n  runtime ${mesure.runtime} · cible ${mesure.cible}\n`);
  for (const c of critiques) console.log(`  ${String(ko(c.gzip)).padStart(8)} Ko  ${c.fichier}`);
  console.log(`  ${String(ko(documentGzip)).padStart(8)} Ko  index.html`);
  console.log(`  ${'-'.repeat(48)}`);
  console.log(`  ${String(mesure.premiere_peinture_ko).padStart(8)} Ko  AVANT LE PREMIER PIXEL`);
  console.log(`  ${String(mesure.requetes_avant_premier_pixel).padStart(8)}     requetes`);
  console.log(`  ${String(mesure.telechargement_3g_s).padStart(8)} s   de telechargement seul sur ${profil.nom}`);
  console.log(`  ${String(ko(mesure.a_la_demande_gzip_9_octets)).padStart(8)} Ko  a la demande (hors premiere peinture)\n`);
}

const plafond = budgets.premiere_peinture?.ko?.valeur;
let rc = 0;
if (typeof plafond === 'number') {
  if (mesure.premiere_peinture_ko > plafond) {
    console.error(
      `\n  DEPASSEMENT : ${mesure.premiere_peinture_ko} Ko > plafond ${plafond} Ko` +
        ` (budgets.json › premiere_peinture.ko)\n`,
    );
    rc = 1;
  }
}

if (ratchet) {
  const mesures = existsSync(CHEMIN_MESURES) ? JSON.parse(readFileSync(CHEMIN_MESURES, 'utf8')) : {};
  mesures.date = new Date().toISOString().slice(0, 10);
  mesures.variantes = mesures.variantes ?? {};
  mesures.variantes[`${mesure.runtime}-${mesure.cible}`] = mesure;
  writeFileSync(CHEMIN_MESURES, `${JSON.stringify(mesures, null, 2)}\n`);
  console.log(`  releve inscrit dans budgets-mesures.json › variantes.${mesure.runtime}-${mesure.cible}\n`);
}

process.exit(rc);
