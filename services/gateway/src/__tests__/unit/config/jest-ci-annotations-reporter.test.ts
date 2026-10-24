/**
 * Une suite qui tombe en CI se NOMME dans une annotation GitHub (#12036).
 *
 * Les journaux des jobs ne sont pas lisibles depuis les sessions distantes : le
 * stockage des logs est refusé par le proxy, et l'annotation du job se limite à
 * `test:coverage exited (1)`. Une suite que le worker n'a pas pu exécuter (tas
 * épuisé, worker tué) ou un témoin rouge restaient donc anonymes. Le reporter
 * émet une commande `::error` par échec, lisible par l'API des check-runs.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

type Annotations = (results: unknown, rootDir: string) => readonly string[];

const GATEWAY_ROOT = join(__dirname, '../../../..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { annotationsFor } = require(join(GATEWAY_ROOT, 'jest-ci-annotations-reporter.js')) as {
  annotationsFor: Annotations;
};

const assertion = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  ancestorTitles: ['le cliquet tsc'],
  title: 'ne dépasse jamais le plafond',
  status: 'passed',
  failureMessages: [] as string[],
  ...overrides,
});

const suite = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  testFilePath: join(GATEWAY_ROOT, 'src/__tests__/a.test.ts'),
  testResults: [assertion()],
  ...overrides,
});

const run = (testResults: readonly unknown[]) => ({ testResults });

describe('annotationsFor — chaque échec de la suite devient une annotation ::error', () => {
  it("une suite verte n'émet rien", () => {
    expect(annotationsFor(run([suite()]), GATEWAY_ROOT)).toEqual([]);
  });

  it('un témoin rouge est nommé par son fichier et son titre complet', () => {
    const lignes = annotationsFor(
      run([
        suite({
          testResults: [
            assertion({ status: 'failed', failureMessages: ['Expected: > 1000\nReceived: 0'] }),
          ],
        }),
      ]),
      GATEWAY_ROOT
    );
    expect(lignes).toEqual([
      '::error title=src/__tests__/a.test.ts › le cliquet tsc › ne dépasse jamais le plafond::Expected: > 1000%0AReceived: 0',
    ]);
  });

  it("une suite que le worker n'a pas pu exécuter est nommée avec la raison", () => {
    const lignes = annotationsFor(
      run([
        suite({
          testResults: [],
          testExecError: { message: 'A jest worker process (pid=4107) was terminated by another process: signal=SIGKILL' },
        }),
      ]),
      GATEWAY_ROOT
    );
    expect(lignes).toEqual([
      '::error title=src/__tests__/a.test.ts › Test suite failed to run::A jest worker process (pid=4107) was terminated by another process: signal=SIGKILL',
    ]);
  });

  it("les caractères qui terminent une commande GitHub sont échappés, et les couleurs ANSI retirées", () => {
    const [ligne] = annotationsFor(
      run([
        suite({
          testResults: [
            assertion({ title: 'a, b: c', status: 'failed', failureMessages: ['\u001b[31m100%\u001b[39m\r\nfin'] }),
          ],
        }),
      ]),
      GATEWAY_ROOT
    );
    expect(ligne).toBe(
      '::error title=src/__tests__/a.test.ts › le cliquet tsc › a%2C b%3A c::100%25%0D%0Afin'
    );
  });

  it('un message démesuré est tronqué, pour que l’annotation reste publiable', () => {
    const [ligne] = annotationsFor(
      run([suite({ testResults: [assertion({ status: 'failed', failureMessages: ['x'.repeat(10_000)] })] })]),
      GATEWAY_ROOT
    );
    expect(ligne.length).toBeLessThan(4_200);
  });
});
