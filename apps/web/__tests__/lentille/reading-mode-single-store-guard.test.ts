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
 * `LensSwitcher` était réputé largement REDONDANT sous drapeau ON : ses trois
 * entrées y valaient respectivement Focal, Script et (pour « Bulles ») un
 * `clamped-unavailable` qui rendait Focal — un choix visible sans effet.
 * Il restait en revanche NÉCESSAIRE drapeau ÉTEINT, où le menu du contrat
 * n'est pas monté du tout (`LentilleConversationListMount` est derrière le
 * drapeau) et où « Bulles » est le seul accès au rendu historique.
 *
 * CE PARAGRAPHE EST AMENDÉ le 2026-08-17 (Q-142, réserve REV-5 **R6-4**).
 * « Bulles » N'EST PLUS un choix sans effet drapeau ON : le catalogue de
 * l'écran porte désormais `'bubbles'` (`hooks/lentille/
 * use-thread-reading-mode.ts`, où l'arbitrage est écrit au long), parce que
 * la décision produit « Bulles par défaut » du même jour fait déjà monter la
 * vue à bulles pour la branche `auto` — le catalogue disait le contraire de
 * ce que l'écran faisait. `LensSwitcher` cesse donc d'être redondant : c'est
 * aujourd'hui le SEUL menu, depuis l'en-tête d'un fil ouvert, qui ramène aux
 * bulles après un choix explicite de Focal ou de Script (l'entrée « Auto » du
 * menu du contrat vit sur les rangs de la LISTE, pas dans le fil).
 * PROPOSITION, toujours hors périmètre et donc NON exécutée ici : monter
 * `ReadingModeMenu` à la place de `LensSwitcher` dans l'en-tête du fil quand
 * le drapeau est actif, en gardant `LensSwitcher` sur le chemin OFF —
 * l'inverse (supprimer `LensSwitcher`) casserait le chemin OFF que le
 * contrat promet bit-à-bit. Elle coûte désormais plus cher qu'avant : elle
 * devrait emporter avec elle le retour aux bulles, sans quoi le défaut
 * provisoire deviendrait un aller simple.
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

// ---------------------------------------------------------------------------
// [Q-146/R5-4] TÉMOIN (f) — scan STRUCTUREL, robuste au renommage
// ---------------------------------------------------------------------------
//
// RED prouvé (R5-4) : le témoin (d) ci-dessus ne surveille que CINQ
// MARQUEURS NOMMÉS (le préfixe de clé, la clé legacy, le nom de classe du
// substitut, et `zustand/middleware` — mais UNIQUEMENT sur des fichiers dont
// le NOM matche déjà `reading-mode.*store\.ts$`). Un troisième magasin qui
// n'emprunte AUCUN de ces cinq noms — clé `zustand/persist` inventée, nom de
// fichier qui ne contient pas la sous-chaîne `reading-mode` — traverse (d)
// sans faire rougir un seul de ses cinq témoins.
//
// Deux scans INDÉPENDANTS ferment ce trou, l'un sur la CLÉ, l'autre sur la
// FORME du fichier — délibérément redondants, pour rester vrais même si l'un
// des deux angles est contourné à son tour :
//
//   (f1) toute clé passée à `persist(...)` — le second argument `{ name:
//        '...' }` de la config — qui matche `/reading|mode|lens/i` : la clé
//        elle-même trahit l'intention, quel que soit le nom du fichier ou de
//        l'export.
//   (f2) tout fichier sous `stores/` qui IMPORTE `zustand` ET dont le CODE
//        (commentaires retirés) nomme un mode de lecture (`readingMode`,
//        `reading-mode`) ou la Lentille (`lens`) — que ce fichier utilise ou
//        non `persist`, que sa clé soit suspecte ou totalement neutre. C'est
//        la forme la PLUS ROBUSTE au renommage : renommer la clé de
//        persistance ne change ni l'import `zustand`, ni le vocabulaire du
//        domaine que le fichier doit bien porter quelque part pour être
//        utile.
//
// Contre-épreuve jouée à l'écriture (même discipline que (d)/(e)) : un
// magasin `stores/lens-mode-cache-store.ts` (clé `lens-mode-cache-v1`,
// aucun des cinq marqueurs de (d)) fait rougir (f1) ET (f2) — retiré après
// la preuve.

const AUTHORITATIVE_STORE_ABSOLUTE = path.join(WEB_ROOT, AUTHORITATIVE_STORE);

/** Fichiers sources, hors tests — même périmètre que `walk`/`filesMatching`. */
function allSourceFiles(): string[] {
  return walk(WEB_ROOT);
}

/**
 * Les clés de TOUS les appels `persist(...)` du dépôt web, avec leur fichier
 * d'origine. Fenêtre de recherche bornée après chaque occurrence de
 * `persist(` : le `name:` d'une config `persist` est toujours à proximité de
 * l'appel dans ce code, jamais à des centaines de lignes.
 */
function persistKeysByFile(): Array<{ file: string; key: string }> {
  const found: Array<{ file: string; key: string }> = [];
  for (const file of allSourceFiles()) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    const persistCalls = [...code.matchAll(/persist\(/g)];
    for (const call of persistCalls) {
      const windowStart = call.index! + call[0].length;
      const window = code.slice(windowStart, windowStart + 800);
      const nameMatch = window.match(/name:\s*['"]([^'"]+)['"]/);
      if (nameMatch) {
        found.push({ file: path.relative(WEB_ROOT, file), key: nameMatch[1] });
      }
    }
  }
  return found;
}

describe('[Q-146/R5-4] garde — scan structurel, robuste au renommage', () => {
  it('(f1) aucune clé `persist(...)` ne matche reading|mode|lens — le magasin autoritatif n\'utilise PAS zustand/persist (témoin (d) #4)', () => {
    // Le magasin autoritatif gère lui-même sa persistance (`localStoragePersistence`
    // ci-contre dans `reading-mode-preference-store.ts`), précisément pour rester
    // versionné/optimiste — voir témoin (d) #4 : `zustand/persist` n'est branché sur
    // AUCUN magasin de mode de lecture. Une clé `persist(...)` qui matche
    // reading|mode|lens n'a donc AUCUN propriétaire légitime aujourd'hui.
    const suspiciousKeys = persistKeysByFile().filter(({ key }) => /reading|mode|lens/i.test(key));

    expect(suspiciousKeys.map((entry) => entry.file)).toEqual([]);
  });

  it('(f1-sanity) le scan trouve bien des clés `persist` — anti-silence', () => {
    expect(persistKeysByFile().length).toBeGreaterThan(0);
  });

  it('(f2) aucun fichier de stores/ (hors le magasin autoritatif) n\'importe zustand ET ne nomme un mode de lecture', () => {
    const storesDir = path.join(WEB_ROOT, 'stores');
    const offenders = walk(storesDir)
      .filter((file) => path.resolve(file) !== AUTHORITATIVE_STORE_ABSOLUTE)
      .filter((file) => {
        const code = stripComments(fs.readFileSync(file, 'utf8'));
        const importsZustand = /from ['"]zustand/.test(code);
        const namesReadingModeOrLens = /reading[-_]?mode|\blens\b/i.test(code) || /reading[-_]?mode|\blens\b/i.test(path.basename(file));
        return importsZustand && namesReadingModeOrLens;
      })
      .map((file) => path.relative(WEB_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('(f2-sanity) le magasin autoritatif lui-même importe bien zustand et nomme un mode de lecture — la garde ne se vide pas en silence', () => {
    const code = stripComments(fs.readFileSync(AUTHORITATIVE_STORE_ABSOLUTE, 'utf8'));
    expect(/from ['"]zustand/.test(code)).toBe(true);
    expect(/reading[-_]?mode/i.test(code)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// [Q-146/R5-4] TÉMOIN (g) — les points d'entrée LÉGITIMES hors périmètre,
// nommés plutôt que supposés
// ---------------------------------------------------------------------------
//
// REV-5 (V5) : la surface a grandi. G-121 (route gateway + colonne Prisma
// `UserConversationPreferences.readingMode`) et G-124 (injection iOS)
// donnent au système, AUJOURD'HUI, quatre points d'entrée légitimes sur la
// préférence de mode de lecture — dont UN SEUL relève de cette garde. Les
// nommer ici, avec un témoin qui vérifie qu'ils existent bien à l'adresse
// annoncée, évite que « un seul magasin » soit lu comme une exclusivité
// SYSTÈME plutôt que comme le périmètre réel de cette suite (apps/web
// uniquement) — et fait rougir CE témoin, pas une intuition, le jour où l'un
// de ces chemins bouge de fichier.
describe('[Q-146/R5-4] les 4 points d\'entrée légitimes, nommés', () => {
  it('1. le magasin web autoritatif — GOUVERNÉ par cette garde', () => {
    expect(fs.existsSync(AUTHORITATIVE_STORE_ABSOLUTE)).toBe(true);
  });

  it('2. le magasin iOS device-scopé — sa propre famille de gardes (ModePreferenceRoundTripTests)', () => {
    const iosStore = path.join(
      WEB_ROOT,
      '../ios/Meeshy/Features/Main/Focal/Preferences/ReadingModePreferenceStore.swift'
    );
    expect(fs.existsSync(iosStore)).toBe(true);
  });

  it('3. la route serveur G-121 — écrit `UserConversationPreferences.readingMode`, hors apps/web', () => {
    const gatewayRoute = path.join(
      WEB_ROOT,
      '../../services/gateway/src/routes/conversation-preferences.ts'
    );
    expect(fs.existsSync(gatewayRoute)).toBe(true);
    expect(fs.readFileSync(gatewayRoute, 'utf8')).toContain('readingMode');
  });

  it('4. la lecture serveur du choix collant — alimente `suggestedMode` (G-121/G-123), hors apps/web', () => {
    // #4284 a scindé `conversations/core.ts` en `core-detail` / `core-list` /
    // `core-lifecycle` / `core-selects`, et `core.ts` est devenu une coquille de
    // ré-export. Une garde ancrée sur UN chemin mesure ce chemin, pas la
    // propriété : elle balaie donc la FAMILLE, et prouve d'abord qu'elle la voit
    // — sans quoi un répertoire renommé la rendrait verte à vide.
    const coreDir = path.join(
      WEB_ROOT,
      '../../services/gateway/src/routes/conversations'
    );
    const famille = fs
      .readdirSync(coreDir)
      .filter((f) => /^core.*\.ts$/.test(f))
      .sort();
    expect(famille.length).toBeGreaterThan(1);

    const porteurs = famille.filter((f) =>
      fs.readFileSync(path.join(coreDir, f), 'utf8').includes('prefs?.readingMode')
    );
    expect(porteurs).not.toEqual([]);
  });
});

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
