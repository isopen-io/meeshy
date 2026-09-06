import * as fs from 'node:fs';
import * as path from 'node:path';

import { documentDuTableau } from '@/app/connecte/vue';
import { SCRIPT_DU_TRAVAILLEUR } from '@/app/connecte/chargeur';
import { documentDesChats } from '@/app/connecte/liste-vue';
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

describe('la registration ATTEINT les documents de la zone connectée (#5321)', () => {
  const ANCIENNE_VALEUR = process.env['V3_SW_PORTEES'];

  afterEach(() => {
    if (ANCIENNE_VALEUR === undefined) delete process.env['V3_SW_PORTEES'];
    else process.env['V3_SW_PORTEES'] = ANCIENNE_VALEUR;
  });

  const CONVERSATION = {
    id: '68f2a81417a557e8ce4ddfbb',
    identifiant: 'lagos',
    titre: 'Équipe Lagos',
    genre: 'group' as const,
    membres: 4,
    nonLus: 3,
    dernierMessageA: '2026-09-01T12:00:00.000Z',
    apercu: 'On se cale à 15 h pour la revue ?',
    apercuTraductions: null,
    apercuLangueOriginale: 'fr',
    sourdine: false,
    archivee: false,
    participantsInscrits: [],
  };

  const MAINTENANT = Date.parse('2026-09-01T12:30:00.000Z');

  /**
   * `SCRIPT_DU_TRAVAILLEUR n'a qu'UN appelant (le fil)` disait l'audit source
   * de cette issue — vrai de l'IDENTIFIANT (`fil-vue.ts` est le seul fichier
   * qui l'importe), mais `documentPleinEcran` qu'il sert est lui-même partagé
   * par la plupart des écrans membres. Les DEUX documents qui composent par
   * `documentDuSite` sans passer par lui — la liste et le tableau de bord —
   * sont le trou réel, mesuré `REGS: []` sur `/chats`.
   */
  it("documentDesChats (/chats) sert la registration quand l'environnement déclare des portées", () => {
    process.env['V3_SW_PORTEES'] = '/l/,/chats';
    const doc = documentDesChats({ conversations: [CONVERSATION], maintenant: MAINTENANT, langues: ['fr'], moi: 'u1', tempsReel: null });
    expect(doc).toContain('/__v3/sw?portees=');
  });

  it('documentDesChats (/chats) ne sert AUCUN script sans portée déclarée', () => {
    delete process.env['V3_SW_PORTEES'];
    const doc = documentDesChats({ conversations: [CONVERSATION], maintenant: MAINTENANT, langues: ['fr'], moi: 'u1', tempsReel: null });
    expect(doc).not.toContain('/__v3/sw?portees=');
  });

  it("documentDuTableau (/) sert la registration quand l'environnement déclare des portées", () => {
    process.env['V3_SW_PORTEES'] = '/l/,/chats';
    const doc = documentDuTableau({
      lecteur: null,
      conversations: [CONVERSATION],
      total: 1,
      liens: { genre: 'liste', liens: [] },
      maintenant: MAINTENANT,
      espace: false,
    });
    expect(doc).toContain('/__v3/sw?portees=');
  });

  it('documentDuTableau (/) ne sert AUCUN script sans portée déclarée', () => {
    delete process.env['V3_SW_PORTEES'];
    const doc = documentDuTableau({
      lecteur: null,
      conversations: [CONVERSATION],
      total: 1,
      liens: { genre: 'liste', liens: [] },
      maintenant: MAINTENANT,
      espace: false,
    });
    expect(doc).not.toContain('/__v3/sw?portees=');
  });
});

describe('les deux faces de la frontière — le compose de staging ne peut pas mentir', () => {
  const compose = fs.readFileSync(path.join(RACINE_DU_DEPOT, 'docker-compose.staging.yml'), 'utf8');

  // LE BLOC DU SERVICE, PAS LE FICHIER ENTIER — c'est ce qui distingue « la
  // variable existe quelque part dans le compose » de « la variable est
  // déclarée sur le service qui LIT l'environnement à l'exécution ». Un
  // `find` sans borne de bloc avait laissé `V3_SW_PORTEES`/`V3_NAVIGABLE`
  // migrer sur `frontend-staging` (le LEGACY, une image qui ne contient pas
  // `apps/web-v3`) sans qu'aucun témoin ne rougisse : le texte matchait,
  // le service qui tourne ne les lisait jamais.
  const blocDuServiceV3 = (): string => {
    const lignes = compose.split('\n');
    const debut = lignes.findIndex((l) => l.trim() === 'frontend-v3-staging:');
    if (debut === -1) {
      throw new Error('le service frontend-v3-staging est absent du compose de staging');
    }
    const suite = lignes.slice(debut + 1);
    const fin = suite.findIndex((l) => /^ {2}\S/.test(l));
    return suite.slice(0, fin === -1 ? suite.length : fin).join('\n');
  };

  const listeDuCompose = (variable: string): readonly string[] => {
    const ligne = blocDuServiceV3()
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith(`- ${variable}=`));
    if (ligne === undefined) {
      throw new Error(`${variable} absente du SERVICE frontend-v3-staging du compose de staging`);
    }
    return porteesDuTravailleur(ligne.slice(`- ${variable}=`.length));
  };

  const porteesDuCompose = (): readonly string[] => listeDuCompose('V3_SW_PORTEES');

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

  it('le périmètre NAVIGABLE (#5106) obéit aux mêmes lois : chaque chemin capturé par la règle, jamais la racine', () => {
    const navigable = listeDuCompose('V3_NAVIGABLE');
    expect(navigable.length).toBeGreaterThan(0);
    expect(navigable).not.toContain('/');
    const regle = regleDuRouteurDeStaging();
    const reclamations = [...regle.matchAll(/(PathPrefix|Path)\(`([^`]+)`\)/g)].map(
      ([, matcher, valeur]) => ({ matcher, valeur }),
    );
    for (const chemin of navigable) {
      const temoin = chemin.endsWith('/') ? `${chemin}temoin` : chemin;
      const capture = reclamations.some(({ matcher, valeur }) =>
        matcher === 'Path' ? temoin === valeur : temoin.startsWith(String(valeur)),
      );
      expect({ chemin, capture }).toEqual({ chemin, capture: true });
    }
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
