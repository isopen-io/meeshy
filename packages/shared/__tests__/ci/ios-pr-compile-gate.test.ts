// packages/shared/__tests__/ci/ios-pr-compile-gate.test.ts
//
// Le dépôt n'avait aucun gate qui réponde à « le Swift que je viens d'écrire
// compile-t-il ? » au moment de la PR. `ios-tests.yml` a bien porté un
// déclencheur `pull_request`, retiré le 2026-07-27 : la SUITE COMPLÈTE (29-45 min
// de job, plus 24-49 min de file d'attente) saturait le plafond de concurrence
// macOS du compte dès 5-6 PR simultanées. Le retrait était juste ; ce qu'il a
// emporté avec lui — la compilation — ne coûtait pourtant presque rien, et rien
// ne l'a signalé. Des cycles entiers ont ensuite mergé du Swift que rien n'avait
// compilé (cf. `tasks/todo.md`, têtes des cycles 80 à 83).
//
// Ce que ce garde protège : le gate rétabli doit rester COMPILE SEULE sur une PR.
// Les deux postes qui avaient saturé la file sont le provisionnement du runtime
// iOS 18.2 (~7 min, réseau) et l'exécution des tests (~8 min) ; les rebrancher
// sur `pull_request` — par inadvertance, en dégageant un `if:` — recréerait
// exactement la panne de juillet, et le dirait aussi peu que son retrait.
//
// Placement : le garde vit ici parce que la suite `shared` est celle qui tourne
// sur CHAQUE PR (`.github/workflows/ci.yml`, matrice `test`), donc la seule qui
// puisse constater la disparition du gate iOS. Même raison que
// `esm-relative-imports.test.ts`, garde d'hygiène de dépôt déjà hébergé ici.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORKFLOW_PATH = fileURLToPath(
  new URL('../../../../.github/workflows/ios-tests.yml', import.meta.url),
);

/**
 * Les commentaires du workflow CITENT les motifs cherchés ici (l'en-tête décrit
 * le job compile-seule en toutes lettres). Les retirer avant toute assertion
 * évite qu'une prose satisfasse un garde que le YAML ne satisfait plus.
 */
const withoutComments = (yaml: string): string =>
  yaml
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

const WORKFLOW = withoutComments(readFileSync(WORKFLOW_PATH, 'utf8'));

const SIMULATOR_STEP = 'Provision iOS 18.2 simulator';
const BUILD_STEP = 'Build for testing';
const TEST_STEP = 'Run iOS tests (without building)';

type Step = { readonly name: string; readonly condition: string; readonly body: string };

const STEP_START = /^ {6}- /;

