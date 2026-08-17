/**
 * Garde R15 (contrat, §6/R15) — R-134, MÊME patron que
 * `focal-source-guard-r15.test.ts` (WF-110/111/112), portée
 * `components/conversations/riviere/**`.
 *
 * Deux volets :
 *   1. Les littéraux d'AUTRES lois (`focus-curve.ts`/`scroll-activity.ts`/
 *      l'orchestrateur) bannis en peau — MÊME liste que la garde Focal, EN
 *      PLUS de `bash scripts/check-law-literals.sh` (qui scanne déjà
 *      `apps/web/components/conversations/riviere` — ce fichier est un
 *      second témoin, au niveau jest, comme son homologue Focal).
 *   2. La loi Rivière elle-même (`river-lanes.ts`) n'est jamais RECALCULÉE
 *      dans la peau : ni `RIVER_LANE_SILENCE_WINDOW_MS` (1800000, le plus
 *      distinctif — 7/3/2 sont omniprésents dans n'importe quel style et ne
 *      se bannissent pas en aveugle, même raisonnement que
 *      `RiverSourceGuardTests.swift`), ni une redéclaration locale de
 *      `resolveRiverLanes`/`resolveRiverStep`/`resolveRiverLaneHeaders`/
 *      `resolveRiverLivingLanes`/`resolveRiverLaneAt` (seul un IMPORT depuis
 *      `@meeshy/shared/utils/river-lanes` est légitime).
 */
import * as fs from 'fs';
import * as path from 'path';

const SKIN_ROOT = path.join(__dirname, '../../components/conversations/riviere');
const BANNED_LITERALS = ['520', '380', '0.45', '0.82', '900', '25', '24'];
const LAW_FUNCTION_NAMES = [
  'resolveRiverLanes',
  'resolveRiverStep',
  'resolveRiverLaneHeaders',
  'resolveRiverLivingLanes',
  'resolveRiverLaneAt',
];

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
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('Garde R15 — aucun littéral de loi (autre) banni dans la peau Rivière', () => {
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

describe('Garde R15 — la loi Rivière n\'est jamais recalculée dans la peau', () => {
  const files = walk(SKIN_ROOT);

  it('aucun fichier ne contient le littéral distinctif de RIVER_LANE_SILENCE_WINDOW_MS (1800000)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (code.includes('1800000')) {
        offenders.push(path.relative(SKIN_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  LAW_FUNCTION_NAMES.forEach((fnName) => {
    it(`"${fnName}" n'est jamais RE-DÉCLARÉE dans la peau (seul un import depuis @meeshy/shared est légitime)`, () => {
      const declarationPattern = new RegExp(
        `\\bfunction\\s+${fnName}\\s*\\(|\\bconst\\s+${fnName}\\s*=\\s*(\\(|function)`
      );
      const offenders: string[] = [];

      for (const file of files) {
        const code = stripComments(fs.readFileSync(file, 'utf8'));
        if (declarationPattern.test(code)) {
          offenders.push(path.relative(SKIN_ROOT, file));
        }
      }

      expect(offenders).toEqual([]);
    });
  });
});
