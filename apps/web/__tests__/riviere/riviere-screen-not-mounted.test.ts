/**
 * Témoin de structure OFF (R-134) — « l'écran n'est monté nulle part hors de
 * `components/conversations/riviere/`, même discipline que
 * `RiverScreenNotMountedTests.swift` (R-133) ».
 *
 * Ce lot livre la PEAU (`components/conversations/riviere/`) et son drapeau
 * (`useRiverModeFlag`, `hooks/lentille/resolve-river-mode-flag.ts`), mais
 * AUCUN site de montage : ni `ConversationMessages.tsx` (le mux du fil, qui
 * appelle `useReadingModesFlag()` pour Focal mais ne référence `RiverThread`
 * nulle part), ni `ReadingModeMenu.tsx`/`LentillePeek.tsx` (chantier B2/B3
 * concurrent — hors périmètre de ce lot, NON TOUCHÉS), ni aucun autre fichier
 * du dépôt web ne référence `RiverThread` (l'hôte de l'écran). Le dégrisage
 * réel du menu et le premier montage sont R-135.
 *
 * Ce témoin verrouille cet état : si un futur lot (R-135) monte
 * effectivement `RiverThread` quelque part, il doit AUSSI mettre à jour/
 * retirer cette suite — jamais la laisser rougir en silence en croyant à une
 * régression.
 */
import * as fs from 'fs';
import * as path from 'path';

const WEB_ROOT = path.join(__dirname, '../..');
const RIVIERE_SKIN_ROOT = path.join(WEB_ROOT, 'components/conversations/riviere');

const EXCLUDED_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '__tests__']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(filePath);
}

/** Tout `.ts(x)` sous `apps/web`, HORS `components/conversations/riviere/` (le producteur légitime) et hors tests. */
function nonRiviereWebFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (fullPath === RIVIERE_SKIN_ROOT) continue;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      nonRiviereWebFiles(fullPath, files);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (isTestFile(fullPath)) continue;
    files.push(fullPath);
  }
  return files;
}

describe('Garde R-134 — la Rivière n\'est montée nulle part hors de sa peau', () => {
  it('le garde découvre bien des fichiers hors Riviere/ (anti-silence, leçon 257)', () => {
    expect(nonRiviereWebFiles(WEB_ROOT).length).toBeGreaterThan(0);
  });

  it('"RiverThread" (l\'hôte de l\'écran) n\'apparaît nulle part hors de sa peau', () => {
    const offenders: string[] = [];
    for (const file of nonRiviereWebFiles(WEB_ROOT)) {
      const code = fs.readFileSync(file, 'utf8');
      if (code.includes('RiverThread')) {
        offenders.push(path.relative(WEB_ROOT, file));
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        'Un fichier hors components/conversations/riviere/ référence `RiverThread` — l\'écran ' +
          'Rivière ne doit être monté nulle part par ce lot (R-134 livre la peau, pas son point ' +
          'd\'entrée dans l\'app — R-135). Si ce fichier est le nouveau site de montage légitime, ' +
          'mettre à jour ce témoin en le documentant plutôt que de le supprimer.\n' +
          offenders.map((f) => `  ${f}`).join('\n')
      );
    }
    expect(offenders).toEqual([]);
  });

  it('le mux du fil (ConversationMessages.tsx) ne référence pas non plus `useRiverModeFlag`', () => {
    const conversationMessagesSource = fs.readFileSync(
      path.join(WEB_ROOT, 'components/conversations/ConversationMessages.tsx'),
      'utf8'
    );
    expect(conversationMessagesSource).not.toMatch(/useRiverModeFlag\s*\(/);
  });
});