const steps = (yaml: string): readonly Step[] => {
  const lines = yaml.split('\n');
  const starts = lines.flatMap((line, index) => (STEP_START.test(line) ? [index] : []));
  return starts.map((start, position) => {
    const end = position + 1 < starts.length ? starts[position + 1] : lines.length;
    const body = lines.slice(start, end).join('\n');
    return {
      name: (/^\s*(?:- )?name:\s*(.+)$/m.exec(body)?.[1] ?? '').trim().replace(/^['"]|['"]$/g, ''),
      condition: (/^\s*if:\s*(.+)$/m.exec(body)?.[1] ?? '').trim(),
      body,
    };
  });
};

const stepNamed = (name: string): Step => {
  const found = steps(WORKFLOW).find((step) => step.name === name);
  if (!found) throw new Error(`Étape introuvable dans ios-tests.yml : « ${name} »`);
  return found;
};

/** Bloc `pull_request:` du mapping `on:`, jusqu'à la clé de même niveau suivante. */
const pullRequestTrigger = (): string => {
  const start = WORKFLOW.search(/^ {2}pull_request:$/m);
  if (start < 0) return '';
  const rest = WORKFLOW.slice(start).split('\n').slice(1);
  const end = rest.findIndex((line) => /^ {0,2}\S/.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
};

describe('gate iOS de compilation au temps de la PR', () => {
  it('déclenche sur les pull requests — le gate retiré le 2026-07-27 est rétabli', () => {
    expect(pullRequestTrigger()).not.toBe('');
  });

  it('couvre les deux arbres de sources Swift du dépôt', () => {
    const trigger = pullRequestTrigger();
    expect(trigger).toContain('apps/ios/**');
    expect(trigger).toContain('packages/MeeshySDK/**');
  });

  /**
   * Sans `ready_for_review`, une PR ouverte en brouillon puis marquée prête
   * n'émettrait plus aucun événement : le gate serait sauté sans le dire.
   */
  it('réagit au passage de brouillon à prêt pour relecture', () => {
    expect(pullRequestTrigger()).toContain('ready_for_review');
  });

  /**
   * La bascule ne se lit plus sur l'événement mais sur la PORTÉE résolue par le
   * job `scope` (2026-08-15). L'ancienne règle — « compile seule si et seulement
   * si l'événement est `pull_request` » — laissait la suite complète s'exécuter
   * sur CHAQUE poussée de `dev`, soit les deux postes chers payés en continu.
   * La nouvelle inverse le défaut : compilation partout, tests sur demande.
   */
  it('dérive la bascule compile-seule de la portée résolue, non de l’événement', () => {
    expect(WORKFLOW).toMatch(
      /COMPILE_ONLY:\s*\$\{\{\s*needs\.scope\.outputs\.run_tests\s*!=\s*'true'\s*\}\}/,
    );
  });

  it('fait dépendre le job macOS de la résolution de portée', () => {
    expect(WORKFLOW).toMatch(/^ {4}needs: scope$/m);
  });

  it('ne provisionne aucun runtime de simulateur sur une PR (~7 min, réseau)', () => {
    expect(stepNamed(SIMULATOR_STEP).condition).toContain("env.COMPILE_ONLY != 'true'");
  });

  it("n'exécute aucun test sur une PR (~8 min) — c'est ce qui saturait la file", () => {
    expect(stepNamed(TEST_STEP).condition).toContain("env.COMPILE_ONLY != 'true'");
  });

  /**
   * `build-for-testing` compile les cibles de test EN PLUS de l'app : un fichier
   * de test qui ne compile pas doit rougir ici, sinon le gate ne couvre que la
   * moitié du Swift que la routine écrit.
   */
  it('compile bel et bien, y compris les cibles de test, sur une PR', () => {
    const build = stepNamed(BUILD_STEP);
    expect(build.condition).toBe('');
    expect(build.body).toContain('build-for-testing');
  });

  it('vise une destination générique en compile-seule — aucun simulateur requis', () => {
    expect(stepNamed(BUILD_STEP).body).toContain('generic/platform=iOS Simulator');
  });

  /**
   * Une destination générique compile TOUTES les architectures du SDK simulateur
   * (arm64 + x86_64) là où `ONLY_ACTIVE_ARCH=YES` n'a plus d'architecture active
   * à quoi se réduire — soit le double du poste le plus cher du job. Les runners
   * `macos-15` sont Apple Silicon : l'arche doit être épinglée explicitement.
   */
  it('épingle arm64 en compile-seule plutôt que de compiler deux architectures', () => {
    expect(stepNamed(BUILD_STEP).body).toContain('ARCHS=arm64');
  });

  it('laisse la suite complète intacte, exécutable quand la portée la demande', () => {
    expect(stepNamed(TEST_STEP).body).toContain('test-without-building');
    expect(WORKFLOW).toMatch(/^ {2}push:$/m);
  });
});

/**
 * La demande d'exécution s'écrit dans le SUJET DU COMMIT. Trois mots-clés, et
 * ils sont la seule porte : un mot-clé perdu (renommé, mal orthographié dans le
 * YAML) ne rendrait rien rouge — les tests cesseraient simplement de pouvoir
 * être demandés, et la CI resterait verte en ne vérifiant plus rien. C'est la
 * forme exacte du défaut de juillet, appliquée cette fois à l'opt-in.
 */
describe('opt-in des tests iOS par le sujet du commit', () => {
  const scopeJob = (): string => {
    const start = WORKFLOW.search(/^ {2}scope:$/m);
    if (start < 0) return '';
    const rest = WORKFLOW.slice(start).split('\n').slice(1);
    const end = rest.findIndex((line) => /^ {2}\S/.test(line));
    return (end < 0 ? rest : rest.slice(0, end)).join('\n');
  };

  it('déclare le job de résolution de portée', () => {
    expect(scopeJob()).not.toBe('');
  });

  it('reconnaît les trois mots-clés convenus', () => {
    const job = scopeJob();
    for (const keyword of ['smoke test', 'run test', 'to test']) {
      expect(job).toContain(keyword);
    }
  });

  it('compare sans tenir compte de la casse', () => {
    expect(scopeJob()).toMatch(/grep -qiE/);
  });

  /**
   * Sur un événement `pull_request`, `github.sha` désigne le commit de MERGE
   * synthétique, dont le sujet est « Merge <sha> into <sha> » — il ne contiendra
   * jamais le mot-clé. Lire la tête de la branche est donc la condition pour que
   * l'opt-in fonctionne du tout sur une PR.
   */
  it('lit le sujet sur le commit de tête de la branche, pas sur le commit de merge', () => {
    expect(scopeJob()).toContain('github.event.pull_request.head.sha || github.sha');
  });

  it('force la suite complète sur un déclenchement manuel', () => {
    expect(scopeJob()).toMatch(/workflow_dispatch.*\n[\s\S]*?run_tests=true/);
  });

  /**
   * `main` n'est pas une branche de travail : c'est ce qui part en production,
   * et rien n'y est « sur demande ». Le reste du dépôt suit déjà cette logique
   * (`ci.yml` bâtit tout sur chaque poussée `main` sans condition) ; le Swift
   * était le seul arbre à y échapper. C'est ce trou qui a laissé 17 échecs
   * hérités survivre des semaines — cf. run 31874465536.
   */
  it('force la suite complète sur une poussée vers main, sans opt-in', () => {
    expect(scopeJob()).toMatch(
      /event_name \}\}" = "push"[\s\S]*?refs\/heads\/main[\s\S]*?run_tests=true/,
    );
  });

  it('déclenche bien sur les poussées vers main — sans quoi la règle serait morte', () => {
    const pushTrigger = (): string => {
      const start = WORKFLOW.search(/^ {2}push:$/m);
      if (start < 0) return '';
      const rest = WORKFLOW.slice(start).split('\n').slice(1);
      const end = rest.findIndex((line) => /^ {2}\S/.test(line));
      return (end < 0 ? rest : rest.slice(0, end)).join('\n');
    };
    expect(pushTrigger()).toMatch(/^\s*- main$/m);
  });

  it('tourne hors du pool macOS — la ressource rare ne lit pas un log git', () => {
    expect(scopeJob()).toContain('runs-on: ubuntu-latest');
  });
});
