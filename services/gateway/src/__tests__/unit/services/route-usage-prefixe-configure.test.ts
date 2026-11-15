/**
 * **Le registre de surveillance suit le préfixe CONFIGURÉ (#4324, volet D).**
 *
 * `ROUTES_SURVEILLEES` est comparé à la route MONTÉE — celle que rend
 * `request.routeOptions.url`. Elle porte donc le préfixe que la passerelle sert
 * réellement, et ce préfixe se configure (`MEESHY_API_VERSION`,
 * `MEESHY_API_BASE_PATH`, `packages/shared/api/prefix.ts`).
 *
 * Écrire `/api/v1/` en dur dans ce fichier n'était pas cosmétique : c'est le
 * mécanisme central du compteur qui en dépend. Avec une autre version,
 *
 *  - les seaux PRÉ-SEMÉS à zéro l'auraient été sous des noms que le trafic
 *    n'atteint jamais, si bien qu'un `count: 0` — que quatre issues (#4178,
 *    #4181, #4182, #4184) érigent en critère de RETRAIT d'une route — aurait
 *    dit « personne ne l'appelle » là où il fallait lire « le compteur ne l'a
 *    jamais vue ». Le doc-comment du service nomme lui-même cette ambiguïté
 *    comme « la pièce maîtresse » ;
 *  - `motifDe` aurait classé les 500+ routes versionnées en
 *    `hors-prefixe-sans-declaration`, rejetant le registre entier.
 *
 * Le témoin charge le module SOUS une version différente : les constantes sont
 * évaluées à l'import, donc seule une réinitialisation de modules peut observer
 * la configuration qu'elles ont lue.
 */
import { apiPath } from '@meeshy/shared/api/prefix';

type ModuleRouteUsage = typeof import('../../../services/route-usage.service');

const CHEMIN_MODULE = '../../../services/route-usage.service';

function chargerSous(version: string): ModuleRouteUsage {
  const precedente = process.env['MEESHY_API_VERSION'];
  process.env['MEESHY_API_VERSION'] = version;
  let charge: ModuleRouteUsage | undefined;
  try {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      charge = require(CHEMIN_MODULE) as ModuleRouteUsage;
    });
  } finally {
    if (precedente === undefined) delete process.env['MEESHY_API_VERSION'];
    else process.env['MEESHY_API_VERSION'] = precedente;
  }
  if (!charge) throw new Error('le module ne s’est pas chargé');
  return charge;
}

describe('route-usage — le registre suit le préfixe configuré', () => {
  /**
   * Le registre PARTITIONNE : chaque entrée est versionnée ou déclarée hors
   * préfixe, jamais ni l'un ni l'autre. Vérifier la partition plutôt qu'un
   * nombre attendu — un seuil chiffré rouille à chaque route ajoutée ou
   * retirée, et se corrige alors sans que personne relise ce qu'il gardait.
   */
  const partition = (mod: ModuleRouteUsage) => {
    const versionnees = mod.ROUTES_SURVEILLEES.filter((r) => !r.horsPrefixe);
    const declarees = mod.ROUTES_SURVEILLEES.filter((r) => r.horsPrefixe);
    expect(versionnees.length + declarees.length).toBe(mod.ROUTES_SURVEILLEES.length);
    expect(versionnees.length).toBeGreaterThan(declarees.length);
    return { versionnees, declarees };
  };

  it('sous la version par défaut, les routes surveillées portent le préfixe servi', () => {
    const mod = chargerSous('v1');
    const { versionnees } = partition(mod);

    for (const r of versionnees) {
      expect(r.route.startsWith('/api/v1/')).toBe(true);
    }
  });

  it('sous une AUTRE version, les routes surveillées la suivent', () => {
    const mod = chargerSous('v7');
    const { versionnees } = partition(mod);

    const restees = versionnees.filter((r) => r.route.startsWith('/api/v1/'));
    expect(restees.map((r) => `${r.method} ${r.route}`)).toEqual([]);
    for (const r of versionnees) {
      expect(r.route.startsWith('/api/v7/')).toBe(true);
    }
  });

  it('sous une AUTRE version, le VALIDATEUR suit lui aussi — sinon il rejette tout', () => {
    const mod = chargerSous('v7');
    // `motifDe` testait `startsWith('/api/v1/')` en dur : sous v7 il aurait
    // rendu `hors-prefixe-sans-declaration` pour chaque route versionnée.
    expect(mod.surveilleesMalDeclarees()).toEqual([]);
  });

  it('les routes DÉCLARÉES hors préfixe ne bougent pas — contre-épreuve', () => {
    const parDefaut = chargerSous('v1');
    const autre = chargerSous('v7');

    const horsPrefixe = (m: ModuleRouteUsage): string[] =>
      m.ROUTES_SURVEILLEES.filter((r) => r.horsPrefixe)
        .map((r) => `${r.method} ${r.route}`)
        .sort();

    expect(horsPrefixe(parDefaut).length).toBeGreaterThan(0);
    // Une conversion qui aurait débordé sur `/api/attachments/file/*`,
    // `/health` ou `/voice/analysis` casserait leur appariement : ces adresses
    // sont servies SOUS CETTE FORME, quelle que soit la version.
    expect(horsPrefixe(autre)).toEqual(horsPrefixe(parDefaut));
  });

  it('les routes RETIRÉES suivent le préfixe, elles aussi', () => {
    const autre = chargerSous('v7');
    const retirees = [...autre.ROUTES_RETIREES];

    expect(retirees.length).toBeGreaterThan(0);
    for (const entree of retirees) {
      const chemin = entree.slice(entree.indexOf(' ') + 1);
      expect(chemin.startsWith('/api/v7/')).toBe(true);
    }
  });

  it('`routeRetireeDe` reconnaît une adresse retirée sous la version servie', () => {
    const autre = chargerSous('v7');
    const chemin = apiPath('/auth/validate-session', { MEESHY_API_VERSION: 'v7' });

    expect(autre.routeRetireeDe({ method: 'POST', rawPath: chemin })).toBe(chemin);
    expect(autre.routeRetireeDe({ method: 'POST', rawPath: '/api/v1/auth/validate-session' }))
      .toBeUndefined();
  });
});
