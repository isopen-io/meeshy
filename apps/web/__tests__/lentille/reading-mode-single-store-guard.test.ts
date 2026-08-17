/**
 * GARDE DE SOURCE — REV-4bis/B2, témoins (d) et (e).
 *
 * Deux gardes, une même leçon : la façade n'est pas une propriété du code
 * d'aujourd'hui, c'est une propriété qu'il faut EMPÊCHER de se perdre.
 *
 * (d) UN SEUL module lit/écrit la persistance de préférence de mode. Le
 *     défaut réparé par ce lot n'était pas une ligne fausse, c'était un
 *     SECOND magasin apparu à côté du premier sans que personne ne le
 *     remarque. Un troisième s'installerait de la même façon. Cette garde
 *     échoue à la première ligne de code qui touche `localStorage` pour un
 *     mode de lecture hors du module autoritatif.
 *
 * (e) L'état de la DUPLICATION restante est GELÉ, nommé et daté. Deux
 *     `FocalRow` et deux menus de mode coexistent dans l'arbre au moment de
 *     ce lot ; les rattacher dépasse ce blocker, mais les laisser dériver en
 *     silence est ce qui a produit le défaut d'origine. La garde interdit
 *     donc l'apparition d'un TROISIÈME, et signale la disparition d'un des
 *     deux (ce serait l'unification — auquel cas c'est cette garde qu'il faut
 *     mettre à jour, en connaissance de cause).
 *
 * Même famille que `reading-modes-flag-single-occurrence.test.ts` (WF-110) et
 * `ModePreferenceRoundTripTests §6` côté iOS (« plus AUCUNE clé de mode sans
 * scope »). Les commentaires sont RETIRÉS avant le comptage : une docstring
 * qui CITE une clé pour expliquer sa disparition n'écrit rien.
 *
 * ── DISCRIMINATION (leçon 266) : cette garde MORD, vérifié deux fois ────────
 * Une garde de source est verte le jour où on l'écrit ; sans contre-épreuve,
 * elle peut être verte parce qu'elle ne regarde rien. Les deux contre-épreuves
 * ont été jouées à l'écriture :
 *   1. En restaurant `reading-mode-store.ts` dans son état d'AVANT ce lot (le
 *      `zustand/persist` sous `meeshy-reading-mode`), DEUX témoins tombent :
 *      « l'ancienne clé n'est plus nommée que par sa migration » et
 *      « `zustand/persist` n'est plus branché ». La garde décrit donc bien le
 *      défaut réparé, pas l'état actuel par tautologie.
 *   2. En déposant un faux troisième magasin (un module quelconque qui lit
 *      `localStorage` sous le préfixe autoritatif), le premier témoin tombe et
 *      NOMME le fichier fautif.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  LEGACY_READING_MODE_STORAGE_KEY,
  READING_MODE_MIGRATION_MARKER_KEY,
} from '@/stores/reading-mode-preference-store';

const WEB_ROOT = path.join(__dirname, '../..');

/** LE module autoritatif — le seul autorisé à toucher la persistance de préférence. */
const AUTHORITATIVE_STORE = 'stores/reading-mode-preference-store.ts';

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  '__tests__',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

const isTestFile = (filePath: string): boolean => /\.(test|spec)\.[jt]sx?$/.test(filePath);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    const ext = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    if (isTestFile(fullPath)) continue;
    files.push(fullPath);
  }
  return files;
}

