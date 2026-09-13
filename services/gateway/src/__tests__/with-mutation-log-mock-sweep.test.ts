/**
 * Le cliquet des doubles de `utils/withMutationLog` — inventaire VIDE (#6294).
 *
 * 41 fichiers de test mockaient ce module en ne rendant que `withMutationLog`,
 * laissant `MutationResultGone` (une CLASSE dont les routes font
 * `instanceof`) et `withMutationOutcome` (le chemin réel du repost) à
 * `undefined`. Le piège est LATENT par construction : il ne casse rien le
 * jour où le double est écrit, seulement le jour où une route adopte un
 * export voisin — #6293 en a fait l'expérience sur UN seul des 42, celui
 * qu'exerçait la route qui venait de changer.
 *
 * **Quand ce témoin tombe** : un nouveau double étroit vient d'être écrit. La
 * réparation est d'étaler le module réel avant la surcharge —
 * `...(jest.requireActual('<module>') as object)` — jamais d'ajouter une
 * ligne à un inventaire gelé : il n'y a pas de double étroit légitime de ce
 * module, ses trois exports étant tous vivants dans les routes qui en
 * dépendent.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import {
  findNarrowWithMutationLogMocks,
  sweepNarrowWithMutationLogMocks,
} from './with-mutation-log-mock-sweep';

const SRC_DIR = join(__dirname, '..');

describe('doubles de `utils/withMutationLog` — le module réel est toujours étalé', () => {
  it('aucun double de test ne mocke `withMutationLog` sans étaler le module réel', () => {
    expect(sweepNarrowWithMutationLogMocks(SRC_DIR)).toEqual([]);
  });

  /**
   * Le balayage lui-même est une AFFIRMATION, et se vérifie comme telle
   * (§ « Un tri est une AFFIRMATION » du CLAUDE.md du gateway) : un balayage
   * qui ne trouve jamais rien rend un inventaire vide pour la mauvaise
   * raison, indiscernable du succès. Les fixtures ci-dessous sont des
   * CHAÎNES en mémoire, jamais des fichiers `*.test.ts` sur disque — un tel
   * fichier serait ramassé par `testMatch` (`jest.config.json`) comme une
   * VRAIE suite, et une suite sans aucun `it()` fait échouer Jest avant même
   * d'atteindre ce garde.
   */
  it('le balayage VOIT un double qui ne rend que `withMutationLog`', () => {
    const source = `
jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn().mockImplementation(({ op }) => op()),
}));
`;
    const found = findNarrowWithMutationLogMocks(source, 'fixture-narrow.test.ts');

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      file: 'fixture-narrow.test.ts',
      modulePath: '../../../utils/withMutationLog',
      reason: 'requireActual absent',
    });
  });

  it('le balayage VOIT un double qui étale `requireActual` SANS le caster (#6293)', () => {
    const source = `
jest.mock('../../../utils/withMutationLog', () => ({
  ...jest.requireActual('../../../utils/withMutationLog'),
  withMutationLog: jest.fn().mockImplementation(({ op }) => op()),
}));
`;
    const found = findNarrowWithMutationLogMocks(source, 'fixture-uncast.test.ts');

    expect(found).toHaveLength(1);
    expect(found[0].reason).toBe(
      'requireActual non casté (`as object` ou générique requis)',
    );
  });

  it('le balayage VOIT un double qui redéclare `MutationResultGone` à la main', () => {
    // Forme rencontrée deux fois dans le dépôt (#6294) : une usine-FONCTION,
    // pas un objet littéral — l'extraction du bloc doit couvrir les deux.
    const source = `
jest.mock('../../../../utils/withMutationLog', () => {
  class MutationResultGone extends Error {}
  return { withMutationLog: jest.fn(async (args) => args.op()), MutationResultGone };
});
`;
    const found = findNarrowWithMutationLogMocks(source, 'fixture-local-class.test.ts');

    expect(found).toHaveLength(1);
    expect(found[0].reason).toBe('requireActual absent');
  });

  /**
   * Et il ne prend pas la forme JUSTE pour la fautive — sans quoi la seule
   * façon de le rendre vert serait de cesser d'étaler le module réel.
   */
  it('le balayage ne signale pas un double qui étale le module réel avec un cast', () => {
    const casted = `
jest.mock('../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));
`;
    expect(findNarrowWithMutationLogMocks(casted, 'fixture-ok-cast.test.ts')).toEqual([]);

    // La forme générique, employée ailleurs dans le dépôt, est équivalente.
    const generic = `
jest.mock('../../../utils/withMutationLog', () => ({
  ...jest.requireActual<Record<string, unknown>>('../../../utils/withMutationLog'),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));
`;
    expect(findNarrowWithMutationLogMocks(generic, 'fixture-ok-generic.test.ts')).toEqual([]);
  });

  it('ne signale pas un fichier qui ne mocke pas `withMutationLog` du tout', () => {
    const source = `
jest.mock('../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));
`;
    expect(findNarrowWithMutationLogMocks(source, 'fixture-unrelated.test.ts')).toEqual([]);
  });
});
