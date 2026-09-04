import * as fs from 'node:fs';
import * as path from 'node:path';

import { SCRIPT_DU_TRAVAILLEUR } from '@/app/connecte/chargeur';
import { porteesDuTravailleur } from '@/lib/sw/portees';

/**
 * LA REGISTRATION À PORTÉES ÉTROITES (#4472) — un seul worker détient la
 * portée de l'origine pendant la migration.
 *
 * Trois lois, et le témoin de frontière :
 *  - `/` n'est JAMAIS une portée servie tant que l'étape 7 du § 4.9 n'est pas
 *    franchie — quelle que soit la valeur de l'environnement ;
 *  - sans environnement (`V3_SW_PORTEES` absente), AUCUNE registration : le
 *    worker n'existe pas pour ce déploiement (la prod d'aujourd'hui) ;
 *  - les portées déclarées dans le compose de staging sont les DEUX FACES de
 *    la même frontière : chacune est capturée par la règle Traefik du MÊME
 *    routeur (sinon le worker revendiquerait un chemin que la zone ne sert
 *    pas — il contrôlerait des pages du legacy), et chacune est couverte par
 *    `belongsToV3Zone` du worker LEGACY (sinon les deux workers se
 *    disputeraient les mêmes requêtes).
 */

const RACINE_DU_DEPOT = path.join(__dirname, '..', '..', '..');

describe('porteesDuTravailleur — la liste vient de l’environnement, validée', () => {
  it('absente ou vide ⇒ AUCUNE portée (le worker n’existe pas pour ce déploiement)', () => {
    expect(porteesDuTravailleur(undefined)).toEqual([]);
    expect(porteesDuTravailleur('')).toEqual([]);
    expect(porteesDuTravailleur('  ')).toEqual([]);
  });

  it('la racine est REFUSÉE, seule ou mêlée aux autres', () => {
    expect(porteesDuTravailleur('/')).toEqual([]);
    expect(porteesDuTravailleur('/l/,/,/chats')).toEqual(['/l/', '/chats']);
  });

  it('une entrée qui ne commence pas par `/` est refusée — jamais une origine étrangère', () => {
    expect(porteesDuTravailleur('https://autre.example/l/,/l/')).toEqual(['/l/']);
  });
});

describe('SCRIPT_DU_TRAVAILLEUR — la registration que le document sert', () => {
  it('sans portée, AUCUN script — pas un script vide, rien', () => {
    expect(SCRIPT_DU_TRAVAILLEUR([])).toBe('');
  });

  it("avec des portées, une registration PAR portée, l'URL du script les transporte, et jamais scope '/'", () => {
    const script = SCRIPT_DU_TRAVAILLEUR(['/l/', '/chats']);
    expect(script).toContain('/__v3/sw?portees=');
    expect(script).toContain(encodeURIComponent('/l/,/chats'));
    expect(script).toContain('scope:p');
    expect(script).not.toContain("scope:'/'");
    expect(script).toContain("updateViaCache:'none'");
  });

  it('la registration attend `load` puis l’oisiveté — jamais une requête avant le premier pixel', () => {
    const script = SCRIPT_DU_TRAVAILLEUR(['/l/']);
    expect(script).toContain("addEventListener('load'");
    expect(script).toContain('requestIdleCallback');
  });

  it('aucun rechargement sur controllerchange — le battement que #4472 interdit', () => {
    const script = SCRIPT_DU_TRAVAILLEUR(['/l/']);
    expect(script).not.toContain('controllerchange');
    expect(script).not.toContain('reload');
  });
});

describe('les deux faces de la frontière — le compose de staging ne peut pas mentir', () => {
  const compose = fs.readFileSync(path.join(RACINE_DU_DEPOT, 'docker-compose.staging.yml'), 'utf8');

  const porteesDuCompose = (): readonly string[] => {
    const ligne = compose
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('- V3_SW_PORTEES='));
    if (ligne === undefined) throw new Error('V3_SW_PORTEES absente du compose de staging');
    return porteesDuTravailleur(ligne.slice('- V3_SW_PORTEES='.length));
  };

  const regleDuRouteurDeStaging = (): string => {
    const ligne = compose
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.includes('traefik.http.routers.frontend-v3-staging.rule='));
    if (ligne === undefined) throw new Error('la règle frontend-v3-staging est absente');
    return ligne;
  };

  it('déclare au moins la lecture partagée — le rôle premier que #4473 cible', () => {
    expect(porteesDuCompose()).toContain('/l/');
  });

  it('chaque portée est CAPTURÉE par la règle Traefik du même routeur — le worker ne revendique jamais un chemin que la zone ne sert pas', () => {
    const regle = regleDuRouteurDeStaging();
    const reclamations = [...regle.matchAll(/(PathPrefix|Path)\(`([^`]+)`\)/g)].map(
      ([, matcher, valeur]) => ({ matcher, valeur }),
    );
    const capturee = (portee: string): boolean =>
      reclamations.some(({ matcher, valeur }) => {
        const temoin = portee.endsWith('/') ? `${portee}temoin` : portee;
        return matcher === 'Path' ? temoin === valeur : temoin.startsWith(String(valeur));
      });
    for (const portee of porteesDuCompose()) {
      expect({ portee, capturee: capturee(portee) }).toEqual({ portee, capturee: true });
    }
  });

  it('chaque portée est couverte par belongsToV3Zone du worker LEGACY — les deux workers ne se disputent aucune requête', () => {
    const swLegacy = fs.readFileSync(
      path.join(RACINE_DU_DEPOT, 'apps', 'web', 'public', 'sw.js'),
      'utf8',
    );
    const bloc = swLegacy.match(
      /const V3_ZONE_PREFIXES = \[[^\]]*\];[\s\S]*?function belongsToV3Zone\(pathname\) \{[\s\S]*?\n\}/,
    );
    if (bloc === null) throw new Error('belongsToV3Zone introuvable dans le sw legacy');
    const { couvre } = new Function(
      `${bloc[0]}\nreturn { couvre: belongsToV3Zone };`,
    )() as { couvre: (pathname: string) => boolean };
    for (const portee of porteesDuCompose()) {
      const temoin = portee.endsWith('/') ? `${portee}temoin` : portee;
      expect({ portee, couverte: couvre(temoin) }).toEqual({ portee, couverte: true });
    }
  });

  it("la règle des DEUX déploiements réclame le chemin du script — sans lui, la registration télécharge un document du legacy", () => {
    const prod = fs.readFileSync(path.join(RACINE_DU_DEPOT, 'docker-compose.prod.yml'), 'utf8');
    for (const [nom, contenu, routeur] of [
      ['staging', compose, 'frontend-v3-staging'],
      ['prod', prod, 'frontend-v3'],
    ] as const) {
      const ligne = contenu
        .split('\n')
        .find((l) => l.includes(`traefik.http.routers.${routeur}.rule=`));
      expect({ nom, reclame: ligne?.includes('PathPrefix(`/__v3/sw`)') ?? false }).toEqual({
        nom,
        reclame: true,
      });
    }
  });
});