/**
 * Retire les commentaires ligne ET bloc — même parti pris que
 * `AppSourceGuard.stripComments` (iOS) et que le durcissement REV-4/B4 de
 * `check-law-literals.sh` : c'est le CODE qui est gardé, pas le texte qui
 * l'explique.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function filesMatching(pattern: RegExp): string[] {
  return walk(WEB_ROOT)
    .filter((file) => pattern.test(stripComments(fs.readFileSync(file, 'utf8'))))
    .map((file) => path.relative(WEB_ROOT, file))
    .sort();
}

// ---------------------------------------------------------------------------
// TÉMOIN (d) — un seul module possède la persistance
// ---------------------------------------------------------------------------

describe('garde — UN SEUL module lit/écrit la persistance de préférence de mode', () => {
  it('le préfixe de clé du magasin autoritatif ne vit que dans le magasin autoritatif', () => {
    expect(filesMatching(/'meeshy:reading-mode:/)).toEqual([AUTHORITATIVE_STORE]);
  });

  it("l'ancienne clé `meeshy-reading-mode` n'est plus NOMMÉE que par sa propre migration", () => {
    expect(filesMatching(/meeshy-reading-mode/)).toEqual([AUTHORITATIVE_STORE]);
  });

  it("le substitut de persistance n'est instancié que par la couche d'injection", () => {
    expect(filesMatching(/new LocalReadingModePreferenceStore/)).toEqual([AUTHORITATIVE_STORE]);
  });

  it('`zustand/persist` n’est plus branché sur AUCUN magasin de mode de lecture', () => {
    const readingModeStores = walk(WEB_ROOT).filter((file) =>
      /reading-mode.*store\.ts$/.test(path.relative(WEB_ROOT, file))
    );

    expect(readingModeStores.length).toBeGreaterThan(0);
    readingModeStores.forEach((file) => {
      expect(stripComments(fs.readFileSync(file, 'utf8'))).not.toMatch(/from 'zustand\/middleware'/);
    });
  });

  it('les deux clés exportées ne se recouvrent pas (sanity de la garde elle-même)', () => {
    expect(READING_MODE_MIGRATION_MARKER_KEY).not.toBe(LEGACY_READING_MODE_STORAGE_KEY);
    expect(READING_MODE_MIGRATION_MARKER_KEY.startsWith('meeshy:reading-mode:')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TÉMOIN (e) — la duplication restante est GELÉE, nommée et datée
// ---------------------------------------------------------------------------

/**
 * INVENTAIRE GELÉ AU 2026-08-17 (REV-4bis/B2).
 *
 * ── Les deux `FocalRow` ────────────────────────────────────────────────────
 * `components/conversations/focal/FocalRow.tsx` est la rangée du fil Focal
 * (drapeau ON, densités `focal`/`script`, perspective) ;
 * `components/common/bubble-message/FocalRow.tsx` appartient au rendu à
 * bulles historique. Ils portent le MÊME NOM sans partager de code — c'est
 * précisément la configuration qui a permis aux deux magasins de mode de
 * diverger sans que personne ne le voie.
 *
 * ── Les deux menus de mode ─────────────────────────────────────────────────
 * `components/conversations/reading/LensSwitcher.tsx` (3 entrées : Focal,
 * Script, Bulles — le sélecteur du volume 3, monté par `ConversationView` et
 * `SharedConversationPreview`) et
 * `components/conversations/lentille/ReadingModeMenu.tsx` (5 entrées : Auto,
 * Focal, Script, Résumé, Rivière — le menu du contrat, monté par
 * `LentillePeek` sur ses trois chemins d'entrée).
 *
 * TRAJECTOIRE D'UNIFICATION, telle que ce lot la laisse. La moitié DONNÉE du
 * problème est close : les deux menus écrivent désormais le même magasin, et
 * ce magasin gouverne réellement le rendu. Ce qui reste est de la peau —
 * deux listes, deux vocabulaires affichés, deux points de montage.
 *
 * `LensSwitcher` devient largement REDONDANT sous drapeau ON : ses trois
 * entrées y valent respectivement Focal, Script et (pour « Bulles ») un
 * `clamped-unavailable` qui rend Focal — soit un choix visible sans effet.
 * Il reste en revanche NÉCESSAIRE drapeau ÉTEINT, où le menu du contrat n'est
 * pas monté du tout (`LentilleConversationListMount` est derrière le
 * drapeau) et où « Bulles » est le seul accès au rendu historique.
 * PROPOSITION, hors périmètre de ce blocker et donc NON exécutée ici : monter
 * `ReadingModeMenu` à la place de `LensSwitcher` dans l'en-tête du fil quand
 * le drapeau est actif, en gardant `LensSwitcher` sur le chemin OFF —
 * l'inverse (supprimer `LensSwitcher`) casserait le chemin OFF que le
 * contrat promet bit-à-bit.
 *
 * Cette garde ne fige pas cette proposition : elle fige le CONSTAT, pour
 * qu'un troisième `FocalRow` ou un troisième menu ne s'installe pas en
 * silence, et pour que l'unification, quand elle viendra, soit un geste
 * délibéré qui met cette liste à jour.
 */
const FROZEN_FOCAL_ROWS = [
  'components/common/bubble-message/FocalRow.tsx',
  'components/conversations/focal/FocalRow.tsx',
];

const FROZEN_MODE_MENUS = [
  'components/conversations/lentille/ReadingModeMenu.tsx',
  'components/conversations/reading/LensSwitcher.tsx',
];

describe('garde — la duplication restante est gelée (FocalRow ×2, menus de mode ×2)', () => {
  it('EXACTEMENT deux `FocalRow` — ni un troisième, ni une unification silencieuse', () => {
    const found = walk(WEB_ROOT)
      .map((file) => path.relative(WEB_ROOT, file))
      .filter((file) => path.basename(file) === 'FocalRow.tsx')
      .sort();

    expect(found).toEqual(FROZEN_FOCAL_ROWS);
  });

  it('EXACTEMENT deux menus de mode de lecture, aux deux adresses connues', () => {
    const found = walk(WEB_ROOT)
      .map((file) => path.relative(WEB_ROOT, file))
      .filter((file) => ['ReadingModeMenu.tsx', 'LensSwitcher.tsx'].includes(path.basename(file)))
      .sort();

    expect(found).toEqual(FROZEN_MODE_MENUS);
  });

  it('les deux menus écrivent le MÊME magasin — c’est la moitié du problème qui EST close', () => {
    const lensSwitcherMount = fs.readFileSync(
      path.join(WEB_ROOT, 'components/conversations/ConversationView.tsx'),
      'utf8'
    );
    const lentilleMount = fs.readFileSync(
      path.join(WEB_ROOT, 'components/conversations/lentille/LentillePeek.tsx'),
      'utf8'
    );

    // `ConversationView` passe par la FAÇADE (qui délègue), `LentillePeek` par
    // le magasin du contrat en direct : deux adresses, une seule destination.
    expect(lensSwitcherMount).toMatch(/from '@\/stores\/reading-mode-store'/);
    expect(lentilleMount).toMatch(/from '@\/stores\/reading-mode-preference-store'/);
  });
});
