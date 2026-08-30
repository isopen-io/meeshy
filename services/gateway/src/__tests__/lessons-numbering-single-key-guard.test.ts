/**
 * Le CLIQUET qui interdit à un nouveau titre de `tasks/lessons.md` de
 * partager son numéro avec un titre déjà existant (#4432).
 *
 * `tasks/lessons.md` est un fichier que PLUSIEURS sessions écrivent en
 * parallèle, et le numéro de leçon y est une clé attribuée À LA MAIN — la
 * collision n'est donc pas un accident, c'est le comportement NOMINAL du
 * procédé. Mesuré sur `4d31c906ad` : 378 titres `## Leçon …`, dont 368
 * portent un identifiant numéroté nu, et TREIZE identifiants en désignaient
 * chacun DEUX textes différents — dont un, `288`, en désignait QUATRE. Le
 * numéro est la clé de renvoi du dépôt (« leçon 261 », `tasks/lessons.md
 * § 288 » cité par `CLAUDE.md` racine) : un renvoi vers un identifiant
 * ambigu envoie le lecteur vers plusieurs textes sans moyen de savoir lequel
 * la règle invoquait.
 *
 * ### Ce que ce cliquet fait, et ce qu'il NE fait PAS
 *
 * Il n'arbitre rien et ne renumérote rien en masse — renuméroter changerait
 * les numéros que les `CLAUDE.md` CITENT, donc casserait les renvois qu'on
 * cherche à protéger (#4432). Il fige un INVENTAIRE DÉCROISSANT des
 * doublons déjà connus (`FROZEN_DUPLICATE_LESSON_NUMBERS`) et rougit dans
 * les DEUX sens :
 *
 * - un identifiant ABSENT de l'inventaire désigne deux titres ou plus ⇒
 *   COLLISION NEUVE, jamais tolérée ;
 * - un identifiant FIGÉ ne compte plus le nombre d'occurrences enregistré
 *   (résolu par un suffixe `bis`/`ter`/`quater`, ou toute autre
 *   désambiguïsation) ⇒ l'inventaire doit être DÉCRÉMENTÉ dans le MÊME
 *   commit, sans quoi le cliquet reste vert pour la mauvaise raison — un
 *   nombre figé faux ne garde plus rien.
 *
 * `288` a été désambiguïsé DANS CE COMMIT (piste 2 de #4432, sur les quatre
 * textes qui le partageaient — seul le plus ancien des quatre, celui
 * qu'invoque `CLAUDE.md` § « Visibilité de la présence », reste nu ; les
 * trois autres portent désormais `bis`/`ter`/`quater`) : il ne figure donc
 * plus dans l'inventaire figé, qui compte DOUZE identifiants — treize
 * doublons mesurés, moins celui-ci.
 *
 * ### Identifiant citable, pas seule suite de chiffres
 *
 * La clé citable n'est pas toujours l'entier nu : le dépôt suffixe déjà des
 * doublons résolus (`234` / `234 bis`, `249i`, `250i` / `250i bis`). Un
 * balayage qui tronquerait `250i` à `250` fabriquerait un FAUX doublon —
 * c'est exactement l'écart mesuré entre ce cliquet (13 identifiants) et un
 * premier balayage naïf sur `^## Leçon [0-9]+`, qui tronque tout suffixe
 * (18, #4432). L'identifiant retenu est donc le nombre, plus un `i` collé
 * s'il y en a un, plus un mot-suffixe latin s'il suit — jamais la seule
 * suite de chiffres en tête de ligne.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '../../../..');
const LESSONS_PATH = join(REPO_ROOT, 'tasks/lessons.md');

type FrozenDuplicate = {
  readonly identifier: string;
  readonly occurrences: number;
};

/**
 * Inventaire figé, DÉCROISSANT : chaque paire ci-dessous est un doublon
 * DÉJÀ CONNU (mesuré au moment de #4432), toléré parce qu'aucun `CLAUDE.md`
 * ne le cite — désambiguïser l'un d'eux retire sa ligne, jamais en ajouter
 * une. `288` n'y figure plus : voir le doc-comment de tête.
 */
const FROZEN_DUPLICATE_LESSON_NUMBERS: readonly FrozenDuplicate[] = [
  { identifier: '162', occurrences: 2 },
  { identifier: '215', occurrences: 2 },
  { identifier: '221', occurrences: 2 },
  { identifier: '243', occurrences: 2 },
  { identifier: '244', occurrences: 2 },
  { identifier: '253', occurrences: 2 },
  { identifier: '287', occurrences: 2 },
  { identifier: '289', occurrences: 2 },
  { identifier: '292', occurrences: 2 },
  { identifier: '293', occurrences: 2 },
  { identifier: '295', occurrences: 2 },
  { identifier: '349', occurrences: 2 },
];

