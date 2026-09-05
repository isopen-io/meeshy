/**
 * Cliquet — le prisme du LECTEUR se lit par la SSOT, jamais par une liste en ligne
 *
 * Suivi ouvert par les cycles 283→286 et resté sans garde jusqu'ici : côté web,
 * seule la revue de recensement empêchait la réapparition d'une liste de langues
 * du lecteur bâtie À LA MAIN. Les cycles 285 (`use-stream-translation.ts`,
 * cache) et 286 (le même hook, compteur de statistiques) ont retiré exactement
 * ce motif :
 *
 *   const userLanguages = [
 *     user.systemLanguage,
 *     user.regionalLanguage,
 *     user.customDestinationLanguage,
 *   ].filter(Boolean);
 *
 * C'est le prisme du lecteur ARRÊTÉ AU RANG 3 : il omet la locale appareil
 * (rang 4, Prisme étendu 2026-05-26) et la canonicalisation/déduplication
 * qu'apporte la SSOT. Un lecteur dont le seul signal de langue est sa locale
 * appareil (préférences in-app vides) voit son contenu résolu vers cette locale
 * par le chemin de rendu — qui passe, lui, par la SSOT — mais toute jumelle
 * en ligne le rate en silence (cf. `apps/web/CLAUDE.md` § Device Locale : « une
 * table recopiée se lit comme une source de vérité et dérive du vrai contrat en
 * silence »).
 *
 * La SEULE façon de composer une liste de langues du LECTEUR est
 * `getUserLanguagePreferences(user)` / `resolveUserPreferredLanguage(user)`
 * (`@/utils/user-language-preferences`), qui injectent la locale appareil en
 * rang 4 et canonicalisent.
 *
 * Ce que ce cliquet garde, et ce qu'il ne garde PAS :
 *
 * - Il vise la LISTE DE RÉSOLUTION — les trois champs du lecteur collectés dans
 *   un littéral de tableau, refermé par `.filter(Boolean)`. C'est le `.filter`
 *   qui distingue une liste de VALEURS (un runtime resolver) d'un tableau de
 *   DÉPENDANCES de `useMemo`/`useCallback` (qui liste légitimement ces mêmes
 *   champs — p. ex. `bubble-stream-page.tsx` pour `getUserLanguageChoices`, dont
 *   la fonction n'utilise QUE ces trois rangs). Un tableau de dépendances n'est
 *   jamais une liste de résolution ; il n'est pas visé.
 * - Il ne vise PAS `resolveUserLanguagesOrdered(otherUser, …)` : résoudre la
 *   langue d'un AUTRE utilisateur (une fiche de contact, l'autre participant
 *   d'une conversation) est légitime, et y injecter la `navigator.language` du
 *   navigateur COURANT serait un défaut — c'est la locale d'un autre appareil.
 *   Seule la liste du lecteur COURANT doit passer par la SSOT.
 *
 * Inventaire GELÉ VIDE : les cycles 285/286 ont retiré le dernier exemplaire.
 * Quand ce cliquet tombe, la réparation est d'appeler la SSOT, jamais d'ajouter
 * une ligne à l'inventaire — il n'y a pas de liste de langues du lecteur en
 * ligne légitime à porter.
 *
 * Modèle : `composer-legacy-mounts-guard.test.ts` (marche `fs`, mêmes
 * exclusions).
 */
import * as fs from 'fs';
import * as path from 'path';

const WEB_ROOT = path.join(__dirname, '../..');

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  '__tests__',
  '__mocks__',
  'e2e',
  'coverage',
  '.turbo',
]);

// La SSOT elle-même énumère les rangs — elle est le site AUTORISÉ, pas une
// jumelle. Elle est exclue du balayage par son chemin.
const SSOT_FILES = new Set([
  path.join('utils', 'user-language-preferences.ts'),
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function stripComments(source: string): string {
  // Retire les blocs /* … */ et les lignes // … pour qu'un exemple cité dans un
  // doc-comment (comme celui de CE fichier) ne soit jamais compté comme un site.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Détecte le motif retiré aux cycles 285/286 : les trois champs de langue du
 * lecteur collectés dans un littéral de tableau refermé par `.filter(Boolean)`.
 * Insensible à la mise en forme (les sauts de ligne sont réduits en espaces).
 */
const READER_LIST_PATTERN =
  /\.systemLanguage\s*,[^\]]*\.regionalLanguage\s*,[^\]]*\.customDestinationLanguage[^\]]*\]\s*\.filter\(\s*Boolean\s*\)/;

function hasReaderListAntiPattern(source: string): boolean {
  const normalized = stripComments(source).replace(/\s+/g, ' ');
  return READER_LIST_PATTERN.test(normalized);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      out.push(...walk(path.join(dir, entry.name)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    const abs = path.join(dir, entry.name);
    const rel = path.relative(WEB_ROOT, abs);
    if (SSOT_FILES.has(rel)) continue;
    out.push(abs);
  }
  return out;
}

describe('Cliquet — le prisme du lecteur se lit par la SSOT, jamais en ligne', () => {
  it('le balayage couvre bien l\'arbre source web (prémisse non vide)', () => {
    const files = walk(WEB_ROOT);
    // Un balayage négatif dont la liste est vide reste vert pour la mauvaise
    // raison : on prouve d'abord qu'il voit des centaines de fichiers.
    expect(files.length).toBeGreaterThan(100);
  });

  it('aucune liste de langues du lecteur `[system, regional, custom].filter(Boolean)` en ligne', () => {
    const offenders = walk(WEB_ROOT)
      .filter((abs) => hasReaderListAntiPattern(fs.readFileSync(abs, 'utf8')))
      .map((abs) => path.relative(WEB_ROOT, abs));

    // Inventaire GELÉ VIDE (cycles 285/286). Toute entrée est un site NEUF, à
    // réparer en appelant `getUserLanguagePreferences` — jamais à geler.
    expect(offenders).toEqual([]);
  });

  it('le détecteur TOMBE sur le motif exact retiré aux cycles 285/286 (RED prouvé)', () => {
    const removed = [
      'const userLanguages = [',
      '  user.systemLanguage,',
      '  user.regionalLanguage,',
      '  user.customDestinationLanguage,',
      '].filter(Boolean);',
    ].join('\n');
    expect(hasReaderListAntiPattern(removed)).toBe(true);
  });

  it('le détecteur IGNORE un tableau de dépendances de useMemo (pas de .filter)', () => {
    const depArray = [
      'const choices = useMemo(() => getUserLanguageChoices(user), [',
      '  user.systemLanguage,',
      '  user.regionalLanguage,',
      '  user.customDestinationLanguage,',
      ']);',
    ].join('\n');
    expect(hasReaderListAntiPattern(depArray)).toBe(false);
  });

  it('le détecteur IGNORE la résolution de la langue d\'un AUTRE utilisateur via la SSOT partagée', () => {
    const otherUser =
      'languageCode: resolveUserLanguagesOrdered(otherUser, { deviceLocale: otherUser.deviceLocale })[0] ?? \'fr\',';
    expect(hasReaderListAntiPattern(otherUser)).toBe(false);
  });

  it('le détecteur IGNORE un exemple cité dans un commentaire', () => {
    const inComment = [
      '// const userLanguages = [',
      '//   user.systemLanguage,',
      '//   user.regionalLanguage,',
      '//   user.customDestinationLanguage,',
      '// ].filter(Boolean);',
    ].join('\n');
    expect(hasReaderListAntiPattern(inComment)).toBe(false);
  });
});
