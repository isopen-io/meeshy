/**
 * Garde de source — `EngagementCounter` ne s'écrit que par `EngagementCounterWrites` (#10541).
 *
 * Prisma traduit `{ increment }` et `{ decrement }` en `$set: { champ: { $add:
 * ['$champ', n] } }` sur MongoDB, et `$add` rend `null` dès que le champ est
 * absent ou `null` : l'écriture RÉUSSIT et la colonne reste `null`. Mesuré en
 * production le 2026-10-13 : 24 lignes dans cet état, 110 000 points de score
 * qu'aucun compteur ne portait plus. Le site unique écrit par un pipeline
 * `$ifNull` ; cette garde interdit qu'un autre fichier écrive le compteur.
 *
 * ## Deux règles, au grain du FICHIER
 *
 * La première version de cette garde lisait le corps de chaque appel
 * `engagementCounter.update(…)` pour y chercher `points: { increment`. L'audit
 * adversarial du 2026-10-13 l'a contournée de trois façons — un délégué aliasé
 * (`const c = tx.engagementCounter`), un accès par crochet
 * (`tx['engagementCounter']`), un objet `data` construit hors de l'appel. Une
 * analyse fine se contourne par la forme ; ces deux règles ne regardent plus la
 * forme :
 *
 *  1. **Délégué Prisma.** Un fichier qui ACCÈDE à `engagementCounter` (par point
 *     ou par crochet) ET qui contient un verbe d'écriture Prisma (`create`,
 *     `createMany`, `update`, `updateMany`, `upsert`, `delete`, `deleteMany`,
 *     appelé par point ou nommé par crochet) — où que ce soit, sur quelque
 *     modèle que ce soit — doit figurer dans `PRISMA_ALLOWLIST`, avec sa raison.
 *  2. **Commande brute.** Un fichier qui nomme `EngagementCounter` (guillemets,
 *     gabarit, constante ou simple prose) ET qui contient `runCommandRaw` doit
 *     figurer dans `RAW_ALLOWLIST`, avec sa raison.
 *
 * Les deux listes sont comparées en ÉGALITÉ : un fichier neuf rougit, une ligne
 * devenue inutile rougit aussi. Ajouter une ligne est un geste écrit et relu —
 * c'est le seul endroit où l'on juge qu'un fichier lit le compteur sans l'écrire.
 *
 * ## Ce qu'elle ne voit pas, dit pour ne pas être supposé
 *
 * Un nom de collection ASSEMBLÉ (`'Engagement' + 'Counter'`), un délégué atteint
 * par une clé calculée (`tx[nom]`), et ce que fait un fichier déjà dans une
 * liste : une ligne de liste blanche est une confiance accordée, pas une preuve.
 *
 * Une garde NÉGATIVE meurt en silence : les témoins POSITIFS prouvent que le
 * balayage atteint les fichiers qu'il prétend garder et que chaque règle attrape
 * les formes qu'elle interdit — dont les trois contournements de l'audit.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const GATEWAY_SRC = join(__dirname, '../..');
const SOLE_WRITER = 'services/engagement/EngagementCounterWrites.ts';
const SKIPPED_DIRS = new Set(['__tests__', 'node_modules', 'dist']);

/** Les fichiers qui accèdent au délégué `engagementCounter` ET portent une écriture Prisma. */
const PRISMA_ALLOWLIST: Readonly<Record<string, string>> = {
  'services/engagement/EngagementService.ts':
    'LIT le compteur (`findMany` : élan, succès composés) ; ses écritures Prisma visent les paliers, les crédits de conversation et le compte — le compteur passe par le site unique',
  'services/engagement/engagementPointsBackfill.ts':
    'LIT le compteur (`findMany`) pour planifier la reprise #6434 ; ses écritures Prisma visent les paliers (`engagementMilestone`), et sa commande brute est déclarée dans `RAW_ALLOWLIST`',
  'services/engagement/engagementScoreBackfill.ts':
    'LIT le compteur (`findMany`) pour recalculer un score ; écrit `User`, jamais le compteur',
  'services/onboarding/OnboardingService.ts': 'LIT le compteur (`findMany`, `findUnique`) ; son `update` vise un autre modèle',
};

