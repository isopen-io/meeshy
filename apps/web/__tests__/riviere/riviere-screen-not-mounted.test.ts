/**
 * Témoin de structure — R-134 livrait « l'écran n'est monté nulle part hors
 * de `components/conversations/riviere/` », drapeau OFF. **R-135 recalibre en
 * CONSCIENCE, sans affaiblir** (même discipline à deux positions que
 * `RiverScreenNotMountedTests.swift` côté iOS) :
 *
 * **Position A — le MENU est dégrisé (R-135, livré).** `LentillePeek.tsx`
 * résout désormais `isRiverFlagEnabled` par défaut via `useRiverModeFlag()`
 * (au lieu d'un `false` figé) — les TROIS chemins d'entrée (⋮, aperçu,
 * encoche, une seule instance de `ReadingModeMenu`) en héritent. Voir
 * `LentillePeek.test.tsx`, describe « dégrisage Rivière (R-135) », pour le
 * comportement complet (grisée drapeau OFF, dégrisée drapeau ON + éligible,
 * grisée sous seuil, grisée en `direct`).
 *
 * **Position B — l'ÉCRAN reste NON MONTÉ (inchangé, ré-affirmé ci-dessous).**
 * `RiverThread` (l'hôte qui PEINT réellement les couloirs, SVG overlay + deux
 * axes) n'a toujours AUCUN site de montage : ni `ConversationMessages.tsx`
 * (le mux du fil, qui appelle `useReadingModesFlag()` pour Focal mais ne
 * référence NI `RiverThread` NI `useRiverModeFlag` — re-vérifié ci-dessous),
 * ni aucun autre fichier du dépôt web. Dégriser le menu de LISTE ne mène PAS,
 * mécaniquement, à monter l'écran du FIL OUVERT : ce sont deux fichiers
 * différents (`LentillePeek.tsx` pour la liste, `ConversationMessages.tsx`
 * pour le fil), et seul le premier a été touché par R-135. Monter
 * `RiverThread` réellement (résoudre `RiverGeometry` + `RiverBubbleContent[]`
 * depuis `messages`/`translatedMessages`, une roster de participants qui
 * n'existe pas aujourd'hui comme prop de ce composant, le Prisme sur chaque
 * bulle) est un chantier de conteneur à part entière — hors périmètre « mux
 * menus » de R-135, réservé à un futur lot, documenté dans le rapport R-135.
 *
 * Ce témoin verrouille les DEUX positions : si un futur lot monte
 * effectivement `RiverThread` et/ou câble `useRiverModeFlag` dans
 * `ConversationMessages.tsx`, il doit AUSSI mettre à jour/retirer la partie
 * concernée de cette suite — jamais la laisser rougir en silence en croyant
 * à une régression.
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
