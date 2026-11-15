// packages/shared/__tests__/ci/ios-test-shards.test.ts
//
// #9692 — la suite MeeshyTests tourne en tranches parallèles, et c'est
// `scripts/ci/ios-test-shards.mjs` qui décide quelle classe va où. Une classe
// oubliée par la répartition ne rougit nulle part : elle cesse simplement
// d'être exécutée, et la CI reste verte en vérifiant moins. Ce témoin juge la
// répartition sans macOS — sur des fixtures, puis sur l'arborescence réelle.
//
// Placement : la suite `shared` tourne sur CHAQUE PR (même raison que ses
// voisins `ios-pr-compile-gate.test.ts` et `ios-gates-ci-parity.test.ts`).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — module ESM JavaScript sans déclarations, exécuté tel quel par la CI
import * as shards from '../../../../scripts/ci/ios-test-shards.mjs';

type ClassWeight = { readonly name: string; readonly tests: number; readonly methods?: readonly string[] };
type Target = { readonly name: string; readonly classes: readonly ClassWeight[]; readonly swiftTesting: number };
type Shard = {
  readonly index: number;
  readonly classes: readonly string[];
  readonly tests: number | null;
  readonly weight: number | null;
};
type Plan = { readonly mode: 'only' | 'full'; readonly targets: readonly string[]; readonly shards: readonly Shard[] };
type PlanInput = {
  targets: readonly Target[];
  count: number;
  only?: string;
  skipped?: readonly string[];
  timings?: Record<string, number>;
};

const enumerateClasses = shards.enumerateClasses as (files: Record<string, string>) => ClassWeight[];
const enumerateTarget = shards.enumerateTarget as (files: Record<string, string>) => Omit<Target, 'name'>;
const plan = shards.plan as (input: PlanInput) => Plan;
const selectionArgs = shards.selectionArgs as (built: Plan, index: number) => string[];
const projectExcludes = shards.projectExcludes as (yml: string) => string[];
const readTargets = shards.readTargets as (root: string, suite: string) => Target[];
const readTimings = shards.readTimings as (root: string, suite: string) => Record<string, number>;
const timingsFromLog = shards.timingsFromLog as (log: string, targets: readonly Target[]) => Record<string, number>;
const timingsFromTests = shards.timingsFromTests as (json: unknown, targets: readonly Target[]) => Record<string, number>;
const SUITES = shards.SUITES as Record<string, { skipped: readonly string[] }>;
const ALWAYS_SKIPPED = shards.ALWAYS_SKIPPED as readonly string[];

const single = (classes: readonly ClassWeight[]): Target[] => [{ name: 'MeeshyTests', classes, swiftTesting: 0 }];

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

const fixture = (): Record<string, string> => ({
  'A.swift': [
    'import XCTest',
    '@MainActor',
    'final class AlphaTests: XCTestCase {',
    '    func testOne() {}',
    '    func testTwo() async throws {}',
    '    func helper() {}',
    '    func testWithArgument(_ x: Int) {}',
    '}',
    'private struct Helper {',
    '    func testNotATest() {}',
    '}',
  ].join('\n'),
  'B.swift': [
    '@MainActor final class BetaTests: XCTestCase {',
    '  func testA() {}',
    '}',
    'final class MockThing: SomeProviding {',
    '  func testFake() {}',
    '}',
  ].join('\n'),
  'C.swift': [
    'extension AlphaTests {',
    '    func testThree() {}',
    '}',
    'extension String {',
    '    func testNope() {}',
    '}',
    'class GammaTests : XCTestCase, Sendable { func test_x() {} ; func test_y() {} }',
  ].join('\n'),
});

describe('énumération des classes MeeshyTests', () => {
  it('trouve les sous-classes de XCTestCase, attributs et modificateurs compris', () => {
    expect(enumerateClasses(fixture()).map((c) => c.name)).toEqual(['AlphaTests', 'BetaTests', 'GammaTests']);
  });

  it('pèse chaque classe par ses `func test…()`, extensions d’autres fichiers comprises', () => {
    expect(enumerateClasses(fixture())).toEqual([
      { name: 'AlphaTests', tests: 3, methods: ['testOne', 'testThree', 'testTwo'] },
      { name: 'BetaTests', tests: 1, methods: ['testA'] },
      { name: 'GammaTests', tests: 2, methods: ['test_x', 'test_y'] },
    ]);
  });

  it('lit les exclusions .swift de la cible dans project.yml', () => {
    const yml = readFileSync(`${REPO}apps/ios/project.yml`, 'utf8');
    expect(projectExcludes(yml)).toContain('UI/BubbleExpandableTextUITests.swift');
  });
});

