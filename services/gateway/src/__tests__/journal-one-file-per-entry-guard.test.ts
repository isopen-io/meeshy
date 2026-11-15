/**
 * Un journal du dépôt (leçons, décisions) = un fichier par entrée (#7711).
 *
 * `tasks/lessons.md` (2,3 Mo, 823 entrées) et les `decisions.md` étaient
 * des fichiers UNIQUES que toutes les sessions parallèles écrivaient : un
 * point de collision permanent, et une lecture « au démarrage » qui vidait
 * la fenêtre de contexte. Chaque entrée vit désormais dans son fichier ;
 * le fichier d'origine ne garde que son préambule et la CARTE des entrées
 * antérieures, pour que les renvois datés (« `tasks/lessons.md` § 288 »)
 * se résolvent encore.
 *
 * Cette garde tient les trois invariants qui empêchent le retour du hub :
 * - la carte ne reçoit plus d'entrée (aucun titre `## ` hors bloc de code) ;
 * - chaque lien de la carte mène à un fichier qui existe ;
 * - chaque fichier du dossier est UNE entrée (sa première ligne est son titre `## `).
 *
 * `apps/web/decisions.md` n'y figure pas encore : une branche vivante
 * l'écrivait au moment du découpage (règle de la branche poussée tôt,
 * #5243) — il suit dans un lot à lui.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';

const REPO_ROOT = join(__dirname, '../../../..');

type Journal = {
  readonly map: string;
  readonly dir: string;
  readonly minimumEntries: number;
};

const JOURNALS: readonly Journal[] = [
  { map: 'tasks/lessons.md', dir: 'tasks/lessons', minimumEntries: 800 },
  { map: 'apps/ios/decisions.md', dir: 'apps/ios/decisions', minimumEntries: 30 },
  { map: 'packages/MeeshySDK/decisions.md', dir: 'packages/MeeshySDK/decisions', minimumEntries: 20 },
  { map: 'packages/shared/decisions.md', dir: 'packages/shared/decisions', minimumEntries: 20 },
  { map: 'services/gateway/decisions.md', dir: 'services/gateway/decisions', minimumEntries: 70 },
  { map: 'services/translator/decisions.md', dir: 'services/translator/decisions', minimumEntries: 15 },
];

const FENCE = /^\s*(```|~~~)/;
const MAP_LINK = /\]\(([^)]+\.md)\)/g;

const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), 'utf8');

const headingsOutsideFences = (text: string): readonly string[] =>
  text.split('\n').reduce<{ readonly inFence: boolean; readonly found: readonly string[] }>(
    (state, line) => {
      if (FENCE.test(line)) return { ...state, inFence: !state.inFence };
      if (!state.inFence && line.startsWith('## ')) return { ...state, found: [...state.found, line] };
      return state;
    },
    { inFence: false, found: [] },
  ).found;

const entryFiles = (journal: Journal): readonly string[] =>
  readdirSync(join(REPO_ROOT, journal.dir)).filter((file) => file.endsWith('.md'));

describe.each(JOURNALS)('$map — un fichier par entrée (#7711)', (journal) => {
  it('la carte ne reçoit plus d’entrée : aucun titre `## ` hors bloc de code', () => {
    expect(headingsOutsideFences(read(journal.map))).toEqual([]);
  });

  it('chaque lien de la carte mène à un fichier qui existe', () => {
    const base = dirname(join(REPO_ROOT, journal.map));
    const targets = [...read(journal.map).matchAll(MAP_LINK)].map((match) => match[1] ?? '');
    expect(targets.length).toBeGreaterThanOrEqual(journal.minimumEntries);
    expect(targets.filter((target) => !existsSync(join(base, target)))).toEqual([]);
  });

  it('chaque fichier du dossier est UNE entrée : sa première ligne est son titre `## `', () => {
    const files = entryFiles(journal);
    expect(files.length).toBeGreaterThanOrEqual(journal.minimumEntries);
    const malformed = files.filter((file) => {
      const text = read(`${journal.dir}/${file}`);
      return !text.startsWith('## ') || headingsOutsideFences(text).length !== 1;
    });
    expect(malformed).toEqual([]);
  });
});
