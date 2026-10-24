// La génération des onze ateliers, partagée par l'export (lib/export.mjs) et les cibles (lib/cible.mjs) : chaque
// atelier est rejoué dans les deux variantes de plaque (CADRES_PLATE=plain|message, lib/base.py) sous
// <plates>/<variante>/<atelier>/, puis tel quel sous <out>/<atelier>/. Python : $PYTHON, sinon python3 ; l'atelier
// poses demande numpy et Pillow.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
export const ATELIERS = path.join(HERE, '../ateliers');
export const PLATE_VARIANTS = ['plain', 'message'];

export const listAteliers = (root = ATELIERS) => fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'gen.py'))).sort();

export function generateAteliers({ out, plates, ateliers = listAteliers() }) {
  const run = (atelier, variant) => {
    fs.rmSync(path.join(out, atelier), { recursive: true, force: true });
    const env = { ...process.env };
    if (variant) env.CADRES_PLATE = variant;
    else delete env.CADRES_PLATE;
    execFileSync(process.env.PYTHON ?? 'python3', ['-B', 'gen.py'], { cwd: path.join(ATELIERS, atelier), env, stdio: ['ignore', 'ignore', 'inherit'] });
  };
  for (const atelier of ateliers) {
    for (const variant of PLATE_VARIANTS) {
      run(atelier, variant);
      const target = path.join(plates, variant, atelier);
      fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(path.join(out, atelier), target);
    }
    run(atelier, null);
  }
  return ateliers;
}