/** Les fichiers qui nomment la collection ET émettent une commande brute. */
const RAW_ALLOWLIST: Readonly<Record<string, string>> = {
  [SOLE_WRITER]: 'le site unique : crédit, débit et reprise par pipeline `$ifNull`',
  'services/engagement/engagementPointsBackfill.ts':
    'la reprise #6434 : pose une VALEUR calculée hors ligne (`$set` littéral), sous garde de la valeur lue — jamais un incrément',
};

const PRISMA_WRITE_VERBS = 'create|createMany|update|updateMany|upsert|delete|deleteMany';
const COUNTER_DELEGATE = /(?:\.\s*engagementCounter\b|\[\s*['"`]engagementCounter['"`]\s*\])/;
const PRISMA_WRITE = new RegExp(`(?:\\.\\s*(?:${PRISMA_WRITE_VERBS})\\s*\\(|\\[\\s*['"\`](?:${PRISMA_WRITE_VERBS})['"\`]\\s*\\])`);
const COUNTER_COLLECTION = /\bEngagementCounter\b/;
const RAW_COMMAND = /runCommandRaw/;

/** Règle 1 : ce fichier tient le délégué du compteur et sait écrire par Prisma. */
const holdsCounterDelegateAndWrites = (source: string): boolean => COUNTER_DELEGATE.test(source) && PRISMA_WRITE.test(source);

/** Règle 2 : ce fichier nomme la collection et sait émettre une commande brute. */
const namesCollectionAndRunsRaw = (source: string): boolean => COUNTER_COLLECTION.test(source) && RAW_COMMAND.test(source);

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIPPED_DIRS.has(entry)) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts') ? [full] : [];
  });
}

const filesWhere = (rule: (source: string) => boolean): readonly string[] =>
  sourceFiles(GATEWAY_SRC)
    .filter((full) => rule(readFileSync(full, 'utf8')))
    .map((full) => relative(GATEWAY_SRC, full))
    .sort();

