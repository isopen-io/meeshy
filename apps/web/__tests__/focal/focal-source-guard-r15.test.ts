/**
 * Garde R15 (contrat, §6/R15) — « Aucune constante de loi n'est écrite hors
 * `packages/shared/` : garde source sur les trois arbres : aucun
 * `520`/`380`/`0.45`/`0.82`/`900`/`25`/`24` littéral dans un fichier de
 * peau. » Portée : `components/conversations/focal/**` (WF-110/111/112).
 *
 * Recherche des littéraux BANNIS comme NOMBRES ISOLÉS (bornés par des
 * limites non-numériques) — pour ne jamais faire un faux positif sur un
 * nombre plus long qui les contient (`1900`, `2024`) ni sur un identifiant
 * (`padding900`). Les commentaires sont exclus : documenter la loi en prose
 * (« la même bande que la liste, 140±45 ») n'est pas une réécriture de la
 * constante dans le CODE.
 */
import * as fs from 'fs';
import * as path from 'path';

const SKIN_ROOT = path.join(__dirname, '../../components/conversations/focal');
const BANNED_LITERALS = ['520', '380', '0.45', '0.82', '900', '25', '24'];

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(filePath);
}

function walk(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (isTestFile(entry.name)) continue;
    files.push(path.join(dir, entry.name));
  }
  return files;
}

/** Retire les commentaires `//` et `/* ... *\/` avant le scan (documentation ≠ code). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('Garde R15 — aucun littéral de loi banni dans la peau Focal', () => {
  const files = walk(SKIN_ROOT);

  it('la peau existe bien (garde anti-silence, leçon 257)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  BANNED_LITERALS.forEach((literal) => {
    it(`aucun littéral isolé "${literal}" hors commentaires`, () => {
      const escaped = literal.replace('.', '\\.');
      const pattern = new RegExp(`(?<![\\w.])${escaped}(?![\\w.])`);
      const offenders: string[] = [];

      for (const file of files) {
        const code = stripComments(fs.readFileSync(file, 'utf8'));
        if (pattern.test(code)) {
          offenders.push(path.relative(SKIN_ROOT, file));
        }
      }

      expect(offenders).toEqual([]);
    });
  });
});
