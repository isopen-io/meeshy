// Les fichiers médias vivent sur disque, hors de la base. L'anonymisation de la
// base les déréférence (chemins → `anonymized/placeholder.*`) et en écrit le
// manifeste ; CE module, lancé séparément, remplace leur contenu par un fichier
// neutre et pose les quatre fichiers de remplacement. À blanc par défaut.

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PLACEHOLDER_DIR, PLACEHOLDER_FILES, mediaCategory } from './synth.mjs';

// PNG 1×1 transparent.
const NEUTRAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

// WAV PCM 16 bits mono 8 kHz, un dixième de seconde de silence.
function silentWav() {
  const samples = 800;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples * 2, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples * 2, 40);
  return Buffer.concat([header, Buffer.alloc(samples * 2)]);
}

const NEUTRAL = Object.freeze({
  image: NEUTRAL_PNG,
  audio: silentWav(),
  video: Buffer.alloc(0),
  file: Buffer.from('Fichier remplacé par anonymisation.\n'),
});

/** Ramène une référence (clé de stockage ou URL de la passerelle) à un chemin relatif. */
export function storageKey(reference) {
  if (typeof reference !== 'string' || reference === '') return null;
  const raw = /^https?:\/\//i.test(reference) ? new URL(reference).pathname : reference;
  const stripped = raw.replace(/^.*?\/attachments\/file\//, '').replace(/^\/+/, '');
  try {
    return decodeURIComponent(stripped);
  } catch {
    return stripped;
  }
}

function insideRoot(root, relative) {
  const full = path.resolve(root, relative);
  return full.startsWith(`${path.resolve(root)}${path.sep}`) ? full : null;
}

async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.isFile() ? [path.join(dir, e.name)] : [])),
  );
  return nested.flat();
}

export async function readManifest(file) {
  const text = await readFile(file, 'utf8');
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((entry) => typeof entry.original === 'string');
}

/**
 * Plan (et, avec `apply`, exécution) de la neutralisation des fichiers.
 * `all` neutralise TOUT fichier sous la racine, référencé ou non — le seul
 * moyen d'atteindre les fichiers orphelins que la base ne nomme plus.
 */
export async function neutralizeMedia({ manifest = [], uploadsRoot, apply = false, all = false }) {
  const root = path.resolve(uploadsRoot);
  const placeholderRoot = path.join(root, PLACEHOLDER_DIR);
  const referenced = manifest
    .map((entry) => storageKey(entry.original))
    .filter(Boolean)
    .map((key) => insideRoot(root, key))
    .filter(Boolean);
  const candidates = all ? await walk(root) : referenced;
  const targets = [...new Set(candidates)].filter((f) => !f.startsWith(placeholderRoot));
  const present = [];
  for (const file of targets) if (await exists(file)) present.push(file);

  if (apply) {
    for (const [category, relative] of Object.entries(PLACEHOLDER_FILES)) {
      const full = path.join(root, relative);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, NEUTRAL[category]);
    }
    for (const file of present) await writeFile(file, NEUTRAL[mediaCategory({ path: file })]);
  }
  return {
    root,
    referenced: referenced.length,
    neutralized: apply ? present.length : 0,
    wouldNeutralize: present.length,
    missing: targets.length - present.length,
    sample: present.slice(0, 5).map((f) => path.relative(root, f)),
  };
}