describe('répartition en tranches', () => {
  const classes = (): ClassWeight[] =>
    Array.from({ length: 40 }, (_, i) => ({ name: `Suite${String(i).padStart(2, '0')}Tests`, tests: (i * 7) % 23 + 1 }));

  it('attribue chaque classe à exactement une tranche', () => {
    const built = plan({ targets: single(classes()), count: 4 });
    const assigned = built.shards.flatMap((s) => s.classes).sort();
    expect(assigned).toEqual(classes().map((c) => `MeeshyTests/${c.name}`).sort());
  });

  it('est déterministe et ne dépend pas de l’ordre de lecture', () => {
    const a = plan({ targets: single(classes()), count: 4 });
    const b = plan({ targets: single([...classes()].reverse()), count: 4 });
    expect(b).toEqual(a);
  });

  it('équilibre les tranches à la plus grosse classe près', () => {
    const built = plan({ targets: single(classes()), count: 4 });
    const weights = built.shards.map((s) => s.weight ?? 0);
    const heaviest = Math.max(...classes().map((c) => c.tests));
    expect(Math.max(...weights) - Math.min(...weights)).toBeLessThanOrEqual(heaviest);
  });

  it('écarte les suites que la CI saute toujours', () => {
    const built = plan({
      targets: single([...classes(), { name: 'SearchPerformanceTests', tests: 99 }]),
      count: 4,
      skipped: ALWAYS_SKIPPED,
    });
    expect(built.shards.flatMap((s) => s.classes)).not.toContain('MeeshyTests/SearchPerformanceTests');
  });

  /**
   * La dernière tranche est le RESTE : tout MeeshyTests moins les autres
   * tranches. Une classe que l'énumération manquerait y tourne quand même.
   */
  it('fait de la dernière tranche le reste de la cible', () => {
    const built = plan({ targets: single(classes()), count: 4 });
    const last = selectionArgs(built, 4);
    expect(last[0]).toBe('-only-testing:MeeshyTests');
    const others = built.shards.slice(0, 3).flatMap((s) => s.classes);
    expect(last.slice(1)).toEqual(others.map((id) => `-skip-testing:${id}`));
    expect(selectionArgs(built, 1)).toEqual(built.shards[0].classes.map((id) => `-only-testing:${id}`));
  });

  it('avec only_testing, une seule tranche porte exactement ces suites', () => {
    const built = plan({ targets: single(classes()), count: 4, only: ' FooTests, BarTests ' });
    expect(built.shards).toHaveLength(1);
    expect(selectionArgs(built, 1)).toEqual(['-only-testing:MeeshyTests/FooTests', '-only-testing:MeeshyTests/BarTests']);
  });

  it('refuse un nom de suite mal formé', () => {
    expect(() => plan({ targets: single(classes()), count: 4, only: 'Foo;rm -rf' })).toThrow(/suite invalide/);
  });
});

