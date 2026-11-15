// Résolution des deux dépendances (`mongodb`, `bcryptjs`) sans les ajouter au
// dépôt racine : depuis le script, puis depuis le répertoire courant (un dossier
// où l'on a fait `npm install` des versions EXACTES de PINNED), puis depuis la passerelle du
// dépôt, qui porte les deux.

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const anchors = [
  path.join(process.cwd(), 'noop.js'),
  path.resolve(here, '../../../services/gateway/package.json'),
  path.resolve(here, '../../../package.json'),
];

/** Versions EXACTES installées par la procédure (README) : aucune résolution de plage. */
export const PINNED = Object.freeze({ mongodb: '7.6.0', bcryptjs: '3.0.3' });

export async function load(name) {
  try {
    return await import(name);
  } catch {
    for (const anchor of anchors) {
      try {
        return await import(pathToFileURL(createRequire(anchor).resolve(name)).href);
      } catch {
        // essayer l'ancre suivante
      }
    }
  }
  throw new Error(`Dépendance introuvable : ${name}. Lancer depuis un dossier où « npm install --no-save --no-package-lock --ignore-scripts mongodb@${PINNED.mongodb} bcryptjs@${PINNED.bcryptjs} » a été fait.`);
}

export async function loadMongo() {
  const mod = await load('mongodb');
  return mod.MongoClient ? mod : mod.default;
}

export async function loadBcrypt() {
  const mod = await load('bcryptjs');
  return mod.default ?? mod;
}
