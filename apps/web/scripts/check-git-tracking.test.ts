import { describe, expect, test } from 'bun:test';

// @ts-expect-error — module .mjs sans déclaration de types ; ce témoin
// interroge son API publique exactement comme le pilote le fait.
import { isOutOfScope } from './check-git-tracking.mjs';

/**
 * LE TÉMOIN DU GATE DE SUIVI GIT (#6832).
 *
 * `bun run gate` n'était pas IDEMPOTENT : vert au premier tour, rouge à tous
 * les suivants dans le même arbre. `check-git-tracking` est le 35ᵉ maillon de
 * la chaîne `&&`, `check-admin-rung` le 38ᵉ, et ce dernier construit
 * `dist-admin-rung/`. Au tour d'après, le témoin le trouvait et réclamait
 * qu'on COMMITE des centaines de fichiers de build.
 *
 * Mesuré, sans rien changer d'autre entre les deux :
 *
 *     AVEC dist-admin-rung/ : EXIT=1
 *     SANS dist-admin-rung/ : EXIT=0
 *
 * La CI ne l'a jamais vu — elle clone frais. Le défaut ne mordait qu'en local,
 * chez qui relance le gate, donc au moment précis où l'on revérifie après un
 * correctif : un rouge FAUX, qui désigne des innocents.
 *
 * Ce témoin tient les DEUX moitiés de la loi : ce qui est exempté (les sorties
 * de construction, par MOTIF) et ce qui ne doit jamais l'être (les sources que
 * ce gate existe pour attraper).
 */
describe('isOutOfScope — les sorties de construction, par motif', () => {
  test('les TROIS sorties `dist-*` que le gate lui-même écrit sont exemptées', () => {
    // `OUT_DIR` de check-admin-rung.mjs, check-gateway-build.mjs,
    // check-capacitor-config.mjs — relevés, jamais devinés.
    expect(isOutOfScope('dist-admin-rung')).toBe(true);
    expect(isOutOfScope('dist-gateway')).toBe(true);
    expect(isOutOfScope('dist-capacitor')).toBe(true);
  });

  test('une sortie `dist-*` JAMAIS ÉCRITE ENCORE est exemptée d\'avance — c\'est tout l\'intérêt du motif', () => {
    // Le défaut se rouvrirait en silence si l'exemption était une liste de
    // noms : le prochain `OUT_DIR = 'dist-…'` n'y figurerait pas.
    expect(isOutOfScope('dist-une-sortie-qui-n-existe-pas-encore')).toBe(true);
  });

  test('les exemptions historiques tiennent toujours', () => {
    for (const nom of ['dist', 'node_modules', 'android', 'ios', '.turbo', 'render', 'test-results', '.cache']) {
      expect(isOutOfScope(nom)).toBe(true);
    }
  });

  test('les SOURCES restent gardées — la raison d\'être du témoin n\'est pas affaiblie', () => {
    // Les deux fichiers qui ont fait naître ce gate : avalés par `**/*.d.*`,
    // jamais commités, quatre TS2307/TS7016 à la première CI qui a typé cette
    // application.
    expect(isOutOfScope('src')).toBe(false);
    expect(isOutOfScope('scripts')).toBe(false);
    expect(isOutOfScope('bun-test.d.ts')).toBe(false);
    expect(isOutOfScope('institutional-routes.d.mts')).toBe(false);
  });

  test('un nom qui COMMENCE par « dist » sans être une sortie n\'est PAS exempté', () => {
    // `dist-*` est le motif du `.gitignore`, pas « tout ce qui commence par
    // dist » : un répertoire de sources nommé `distribution/` reste gardé.
    expect(isOutOfScope('distribution')).toBe(false);
    expect(isOutOfScope('distance.ts')).toBe(false);
  });
});