describe('plusieurs cibles, Swift Testing et durées mesurées (SDK)', () => {
  const targets = (): Target[] => [
    { name: 'CoreTests', classes: [{ name: 'ATests', tests: 4 }, { name: 'BTests', tests: 4 }], swiftTesting: 6 },
    { name: 'UITests', classes: [{ name: 'CTests', tests: 2 }, { name: 'SlowExportTests', tests: 2 }], swiftTesting: 0 },
  ];

  it('compte les @Test Swift Testing, que seule la tranche du reste exécute', () => {
    expect(enumerateTarget({ 'S.swift': '@Suite struct X {\n  @Test func a() {}\n  @Test(arguments: [1]) func b(x: Int) {}\n}' }).swiftTesting).toBe(2);
  });

  it('préfixe chaque classe de sa cible et fait du reste TOUTES les cibles', () => {
    const built = plan({ targets: targets(), count: 2 });
    expect(selectionArgs(built, 2).slice(0, 2)).toEqual(['-only-testing:CoreTests', '-only-testing:UITests']);
    expect(built.shards.flatMap((s) => s.classes).every((id) => /^(CoreTests|UITests)\//.test(id))).toBe(true);
  });

  it('pèse par la durée MESURÉE quand elle est connue', () => {
    const built = plan({ targets: targets(), count: 2, timings: { 'UITests/SlowExportTests': 600, 'CoreTests/ATests': 4 } });
    const withSlow = built.shards.find((s) => s.classes.includes('UITests/SlowExportTests'));
    expect(withSlow?.classes).toEqual(['UITests/SlowExportTests']);
  });

  /**
   * Une suite d'export vidéo du SDK dure 9 à 11 min pour cinq tests : entière,
   * elle fixe à elle seule la durée de sa tranche. Elle se découpe en méthodes.
   */
  it('découpe en méthodes une classe plus lourde qu’une demi-tranche', () => {
    const heavy: Target[] = [
      {
        name: 'UITests',
        classes: [
          { name: 'ExportTests', tests: 4, methods: ['testA', 'testB', 'testC', 'testD'] },
          ...Array.from({ length: 12 }, (_, i) => ({ name: `Light${i}Tests`, tests: 1, methods: ['testX'] })),
        ],
        swiftTesting: 0,
      },
    ];
    const built = plan({ targets: heavy, count: 4, timings: { 'UITests/ExportTests': 400 } });
    const ids = built.shards.flatMap((s) => s.classes);
    expect(ids).not.toContain('UITests/ExportTests');
    expect(ids.filter((id) => id.startsWith('UITests/ExportTests/')).sort()).toEqual(
      ['testA', 'testB', 'testC', 'testD'].map((m) => `UITests/ExportTests/${m}`),
    );
    const shardsWithExport = built.shards.filter((s) => s.classes.some((id) => id.startsWith('UITests/ExportTests/')));
    expect(shardsWithExport).toHaveLength(4);
  });

  it('rattache un nom nu à la cible qui déclare la classe', () => {
    const built = plan({ targets: targets(), count: 4, only: 'CTests,CoreTests/ATests' });
    expect(selectionArgs(built, 1)).toEqual(['-only-testing:UITests/CTests', '-only-testing:CoreTests/ATests']);
  });

  it('tire les durées par classe du JSON de xcresulttool, le reste sous Cible/*', () => {
    const json = {
      testNodes: [
        {
          nodeType: 'Test Plan',
          name: 'Plan',
          children: [
            {
              nodeType: 'Unit test bundle',
              name: 'CoreTests',
              children: [
                { nodeType: 'Test Suite', name: 'ATests', durationInSeconds: 1.5 },
                { nodeType: 'Test Suite', name: 'SwiftTestingSuite', duration: '2s' },
                { nodeType: 'Test Suite', name: 'BTests', children: [{ nodeType: 'Test Case', name: 't()', durationInSeconds: 0.25 }] },
              ],
            },
          ],
        },
      ],
    };
    expect(timingsFromTests(json, targets())).toEqual({ 'CoreTests/ATests': 1.5, 'CoreTests/*': 2, 'CoreTests/BTests': 0.3 });
  });
});

describe('durées tirées du journal verbeux de xcodebuild', () => {
  it('lit la durée de chaque classe connue, préfixée de son bundle', () => {
    const log = [
      "Test Suite 'Selected tests' started at 2026-10-08 15:16:20.196.",
      "Test Suite 'CoreTests.xctest' started at 2026-10-08 15:16:20.201.",
      "Test Suite 'ATests' started at 2026-10-08 15:16:20.201.",
      "Test Suite 'ATests' passed at 2026-10-08 15:16:20.321.",
      '\t Executed 4 tests, with 0 failures (0 unexpected) in 0.100 (0.120) seconds',
      "Test Suite 'BTests' failed at 2026-10-08 15:16:21.321.",
      '\t Executed 2 tests, with 1 failure (0 unexpected) in 2.00 (2.04) seconds',
      "Test Suite 'CoreTests.xctest' failed at 2026-10-08 15:18:15.460.",
      '\t Executed 6 tests, with 1 failure (0 unexpected) in 2.1 (2.2) seconds',
    ].join('\n');
    const targets: Target[] = [
      { name: 'CoreTests', classes: [{ name: 'ATests', tests: 4 }, { name: 'BTests', tests: 2 }], swiftTesting: 0 },
    ];
    expect(timingsFromLog(log, targets)).toEqual({ 'CoreTests/ATests': 0.1, 'CoreTests/BTests': 2 });
  });
});

describe('répartition de l’arborescence réelle', () => {
  it.each(['ios', 'sdk'])('%s : des centaines de classes — une liste vide verdirait toute seule', (suite) => {
    const classes = readTargets(REPO, suite).flatMap((t) => t.classes);
    expect(classes.length).toBeGreaterThan(500);
  });

  it.each(['ios', 'sdk'])('%s : couvre toutes les classes exécutables, en tranches toutes non vides', (suite) => {
    const targets = readTargets(REPO, suite);
    const { skipped } = SUITES[suite];
    const built = plan({ targets, count: 4, skipped, timings: readTimings(REPO, suite) });
    const runnable = targets
      .flatMap((t) => t.classes.filter((c) => !skipped.includes(c.name)).map((c) => `${t.name}/${c.name}`))
      .sort();
    const classOf = (id: string): string => id.split('/').slice(0, 2).join('/');
    expect([...new Set(built.shards.flatMap((s) => s.classes).map(classOf))].sort()).toEqual(runnable);
    for (const shard of built.shards) expect(shard.classes.length).toBeGreaterThan(0);
  });

  it('garde ALWAYS_SKIPPED égale aux -skip-testing de ios.yml', () => {
    const yml = readFileSync(`${REPO}.github/workflows/ios.yml`, 'utf8');
    const skipped = [...yml.matchAll(/^\s*-skip-testing:MeeshyTests\/(\w+)/gm)].map((m) => m[1]);
    expect([...new Set(skipped)].sort()).toEqual([...ALWAYS_SKIPPED].sort());
  });
});
