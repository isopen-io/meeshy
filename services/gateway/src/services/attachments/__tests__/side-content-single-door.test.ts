/**
 * **La PORTE du contenu latéral est `servedSideContent`, et elle est unique**
 * (#19978, audit adversarial, constat C7).
 *
 * `servedDescription` ne sert que la DESCRIPTION. C'est exactement la moitié de
 * la loi, et c'est la moitié qui a produit le défaut : les deux chemins les plus
 * fréquentés l'appelaient, gardaient `alt`, et répandaient `transcription` à
 * côté.
 *
 * Le commit de la première rédaction affirmait qu'il « reste exporté pour ses
 * appelants qui ne servent QUE la description ». Mesuré : **il n'en a aucun** —
 * ses seules occurrences hors tests sont des commentaires. Un helper à zéro
 * appelant ne documente rien ; il ATTEND qu'on l'utilise, et le prochain qui
 * l'utilisera appliquera la moitié de la loi en croyant l'appliquer.
 *
 * Ce cliquet ne retire pas l'export (sa propre suite en a besoin) : il interdit
 * qu'un fichier de PRODUCTION le rappelle.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC = join(__dirname, '..', '..', '..');
/** La loi elle-même : c'est son site de définition et son unique appelant légitime. */
const THE_LAW = join('services', 'attachments', 'mediaSideContent.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
      walk(full, out);
      continue;
    }
    if (/\.(ts|mts|cts)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Les commentaires NOMMENT la loi pour l'expliquer — ils ne l'appellent pas. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const CALLS_HALF_THE_LAW = /\bservedDescription\s*[(<]/;

describe('contenu latéral — aucun site de production ne rappelle la moitié de la loi', () => {
  const files = walk(SRC).map((full) => relative(SRC, full).split(sep).join(sep));

  it('balaye bien quelque chose — une garde négative dont la portée est vide reste verte', () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain(THE_LAW);
  });

  it('`servedDescription` n’est appelée que par la loi elle-même', () => {
    const offenders = files.filter((file) => {
      if (file === THE_LAW) return false;
      return CALLS_HALF_THE_LAW.test(stripComments(readFileSync(join(SRC, file), 'utf8')));
    });

    expect(offenders).toEqual([]);
  });
});
