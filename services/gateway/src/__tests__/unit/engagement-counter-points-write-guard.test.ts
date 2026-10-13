/**
 * Garde de source — `EngagementCounter.points` et `count` ne s'écrivent que par
 * `EngagementCounterWrites` (#10541).
 *
 * Prisma traduit `{ increment }` et `{ decrement }` en `$set: { champ: { $add:
 * ['$champ', n] } }` sur MongoDB, et `$add` rend `null` dès que le champ est
 * absent ou `null` : l'écriture RÉUSSIT et la colonne reste `null`. Mesuré en
 * production le 2026-10-13 : 24 lignes dans cet état, 110 000 points de score
 * qu'aucun compteur ne portait plus. Le site unique écrit par un pipeline
 * `$ifNull` ; cette garde interdit le retour de l'incrément nu, où qu'il soit.
 *
 * Elle rougit sur trois formes, hors du site unique :
 *
 *  1. `points: { increment` ou `points: { decrement` dans une écriture
 *     d'`engagementCounter` ;
 *  2. `count: { increment` ou `count: { decrement` dans la même écriture — la
 *     colonne des actions suit la même loi (`count: null` relu 0 éteindrait des
 *     badges) ;
 *  3. tout fichier qui nomme la collection `EngagementCounter` dans une chaîne —
 *     la marque d'une commande brute — hors des deux déclarés ci-dessous.
 *
 * Elle ne juge PAS une écriture en valeur (`data: { points: 0 }`, le Prestige) :
 * poser un nombre ne fabrique jamais `null`.
 *
 * Une garde NÉGATIVE meurt en silence : les témoins POSITIFS prouvent que le
 * balayage atteint les fichiers qu'il prétend garder et que le motif attrape la
 * forme qu'il interdit — y compris la forme exacte retirée de `EngagementService`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const GATEWAY_SRC = join(__dirname, '../..');
const SOLE_WRITER = 'services/engagement/EngagementCounterWrites.ts';
/**
 * Les fichiers qui adressent la collection par une commande brute, et pourquoi.
 * Un troisième rougit : il se range ici avec sa raison, ou passe par le site unique.
 */
const RAW_COLLECTION_WRITERS: Readonly<Record<string, string>> = {
  [SOLE_WRITER]: 'le site unique : crédit, débit et reprise par pipeline `$ifNull`',
  'services/engagement/engagementPointsBackfill.ts':
    'la reprise #6434 : pose une VALEUR calculée hors ligne (`$set` littéral), sous garde de la valeur lue — jamais un incrément',
};
const SKIPPED_DIRS = new Set(['__tests__', 'node_modules', 'dist']);

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIPPED_DIRS.has(entry)) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts') ? [full] : [];
  });
}

/** Le texte d'un appel, de sa parenthèse ouvrante à celle qui la ferme. */
function callBody(source: string, openParen: number): string {
  let depth = 0;
  for (let index = openParen; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0) return source.slice(openParen, index + 1);
  }
  return source.slice(openParen);
}

const COUNTER_WRITE = /\bengagementCounter\s*\.\s*(?:update|updateMany|upsert|create|createMany)\s*\(/g;
const NAKED_STEP = /\b(points|count)\s*:\s*\{\s*(increment|decrement)\b/;
const RAW_COUNTER_COMMAND = /['"`]EngagementCounter['"`]/;

type Offence = { readonly file: string; readonly what: string };

/** Les écritures d'`engagementCounter` de `source` qui incrémentent ou décrémentent à nu. */
function nakedCounterSteps(source: string): readonly string[] {
  return [...source.matchAll(COUNTER_WRITE)]
    .map((match) => callBody(source, match.index + match[0].length - 1))
    .map((body) => NAKED_STEP.exec(body))
    .filter((found): found is RegExpExecArray => found !== null)
    .map((found) => `${found[1]}: { ${found[2]} }`);
}

function offences(): readonly Offence[] {
  return sourceFiles(GATEWAY_SRC).flatMap((full) => {
    const file = relative(GATEWAY_SRC, full);
    if (file === SOLE_WRITER) return [];
    const source = readFileSync(full, 'utf8');
    return nakedCounterSteps(source).map((what) => ({ file, what }));
  });
}

const rawCollectionWriters = (): readonly string[] =>
  sourceFiles(GATEWAY_SRC)
    .filter((full) => RAW_COUNTER_COMMAND.test(readFileSync(full, 'utf8')))
    .map((full) => relative(GATEWAY_SRC, full))
    .sort();

describe('garde — le compteur d’engagement ne s’incrémente que par son site unique', () => {
  it('balaie bien les sources qu’elle prétend garder', () => {
    const files = sourceFiles(GATEWAY_SRC).map((full) => relative(GATEWAY_SRC, full));

    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain('services/engagement/EngagementService.ts');
    expect(files).toContain('services/engagement/EngagementStreaks.ts');
    expect(files).toContain('services/engagement/EngagementReceipts.ts');
    expect(files).toContain('services/meesh/MeeshService.ts');
    expect(files).toContain('services/game/PrestigeService.ts');
  });

  it('attrape les formes qu’elle interdit — dont celles retirées des trois services', () => {
    const credit = `await this.prisma.engagementCounter.upsert({
      where: { userId_axisKey: { userId, axisKey: operationKey } },
      create: { userId, axisKey: operationKey, count: 1, points },
      update: { count: { increment: 1 }, points: { increment: points } },
      select: { count: true },
    });`;
    const game = 'await tx.engagementCounter.upsert({ where, create: { userId, axisKey, count: 0, points }, update: { points: { increment: points } } });';
    const takeBack = 'await prisma.engagementCounter.updateMany({ where: { userId, points: { gte: points } }, data: { count: { decrement: 1 }, points: { decrement: points } } });';
    const mint = `await tx.engagementCounter.update({
      where: { userId_axisKey: { userId, axisKey: ligne.axisKey } },
      data: { points: { decrement: ligne.points }, count: { decrement: ligne.count } },
    });`;

    expect(nakedCounterSteps(credit)).toEqual(['count: { increment }']);
    expect(nakedCounterSteps(game)).toEqual(['points: { increment }']);
    expect(nakedCounterSteps(takeBack)).toEqual(['count: { decrement }']);
    expect(nakedCounterSteps(mint)).toEqual(['points: { decrement }']);
  });

  it('laisse passer une écriture en VALEUR et les incréments d’un autre modèle', () => {
    const prestige = 'await tx.engagementCounter.updateMany({ where: { userId }, data: { points: 0 } });';
    const filter = 'await prisma.engagementCounter.findMany({ where: { userId, points: { gte: 1 } } });';
    const other = 'await prisma.gameWeekPoints.upsert({ where, create, update: { points: { increment: points } } });';

    expect(nakedCounterSteps(prestige)).toEqual([]);
    expect(nakedCounterSteps(filter)).toEqual([]);
    expect(nakedCounterSteps(other)).toEqual([]);
  });

  it('le site unique existe, et seuls les fichiers déclarés adressent la collection par une commande brute', () => {
    expect(existsSync(join(GATEWAY_SRC, SOLE_WRITER))).toBe(true);
    expect(rawCollectionWriters()).toEqual(Object.keys(RAW_COLLECTION_WRITERS).sort());
  });

  it('aucune écriture du compteur n’incrémente ni ne décrémente hors du site unique', () => {
    expect(offences()).toEqual([]);
  });
});
