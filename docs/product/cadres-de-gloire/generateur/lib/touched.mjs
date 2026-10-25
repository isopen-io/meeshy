// Les collections qu'une PR touche (#10277, prompt § 7 L2) : la garde d'empiètement ne re-mesure qu'elles, et tout le
// relevé quand un fichier COMMUN bouge (le moteur lib/, les poses mee/, les polices fonts/) ou que le diff manque.
// Usage : node lib/touched.mjs <réf de base>   → imprime « all », ou les collections séparées par des virgules
//         (rien quand la PR ne touche aucune collection).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const D = 'docs/product/cadres-de-gloire';
const COMMON = [`${D}/generateur/lib/`, `${D}/generateur/mee/`, `${D}/generateur/fonts/`];

const collectionOf = (file, collections) => {
  const patterns = [
    new RegExp(`^${D}/generateur/ateliers/([^/]+)/`),
    new RegExp(`^${D}/manifests/([^/.]+)\\.json$`),
    new RegExp(`^${D}/controle/[a-z-]+?-([a-z]+)\\.json$`),
    /^packages\/shared\/design\/glory-frames\/([^/.]+)\.json$/,
  ];
  return patterns.map((re) => re.exec(file)?.[1]).find((name) => name !== undefined && collections.includes(name)) ?? null;
};

export function touchedCollections(files, collections) {
  if (files === null) return 'all';
  if (files.some((file) => COMMON.some((prefix) => file.startsWith(prefix)))) return 'all';
  return [...new Set(files.map((file) => collectionOf(file, collections)).filter((name) => name !== null))].sort();
}

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
  const touched = touchedCollections(files, collections);
  console.log(touched === 'all' ? 'all' : touched.join(','));
}
