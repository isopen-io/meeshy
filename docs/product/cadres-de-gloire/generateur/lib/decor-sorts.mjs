// Le TRI des textes de décor côté générateur (#10256, § 5.2 du prompt) : la table écrite à la main
// (packages/shared/design/glory-frames/decor-texts.json, lue aussi par la garde de packages/shared) range chaque
// emplacement `decor.<n>` d'un cadre en `baked` (neutre : nombre, unité, symbole, nom propre — l'export le CUIT dans
// la couche decor et il quitte le contrat), `translated` (sa clé dans le catalogue des sept langues) ou `live` (une
// donnée du moment, remplie par le peintre). Un texte que la table ne range pas fait rougir export-check.
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
export const DECOR_TEXTS_FILE = path.resolve(HERE, '../../../../../packages/shared/design/glory-frames/decor-texts.json');
export const DECOR_SLOT = /^decor\.[0-9]{1,3}$/;
const SORTS = new Set(['baked', 'translated', 'live']);

export const frameIdOf = (collection, name) => (name.startsWith(`${collection}-`) ? `${collection}.${name.slice(collection.length + 1)}` : `${collection}.${name}`);

/** `cadre → emplacement → { sample, sort, … }` ; une ligne illisible arrête tout. */
export function readDecorTexts(file = DECOR_TEXTS_FILE) {
  const frames = JSON.parse(fs.readFileSync(file, 'utf8')).frames ?? {};
  for (const [id, slots] of Object.entries(frames)) {
    for (const [slot, entry] of Object.entries(slots)) {
      if (!DECOR_SLOT.test(slot)) throw new Error(`${file} : ${id}#${slot} n'est pas un texte de décor`);
      if (!SORTS.has(entry?.sort) || typeof entry.sample !== 'string') throw new Error(`${file} : ${id}#${slot} : tri inconnu (${entry?.sort})`);
    }
  }
  return frames;
}

/** Les emplacements à CUIRE : déclarés neutres, et dont le texte rendu est bien celui que la table a rangé. */
export function bakedSlotsOf(table, id, samples) {
  return Object.entries(table[id] ?? {})
    .filter(([slot, entry]) => entry.sort === 'baked' && samples.get(slot) === entry.sample)
    .map(([slot]) => slot);
}

/** Ce qui empêche les textes de décor d'un cadre exporté d'être rangés : vide quand chacun l'est. */
export function decorTextFailures(frame, collection, table) {
  const id = frameIdOf(collection, frame.frame);
  const sorts = table[id] ?? {};
  const slots = Object.entries(frame.text ?? {})
    .filter(([key]) => DECOR_SLOT.test(key))
    .flatMap(([key, slot]) => {
      const entry = sorts[key];
      const where = `${id}#${key}`;
      if (entry === undefined) return [`${where} : texte de décor ni traduit ni déclaré neutre (« ${slot.text} »)`];
      if (entry.sample !== slot.text) return [`${where} : la table range « ${entry.sample} », l’export porte « ${slot.text} »`];
      if (entry.sort === 'baked') return [`${where} : texte neutre resté emplacement (« ${slot.text} ») : il se cuit dans le décor`];
      return [];
    });
  const baked = (frame.baked ?? [])
    .filter(({ slot, sample }) => sorts[slot]?.sort !== 'baked' || sorts[slot].sample !== sample)
    .map(({ slot, sample }) => `${id}#${slot} : texte cuit sans être déclaré neutre (« ${sample} »)`);
  const window = frame.bakedInWindow > 0 ? [`${frame.frame} : texte cuit dans la fenêtre photo (${frame.bakedInWindow} px)`] : [];
  return [...slots, ...baked, ...window];
}
