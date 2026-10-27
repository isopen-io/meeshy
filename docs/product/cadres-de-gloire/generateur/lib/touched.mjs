// Les collections qu'une PR touche (#10277, prompt § 7 L2) : la garde d'empiètement ne re-mesure qu'elles, et tout le
// relevé quand un fichier COMMUN bouge ou que le diff manque. Est commun tout fichier du générateur qui ne désigne
// aucune collection (le moteur lib/, les poses mee/, les polices fonts/, la photo fixture/…) et tout fichier GLOBAL de
// la CI (scripts/ci-affected.mjs) : l'épingle de Playwright, donc Chromium dont l'antialiasing fait le verdict, vit
// dans .github/workflows/ci.yml.
// Usage : node lib/touched.mjs <réf de base>   → imprime « all », « none » quand la PR ne touche aucune collection,
//         ou les collections séparées par des virgules ; une sortie vide n'est jamais une sélection.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { couvre, GLOBAUX } from '../../../../../scripts/ci-affected.mjs';

const D = 'docs/product/cadres-de-gloire';
const GENERATOR = `${D}/generateur/`;

const collectionOf = (file, collections) => {
  const patterns = [
    new RegExp(`^${D}/generateur/ateliers/([^/]+)/`),
    new RegExp(`^${D}/manifests/([^/.]+)\\.json$`),
    new RegExp(`^${D}/controle/[a-z-]+?-([a-z]+)\\.json$`),
    /^packages\/shared\/design\/glory-frames\/([^/.]+)\.json$/,
  ];
  return patterns.map((re) => re.exec(file)?.[1]).find((name) => name !== undefined && collections.includes(name)) ?? null;
};

const isCommon = (file, collections) => couvre(GLOBAUX, file) || (file.startsWith(GENERATOR) && collectionOf(file, collections) === null);

export function touchedCollections(files, collections) {
  if (files === null) return 'all';
  if (files.some((file) => isCommon(file, collections))) return 'all';
  return [...new Set(files.map((file) => collectionOf(file, collections)).filter((name) => name !== null))].sort();
}

export const touchedOutput = (touched) => (touched === 'all' ? 'all' : touched.length === 0 ? 'none' : touched.join(','));

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const base = process.argv[2];
  const here = path.dirname(new URL(import.meta.url).pathname);
  const collections = fs.readdirSync(path.join(here, '../ateliers'));
  let files = null;
  try {
    files = base ? execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean) : null;
  } catch {
    files = null;
  }
  console.log(touchedOutput(touchedCollections(files, collections)));
}