const HEADING_LINE = /^##\s*Le[cç]on\b(.*)$/;

/**
 * Un identifiant citable est le nombre nu, éventuellement suivi d'un `i`
 * COLLÉ (`249i`), éventuellement suivi d'un mot-suffixe latin séparé par un
 * espace (`234 bis`, `250i bis`, `288 ter`) — la convention déjà en usage
 * dans le fichier. Le reste de la ligne (le titre) n'est jamais consulté :
 * le tronquer y ferait naître un faux doublon (voir doc-comment de tête).
 */
const IDENTIFIER = /^\s*([0-9]+)(i)?(?:\s+(bis|ter|quater|quinquies)\b)?/;

type LessonHeading = {
  readonly line: number;
  readonly identifier: string | null;
};

const toIdentifier = (rest: string): string | null => {
  const match = IDENTIFIER.exec(rest);
  if (!match || match[0].trim().length === 0) return null;
  const [, digits, glued, suffix] = match;
  return digits + (glued ?? '') + (suffix ? ` ${suffix}` : '');
};

const readLessonHeadings = (): readonly LessonHeading[] =>
  readFileSync(LESSONS_PATH, 'utf8')
    .split('\n')
    .flatMap((raw, index): readonly LessonHeading[] => {
      const heading = HEADING_LINE.exec(raw);
      if (!heading) return [];
      return [{ line: index + 1, identifier: toIdentifier(heading[1]) }];
    });

const groupByIdentifier = (
  headings: readonly LessonHeading[],
): ReadonlyMap<string, readonly number[]> => {
  const grouped = new Map<string, number[]>();
  for (const heading of headings) {
    if (heading.identifier === null) continue;
    const lines = grouped.get(heading.identifier);
    if (lines) {
      lines.push(heading.line);
    } else {
      grouped.set(heading.identifier, [heading.line]);
    }
  }
  return grouped;
};

/** Plancher de non-vacuité : loin sous 368, mais assez haut pour qu'un balayage cassé ne le franchisse jamais par accident. */
const MINIMUM_EXPECTED_HEADINGS = 300;
const MINIMUM_EXPECTED_NUMBERED_HEADINGS = 300;

describe("le numéro d'une leçon de tasks/lessons.md identifie un texte UNIQUE, hors inventaire figé décroissant (#4432)", () => {
  it('voit bien des titres dans tasks/lessons.md — sinon un chemin cassé passerait au vert', () => {
    expect(readLessonHeadings().length).toBeGreaterThanOrEqual(MINIMUM_EXPECTED_HEADINGS);
  });

  it("voit bien des identifiants NUMÉROTÉS — sinon une regex d'extraction cassée passerait au vert", () => {
    const numbered = readLessonHeadings().filter((heading) => heading.identifier !== null);
    expect(numbered.length).toBeGreaterThanOrEqual(MINIMUM_EXPECTED_NUMBERED_HEADINGS);
  });

  it("n'a aucune collision NEUVE — un identifiant hors de l'inventaire figé ne désigne qu'UN texte", () => {
    const frozenIdentifiers = new Set(FROZEN_DUPLICATE_LESSON_NUMBERS.map((entry) => entry.identifier));
    const grouped = groupByIdentifier(readLessonHeadings());
    const newCollisions = [...grouped.entries()]
      .filter(([identifier, lines]) => lines.length > 1 && !frozenIdentifiers.has(identifier))
      .map(([identifier, lines]) => `« ${identifier} » : lignes ${lines.join(', ')}`);
    expect(newCollisions).toEqual([]);
  });

  it("l'inventaire figé est à jour — un doublon RÉSOLU doit être décrémenté dans le MÊME commit", () => {
    const grouped = groupByIdentifier(readLessonHeadings());
    const staleEntries = FROZEN_DUPLICATE_LESSON_NUMBERS.filter((entry) => {
      const actual = grouped.get(entry.identifier)?.length ?? 0;
      return actual !== entry.occurrences;
    }).map((entry) => {
      const actual = grouped.get(entry.identifier)?.length ?? 0;
      return `« ${entry.identifier} » : figé à ${entry.occurrences} occurrence(s), ${actual} trouvée(s)`;
    });
    expect(staleEntries).toEqual([]);
  });
});