describe('garde — le compteur d’engagement ne s’écrit que par son site unique', () => {
  it('balaie bien les sources qu’elle prétend garder', () => {
    const files = sourceFiles(GATEWAY_SRC).map((full) => relative(GATEWAY_SRC, full));

    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain(SOLE_WRITER);
    expect(files).toContain('services/engagement/EngagementService.ts');
    expect(files).toContain('services/engagement/EngagementStreaks.ts');
    expect(files).toContain('services/engagement/EngagementReceipts.ts');
    expect(files).toContain('services/meesh/MeeshService.ts');
    expect(files).toContain('services/game/PrestigeService.ts');
  });

  describe('règle 1 — le délégué Prisma', () => {
    it('attrape les quatre formes retirées des services', () => {
      const credit = 'await this.prisma.engagementCounter.upsert({ where, create, update: { count: { increment: 1 }, points: { increment: points } } });';
      const game = 'await tx.engagementCounter.upsert({ where, create, update: { points: { increment: points } } });';
      const takeBack = 'await prisma.engagementCounter.updateMany({ where, data: { count: { decrement: 1 }, points: { decrement: points } } });';
      const mint = 'await tx.engagementCounter.update({ where, data: { points: { decrement: ligne.points }, count: { decrement: ligne.count } } });';

      expect([credit, game, takeBack, mint].map(holdsCounterDelegateAndWrites)).toEqual([true, true, true, true]);
    });

    it('attrape un délégué ALIASÉ — premier contournement de l’audit', () => {
      const aliased = `const counters = tx.engagementCounter;
        await counters.update({ where, data: { points: { increment: points } } });`;

      expect(holdsCounterDelegateAndWrites(aliased)).toBe(true);
    });

    it('attrape un accès par CROCHET, au délégué comme au verbe — deuxième contournement', () => {
      const bracketDelegate = "await tx['engagementCounter'].update({ where, data: { points: { increment: points } } });";
      const doubleQuoted = 'await tx["engagementCounter"].upsert(args);';
      const templated = 'await tx[`engagementCounter`].updateMany(args);';
      const bracketVerb = "await tx.engagementCounter['update'](args);";

      expect([bracketDelegate, doubleQuoted, templated, bracketVerb].map(holdsCounterDelegateAndWrites)).toEqual([true, true, true, true]);
    });

    it('attrape un objet `data` construit HORS de l’appel — troisième contournement', () => {
      const detached = `const data = { points: { increment: points } };
        const where = { userId_axisKey: { userId, axisKey } };
        const write = (delegate) => delegate.update({ where, data });
        await write(tx.engagementCounter);`;

      expect(holdsCounterDelegateAndWrites(detached)).toBe(true);
    });

    it('laisse passer une lecture seule, et une écriture qui ne tient pas le délégué', () => {
      const readOnly = 'const rows = await prisma.engagementCounter.findMany({ where: { userId, points: { gte: 1 } } });';
      const otherModel = 'await prisma.gameWeekPoints.upsert({ where, create, update: { points: { increment: points } } });';

      expect(holdsCounterDelegateAndWrites(readOnly)).toBe(false);
      expect(holdsCounterDelegateAndWrites(otherModel)).toBe(false);
    });

    it('seuls les fichiers déclarés tiennent le délégué du compteur à côté d’une écriture Prisma', () => {
      expect(filesWhere(holdsCounterDelegateAndWrites)).toEqual(Object.keys(PRISMA_ALLOWLIST).sort());
    });

    it('le site unique n’écrit jamais par le délégué Prisma', () => {
      expect(COUNTER_DELEGATE.test(readFileSync(join(GATEWAY_SRC, SOLE_WRITER), 'utf8'))).toBe(false);
    });
  });

  describe('règle 2 — la commande brute', () => {
    it('attrape la collection nommée entre guillemets, en gabarit ou par une constante', () => {
      const quoted = "await prisma.$runCommandRaw({ update: 'EngagementCounter', updates });";
      const doubleQuoted = 'await prisma.$runCommandRaw({ findAndModify: "EngagementCounter", query, update });';
      const templated = 'await prisma.$runCommandRaw({ findAndModify: `EngagementCounter`, query, update });';
      const constant = `const COUNTERS = 'EngagementCounter';
        await db.$runCommandRaw({ findAndModify: COUNTERS, query, update });`;
      const aliasedRunner = `const run = prisma.$runCommandRaw.bind(prisma);
        await run({ update: \`EngagementCounter\`, updates });`;

      expect([quoted, doubleQuoted, templated, constant, aliasedRunner].map(namesCollectionAndRunsRaw)).toEqual([true, true, true, true, true]);
    });

    it('laisse passer une commande brute sur une autre collection, et la prose sans commande', () => {
      const otherCollection = "await prisma.$runCommandRaw({ findAndModify: 'User', query, update });";
      const proseOnly = '/** Lit `EngagementCounter` par Prisma. */ export const read = (prisma) => prisma.user.findMany();';

      expect(namesCollectionAndRunsRaw(otherCollection)).toBe(false);
      expect(namesCollectionAndRunsRaw(proseOnly)).toBe(false);
    });

    it('seuls les fichiers déclarés nomment la collection à côté d’une commande brute', () => {
      expect(filesWhere(namesCollectionAndRunsRaw)).toEqual(Object.keys(RAW_ALLOWLIST).sort());
    });
  });

  it('chaque ligne de liste blanche porte sa raison', () => {
    const reasons = [...Object.values(PRISMA_ALLOWLIST), ...Object.values(RAW_ALLOWLIST)];

    expect(reasons.filter((reason) => reason.trim().length < 20)).toEqual([]);
  });
});
