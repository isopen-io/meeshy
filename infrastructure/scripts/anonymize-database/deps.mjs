// Résolution des deux dépendances (`mongodb`, `bcryptjs`) sans les ajouter au
// dépôt racine : depuis le script, puis depuis le répertoire courant (un dossier
// où l'on a fait `npm install mongodb bcryptjs`), puis depuis la passerelle du
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
  throw new Error(`Dépendance introuvable : ${name}. Lancer depuis un dossier où « npm install mongodb bcryptjs » a été fait.`);
}

export async function loadMongo() {
  const mod = await load('mongodb');
  return mod.MongoClient ? mod : mod.default;
}

export async function loadBcrypt() {
  const mod = await load('bcryptjs');
  return mod.default ?? mod;
}
