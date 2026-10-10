// Le MANIFESTE d'une exécution (JSONL, mode 600) : il porte les références de
// fichiers remplacées (étape médias) ET l'état qui permet de reprendre une
// exécution interrompue — le sel, les empreintes des mots d'identité et les
// relations « empreinte d'une valeur réelle → valeur synthétique ». Aucune
// valeur réelle n'y est écrite en clair, sauf les chemins de fichiers d'origine
// (que l'étape médias doit retrouver sur disque).
//
// Le fichier s'écrit AU FIL de l'exécution, avant chaque écriture en base qui
// en dépend : une interruption ne perd ni un chemin ni une relation.

import { appendFile, chmod, readFile, writeFile } from 'node:fs/promises';

async function readLines(file) {
  try {
    const text = await readFile(file, 'utf8');
    return text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Les lignes d'état qu'un contexte rend persistables. */
export function stateLines(ctx) {
  return [
    { kind: 'identity', words: [...ctx.identity] },
    ...Object.entries(ctx.relations).map(([family, map]) => ({ kind: 'relations', family, entries: [...map.entries()] })),
  ];
}

/** Recharge dans `ctx` l'état d'une exécution précédente (lignes du manifeste). */
export function applyState(ctx, lines) {
  lines.forEach((line) => {
    if (line.kind === 'identity') line.words.forEach((w) => ctx.identity.add(w));
    if (line.kind === 'relations' && ctx.relations[line.family]) line.entries.forEach(([k, v]) => ctx.relations[line.family].set(k, v));
  });
  return ctx;
}

/** Le sel d'un manifeste existant, ou `null` s'il n'existe pas encore. */
export async function readManifestState(file) {
  const lines = await readLines(file);
  if (lines === null) return null;
  const salt = lines.find((l) => l.kind === 'salt')?.salt ?? null;
  return { salt, lines, media: lines.filter((l) => typeof l.original === 'string') };
}

/**
 * Le journal d'une exécution en écriture. `open` crée le fichier en 600 (ou le
 * reprend) et y pose le sel ; `state` y ajoute l'état courant ; `media` les
 * références de fichiers.
 */
export function manifestJournal(file) {
  const append = (rows) => (rows.length === 0 ? Promise.resolve() : appendFile(file, rows.map((r) => `${JSON.stringify(r)}\n`).join(''), { mode: 0o600 }));
  return {
    file,
    async open(salt, { resume }) {
      if (!resume) await writeFile(file, '', { mode: 0o600 });
      await chmod(file, 0o600);
      if (!resume) await append([{ kind: 'salt', salt }]);
    },
    state: (ctx) => append(stateLines(ctx)),
    media: (entries) => append(entries),
  };
}
