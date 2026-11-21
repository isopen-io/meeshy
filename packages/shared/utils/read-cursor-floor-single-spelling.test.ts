/**
 * Le CLIQUET de #19599 : la descente du curseur de lecture n'a qu'UNE graphie
 * par langage.
 *
 * `readFloorOf` (gateway, #19299) a ramené CINQ sites de production sur une
 * loi — et sa protection est le TYPE (`ReadFloorCursor`, deux champs requis),
 * qui ne porte pas hors de TypeScript. Le relevé du 2026-11-18, avant ce lot,
 * a trouvé l'idiome retapé **cinq fois dans trois langages** :
 *
 * | fichier | occurrences |
 * |---|---|
 * | `packages/shared/utils/first-unread.ts` | 1 |
 * | `packages/MeeshySDK/.../Models/FirstUnreadBoundary.swift` | 2 — `resolve` ET `orderedCandidates` |
 * | `apps/android/core/model/.../FirstUnreadBoundary.kt` | 2 — `resolve` ET `orderedCandidates` |
 *
 * Les deux miroirs natifs le recalculaient DEUX FOIS dans la même unité : une
 * jumelle divergente n'a pas besoin d'un autre fichier pour naître, le même
 * suffit. Et aucun des deux ne peut importer la loi TS — d'où un cliquet de
 * BALAYAGE plutôt qu'un cliquet de type, et une graphie autorisée par langage.
 *
 * Quand il tombe : la réparation est d'APPELER la descente du langage
 * (`readCursorFloorOf` en TS, le helper privé du miroir en Swift et en
 * Kotlin), jamais d'ajouter une ligne à {@link FROZEN_HAND_SPELLED} — il n'y a
 * pas de graphie à la main légitime à porter.
 *
 * Le balayage DÉPOUILLE les commentaires : sans quoi il retrouverait les
 * doc-comments qui CITENT l'idiome pour l'interdire — dont celui de
 * `read-cursor-floor.ts` — au lieu des sites qui le portent (règle du
 * balayage des schémas, `services/gateway/CLAUDE.md`).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Les racines balayées. Elles couvrent les trois langages qui descendent ce
 * curseur, plus le gateway — qui n'en porte aujourd'hui AUCUNE graphie à la
 * main (`readFloorOf` compose la descente partagée) et doit le rester.
 */
const ROOTS = [
  'packages/shared/utils',
  'packages/shared/types',
  'services/gateway/src',
  'packages/MeeshySDK/Sources',
  'apps/android/core',
  'apps/ios/Meeshy',
  'apps/web/src',
] as const;

/**
 * La graphie AUTORISÉE, une par langage : le site qui PORTE la descente. Elle
 * y est l'unique, et les deux miroirs natifs la tiennent dans un helper privé
 * que leur propre `resolve` appelle.
 */
const LAW_SITES: Readonly<Record<string, string>> = {
  'packages/shared/utils/read-cursor-floor.ts':
    'la loi TS — `readCursorFloorOf`, consommée par `first-unread.ts` et par `readFloorOf` du gateway',
  'packages/MeeshySDK/Sources/MeeshySDK/Models/FirstUnreadBoundary.swift':
    'le miroir Swift — un seul helper privé, le SDK ne pouvant pas importer la loi TS',
  'apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/FirstUnreadBoundary.kt':
    'le miroir Kotlin — même raison que le miroir Swift',
};

/** Inventaire des graphies à la main TOLÉRÉES. Il doit rester VIDE. */
const FROZEN_HAND_SPELLED: readonly string[] = [];

const EXTENSIONS = ['.ts', '.tsx', '.swift', '.kt'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'Build', 'generated']);

const walk = (dir: string, out: string[] = []): string[] => {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
};

/** Retire les commentaires de ligne et de bloc — les trois langages les écrivent pareil. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * La descente, dans les trois langages. `[A-Za-z]*` absorbe le suffixe
 * `Millis` du miroir Kotlin, et l'intervalle borné interdit d'apparier deux
 * expressions voisines sans rapport.
 */
const SPELLINGS: readonly RegExp[] = [
  /lastReadMessageCreatedAt[A-Za-z]*[^;\n]{0,40}(\?\?|\|\||\?:)[^;\n]{0,30}lastReadAt/g,
];

type Hit = { readonly file: string; readonly count: number };

const sweepHandSpelledDescents = (): readonly Hit[] => {
  const hits: Hit[] = [];
  for (const root of ROOTS) {
    for (const file of walk(join(REPO_ROOT, root))) {
      const body = stripComments(readFileSync(file, 'utf8'));
      const count = SPELLINGS.reduce(
        (total, pattern) => total + (body.match(pattern)?.length ?? 0),
        0,
      );
      if (count > 0) hits.push({ file: relative(REPO_ROOT, file).split('\\').join('/'), count });
    }
  }
  return hits;
};

describe('#19599 — la descente du curseur de lecture n’a qu’UNE graphie par langage', () => {
  const hits = sweepHandSpelledDescents();

  it('BALAIE bien quelque chose — un cliquet négatif dont le relevé rend [] reste vert', () => {
    // Le contrôle que la leçon de `presence-visibility-viewer-aware-guard`
    // impose à toute garde négative : prouver d'abord que le balayage voit.
    expect(hits.length).toBeGreaterThan(0);
    for (const site of Object.keys(LAW_SITES)) {
      expect(hits.map((hit) => hit.file)).toContain(site);
    }
  });

  it('ne trouve AUCUNE graphie à la main hors des trois sites de loi', () => {
    const handSpelled = hits
      .map((hit) => hit.file)
      .filter((file) => !(file in LAW_SITES))
      .filter((file) => !FROZEN_HAND_SPELLED.includes(file));

    expect(handSpelled).toEqual([]);
  });

  it('chaque site de loi ne porte la descente qu’UNE fois', () => {
    const duplicated = hits.filter((hit) => hit.file in LAW_SITES && hit.count > 1);

    expect(duplicated).toEqual([]);
  });

  it('ne tolère aucune graphie gelée — il n’y en a pas de légitime', () => {
    expect(FROZEN_HAND_SPELLED).toEqual([]);
  });
});
