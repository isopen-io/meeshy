/**
 * @jest-environment node
 *
 * Le cycle de vie côté SERVEUR — issue #4447.
 *
 * `lib/realtime/lifecycle.ts` est un module client, mais rien n'empêche un
 * layout ou un composant serveur d'en importer un type — et l'import d'un
 * module dont le corps touche `window` casse le rendu AVANT le premier pixel.
 * L'assertion tient donc en deux temps : le module s'IMPORTE sans DOM, et
 * l'observation y est un non-événement qui rend son détachement.
 */
import { observeCycleDeVie } from '../lib/realtime/lifecycle';

describe('le cycle de vie sans DOM', () => {
  it("s'observe sans planter et ne dit rien", () => {
    const vues: unknown[] = [];
    const detache = observeCycleDeVie({ sur: (vue) => vues.push(vue), cleDuJeton: 'meeshy.guest.' });
    detache();

    expect(vues).toEqual([]);
  });
});
