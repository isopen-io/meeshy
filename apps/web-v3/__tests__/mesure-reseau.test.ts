import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  agregeExecutions,
  cheminDe,
  composeMesure,
  composeVerdictReseau,
  franchissementsReseau,
  mesureIndisponible,
  mesurePage,
  octetsParType,
  octetsTransferes,
  percentile,
  plafondsDuChemin,
  requetesAvantPremierPixel,
  requetesPendantes,
} from '../scripts/mesure-reseau.mjs';
import type { BudgetReseau, Mesure } from '../scripts/mesure-reseau.mjs';

const COMMANDE = 'node apps/web-v3/scripts/mesure-reseau.mjs https://exemple/';

describe('ce que le réseau a réellement coûté', () => {
  it("totalise les octets ENCODÉS, pas la taille décompressée", () => {
    expect(
      octetsTransferes([
        { requestId: '1', encodedDataLength: 4096 },
        { requestId: '2', encodedDataLength: 1024 },
      ]),
    ).toBe(5120);
  });

  it('range les octets par type de ressource', () => {
    const table = octetsParType(
      [
        { requestId: '1', type: 'Document' },
        { requestId: '2', type: 'Script' },
        { requestId: '3', type: 'Script' },
      ],
      [
        { requestId: '1', encodedDataLength: 4096 },
        { requestId: '2', encodedDataLength: 1024 },
        { requestId: '3', encodedDataLength: 1024 },
      ],
    );

    expect(table).toEqual({
      Document: { requetes: 1, octets: 4096 },
      Script: { requetes: 2, octets: 2048 },
    });
  });

  it("range dans « autre » un chargement dont aucune réponse ne dit le type", () => {
    expect(octetsParType([], [{ requestId: '9', encodedDataLength: 512 }])).toEqual({
      autre: { requetes: 1, octets: 512 },
    });
  });
});

describe('ce que le visiteur attend AVANT de voir quelque chose', () => {
  it('compte les ressources parties avant le premier pixel, document compris', () => {
    const ressources = [{ startTime: 10 }, { startTime: 120 }, { startTime: 900 }];

    expect(requetesAvantPremierPixel(ressources, 600)).toBe(3);
  });

  it("compte le document seul quand rien d'autre n'est parti avant le premier pixel", () => {
    expect(requetesAvantPremierPixel([{ startTime: 900 }], 600)).toBe(1);
  });

  it("ne prétend rien quand le premier pixel n'a pas été observé", () => {
    expect(requetesAvantPremierPixel([{ startTime: 10 }], null)).toBeNull();
  });
});

describe("une mesure dit toujours d'où elle vient", () => {
  it('porte la commande qui la rejoue', () => {
    const mesure = composeMesure({
      url: 'https://exemple/',
      commande: COMMANDE,
      http: 200,
      dureeMs: 1200,
      requetesEmises: 1,
      reponses: [{ requestId: '1', type: 'Document' }],
      chargements: [{ requestId: '1', encodedDataLength: 4096 }],
      ressources: [],
      fcpMs: 800,
      lcpMs: 1100,
      cls: 0.01,
    });

    expect(mesure.commande).toBe(COMMANDE);
    expect(mesure.statut).toBe('mesuré');
    expect(mesure.octets_transferes).toBe(4096);
    expect(mesure.requetes).toBe(1);
    expect(mesure.requetes_avant_premier_pixel).toBe(1);
    expect(mesure.lcp_ms).toBe(1100);
  });

  it("marque « à établir » — et non zéro — ce qu'elle n'a pas pu mesurer", () => {
    const mesure = mesureIndisponible({
      url: 'https://meeshy.me/',
      commande: COMMANDE,
      raison: "403 du proxy sortant sur CONNECT meeshy.me:443",
    });

    expect(mesure.statut).toBe('à établir');
    expect(mesure.raison).toContain('403');
    expect(mesure.octets_transferes).toBeNull();
    expect(mesure.requetes).toBeNull();
    expect(mesure.requetes_avant_premier_pixel).toBeNull();
    expect(mesure.lcp_ms).toBeNull();
    expect(mesure.commande).toBe(COMMANDE);
  });

  it('donne les mêmes clés dans les deux cas — un rapport ne change pas de forme selon son issue', () => {
    const mesuree = composeMesure({
      url: 'https://exemple/',
      commande: COMMANDE,
      http: 200,
      dureeMs: 1,
      requetesEmises: 0,
      reponses: [],
      chargements: [],
      ressources: [],
      fcpMs: null,
      lcpMs: null,
      cls: null,
    });
    const absente = mesureIndisponible({ url: 'https://exemple/', commande: COMMANDE, raison: 'x' });

    expect(Object.keys(mesuree).sort()).toEqual(Object.keys(absente).sort());
  });
});

describe('les connexions TENUES après le premier pixel — le GATE neuf du § 8.3', () => {
  it('soustrait ce qui est terminé de ce qui est parti', () => {
    expect(requetesPendantes(9, 8)).toBe(1);
    expect(requetesPendantes(8, 8)).toBe(0);
  });

  it('ne rend jamais un nombre négatif de connexions tenues', () => {
    expect(requetesPendantes(3, 5)).toBe(0);
  });

  it('porte le chiffre dans la mesure, à côté de ceux qui le composent', () => {
    const mesure = composeMesure({
      url: 'https://exemple/',
      commande: COMMANDE,
      http: 200,
      dureeMs: 10,
      requetesEmises: 4,
      requetesTerminees: 3,
      reponses: [],
      chargements: [],
      ressources: [],
      fcpMs: 100,
      lcpMs: 200,
      cls: 0,
    });

    expect(mesure.requetes_pendantes).toBe(1);
  });
});

describe('un p75, pas une exécution', () => {
  const execution = (octets: number, lcp: number): Mesure =>
    composeMesure({
      url: 'https://exemple/',
      commande: COMMANDE,
      http: 200,
      dureeMs: lcp,
      requetesEmises: 3,
      requetesTerminees: 3,
      reponses: [{ requestId: '1', type: 'Stylesheet' }],
      chargements: [{ requestId: '1', encodedDataLength: octets }],
      ressources: [],
      fcpMs: 100,
      lcpMs: lcp,
      cls: 0.01,
    });

  it('rend le percentile demandé, pas la moyenne ni le meilleur essai', () => {
    expect(percentile([100, 200, 300, 400, 5000], 75)).toBe(400);
    expect(percentile([], 75)).toBeNull();
  });

  it('agrège les exécutions et dit combien il en a fallu', () => {
    const agregee = agregeExecutions({
      url: 'https://exemple/',
      commande: COMMANDE,
      executions: [execution(100, 900), execution(200, 1000), execution(300, 3000)],
      rang: 75,
    });

    expect(agregee.statut).toBe('mesuré');
    expect(agregee.executions).toBe(3);
    expect(agregee.percentile).toBe(75);
    expect(agregee.lcp_ms).toBe(3000);
    expect(agregee.octets_transferes).toBe(300);
  });

  it("ne prétend rien quand une seule exécution n'a pas abouti", () => {
    const agregee = agregeExecutions({
      url: 'https://exemple/',
      commande: COMMANDE,
      executions: [
        execution(100, 900),
        mesureIndisponible({ url: 'https://exemple/', commande: COMMANDE, raison: 'timeout' }),
      ],
      rang: 75,
    });

    expect(agregee.statut).toBe('à établir');
    expect(agregee.raison).toContain('timeout');
    expect(agregee.lcp_ms).toBeNull();
  });
});

describe('les seuils du § 8.3, comparés — et non seulement mesurés', () => {
  const reseau: BudgetReseau = {
    transverses: { css_ko: { valeur: 20, statut: 'GATE' } },
    ecrans: [
      {
        motifs: ['/stories/*'],
        plafonds: {
          requetes_avant_premier_pixel: { valeur: 3, statut: 'GATE' },
          requetes_pendantes: { valeur: 0, statut: 'GATE' },
          lcp_ms: { valeur: 2000, statut: 'CIBLE' },
        },
      },
      { motifs: ['/*'], plafonds: { requetes_avant_premier_pixel: { valeur: 10, statut: 'GATE' } } },
    ],
  };

  const mesure = (attributs: Partial<Mesure>): Mesure => ({
    ...composeMesure({
      url: 'http://127.0.0.1:3300/stories/abc',
      commande: COMMANDE,
      http: 200,
      dureeMs: 10,
      requetesEmises: 3,
      requetesTerminees: 3,
      reponses: [],
      chargements: [],
      ressources: [],
      fcpMs: 100,
      lcpMs: 500,
      cls: 0,
    }),
    ...attributs,
  });

  it("lit le chemin de l'url, et retient le motif le plus précis", () => {
    expect(cheminDe('http://127.0.0.1:3300/stories/abc?x=1')).toBe('/stories/abc');
    expect(
      plafondsDuChemin('/stories/abc', reseau).requetes_avant_premier_pixel?.valeur,
    ).toBe(3);
    expect(plafondsDuChemin('/autre', reseau).requetes_avant_premier_pixel?.valeur).toBe(10);
  });

  it('applique aussi les seuils TRANSVERSES du § 8.5', () => {
    expect(plafondsDuChemin('/stories/abc', reseau).css_ko?.valeur).toBe(20);
  });

  it('rougit sur une requête de trop avant le premier pixel', () => {
    const franchis = franchissementsReseau(mesure({ requetes_avant_premier_pixel: 5 }), reseau);

    expect(franchis).toHaveLength(1);
    expect(franchis[0]?.statut).toBe('GATE');
    expect(franchis[0]?.texte).toContain('requetes_avant_premier_pixel : 5 > 3');
  });

  it('rougit sur UNE connexion tenue après le premier pixel', () => {
    expect(
      franchissementsReseau(mesure({ requetes_pendantes: 1 }), reseau).map((f) => f.mesure),
    ).toEqual(['requetes_pendantes']);
  });

  it('rougit sur un CSS au-dessus du plafond transverse', () => {
    const franchis = franchissementsReseau(
      mesure({ octets_par_type: { Stylesheet: { requetes: 1, octets: 30 * 1024 } } }),
      reseau,
    );

    expect(franchis.map((f) => f.mesure)).toEqual(['css_ko']);
  });

  /**
   * LE DOCUMENT — les octets du HTML servi. Aucun instrument ne les lisait :
   * `check-bundle-budget.mjs` mesure des CHUNKS, et le document n'en est pas
   * un. Or c'est là qu'un écran rendu par le serveur grossit avec les DONNÉES
   * plutôt qu'avec le code — un tableau de messages passé tel quel à un
   * composant client fait voyager, dans le paquet Flight comme dans le HTML,
   * autant de textes que le Prisme a de langues.
   *
   * Le plafond de /chats/* reste « À ÉTABLIR » dans budgets.json — un chiffre
   * qu'on n'a pas mesuré ne s'invente pas —, mais l'instrument, lui, existe et
   * compare dès qu'on lui donne une valeur.
   */
  it('lit les octets du DOCUMENT, et les compare dès qu’un plafond existe', () => {
    const avecPlafond: BudgetReseau = {
      transverses: {},
      ecrans: [{ motifs: ['/chats/*'], plafonds: { document_ko: { valeur: 30, statut: 'GATE' } } }],
    };
    const lourde = {
      ...mesure({ octets_par_type: { Document: { requetes: 1, octets: 40 * 1024 } } }),
      url: 'http://127.0.0.1:3300/chats/mshy_lagos',
    };

    expect(franchissementsReseau(lourde, avecPlafond).map((f) => f.mesure)).toEqual(['document_ko']);

    const legere = {
      ...mesure({ octets_par_type: { Document: { requetes: 1, octets: 8 * 1024 } } }),
      url: 'http://127.0.0.1:3300/chats/mshy_lagos',
    };

    expect(franchissementsReseau(legere, avecPlafond)).toEqual([]);
  });

  /**
   * Et il ne compare RIEN tant que le plafond est « À ÉTABLIR » : un plafond
   * nul n'est pas un plafond de zéro.
   */
  it('ne compare pas un document quand le plafond n’est pas établi', () => {
    const sansPlafond: BudgetReseau = {
      transverses: {},
      ecrans: [{ motifs: ['/chats/*'], plafonds: { document_ko: { valeur: null, statut: 'À ÉTABLIR' } } }],
    };
    const lourde = {
      ...mesure({ octets_par_type: { Document: { requetes: 1, octets: 40 * 1024 } } }),
      url: 'http://127.0.0.1:3300/chats/mshy_lagos',
    };

    expect(franchissementsReseau(lourde, sansPlafond)).toEqual([]);
  });

  it("signale sans casser un LCP au-dessus d'une CIBLE", () => {
    const verdict = composeVerdictReseau([mesure({ lcp_ms: 2500 })], reseau);

    expect(verdict.depassements).toEqual([]);
    expect(verdict.avertissements).toHaveLength(1);
    expect(verdict.rc).toBe(0);
  });

  it("ne compare RIEN d'une mesure qui n'a pas abouti — et rougit quand même", () => {
    const verdict = composeVerdictReseau(
      [mesureIndisponible({ url: 'http://127.0.0.1:3300/stories/abc', commande: COMMANDE, raison: 'ECONNREFUSED' })],
      reseau,
    );

    expect(verdict.depassements).toEqual([]);
    expect(verdict.non_mesurees).toHaveLength(1);
    expect(verdict.rc).toBe(1);
  });

  it('rend rc=0 quand tout tient sous les seuils', () => {
    expect(composeVerdictReseau([mesure({})], reseau).rc).toBe(0);
  });
});

describe('le budgets.json du dépôt, côté réseau', () => {
  const budgets: { readonly reseau?: BudgetReseau } = JSON.parse(
    readFileSync(join(__dirname, '..', 'budgets.json'), 'utf8'),
  );
  const reseau = budgets.reseau;

  it('déclare le profil 3G que le § 8.3 suppose, et le percentile', () => {
    expect(reseau?.profil?.download_bps).toEqual(expect.any(Number));
    expect(reseau?.profil?.latence_ms).toBeGreaterThan(0);
    expect(reseau?.profil?.percentile).toBe(75);
    expect(reseau?.profil?.repetitions).toBeGreaterThan(1);
  });

  it('porte les seuils GATE de requêtes avant le premier pixel du § 8.3', () => {
    const pour = (chemin: string) =>
      plafondsDuChemin(chemin, reseau).requetes_avant_premier_pixel;

    expect(pour('/l/abc')?.valeur).toBe(1);
    expect(pour('/l/abc/expired')?.valeur).toBe(2);
    expect(pour('/stories/abc')?.valeur).toBe(3);
    expect(pour('/chats/abc')?.valeur).toBe(4);
    expect(pour('/settings/profil')?.valeur).toBe(10);
    [pour('/l/abc'), pour('/stories/abc'), pour('/chats/abc')].forEach((p) =>
      expect(p?.statut).toBe('GATE'),
    );
  });

  it('porte le GATE « 0 connexion tenue » sur la lecture partagée', () => {
    expect(plafondsDuChemin('/stories/abc', reseau).requetes_pendantes).toEqual(
      expect.objectContaining({ valeur: 0, statut: 'GATE' }),
    );
  });

  it('porte les gates transverses du § 8.5', () => {
    expect(plafondsDuChemin('/stories/abc', reseau).css_ko?.valeur).toBe(20);
    expect(plafondsDuChemin('/stories/abc', reseau).cls).toEqual(
      expect.objectContaining({ valeur: 0.05, statut: 'GATE' }),
    );
  });
});

/**
 * L'agent servi par la mesure — le paramètre qui ferme une JUMELLE.
 *
 * `mesurePage` codait l'agent iPhone en dur. Mesurer une route qui ne rend de
 * pixels QU'À un autre agent — `/l/:token` ne peint que pour un robot d'aperçu,
 * l'humain recevant une 302 — obligeait alors son appelant à réécrire la session
 * CDP, l'écoute des trois événements réseau et le bloc `VITALS` chez lui. C'est
 * ce qu'avait fait `e2e/visual/v3-network-vitals.spec.ts` : trente-cinq lignes
 * identiques au caractère près, qui auraient divergé au premier plafond ajouté.
 */
describe("l'agent que la mesure sert à la page", () => {
  const navigateurDeSonde = () => {
    const contextes: { readonly userAgent?: string }[] = [];
    return {
      contextes,
      navigateur: {
        newContext: async (options: Record<string, unknown>) => {
          contextes.push(options as { readonly userAgent?: string });
          return {
            newPage: async () => ({
              goto: async () => ({ status: () => 200 }),
              evaluate: async () => ({ fcp: 12, lcp: 30, cls: 0, ressources: [] }),
            }),
            newCDPSession: async () => ({
              send: async () => undefined,
              on: () => undefined,
            }),
            close: async () => undefined,
          };
        },
      },
    };
  };

  it("sert l'iPhone du § 8.3 par défaut — les plafonds sont exprimés sur un téléphone", async () => {
    const { navigateur, contextes } = navigateurDeSonde();

    const mesure = await mesurePage({ url: 'https://exemple/', commande: COMMANDE, navigateur });

    expect(mesure.statut).toBe('mesuré');
    expect(contextes[0]?.userAgent).toContain('iPhone');
  });

  it("sert l'agent demandé quand l'appelant en nomme un, sans réécrire la mesure", async () => {
    const { navigateur, contextes } = navigateurDeSonde();
    const robot = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

    const mesure = await mesurePage({
      url: 'https://exemple/l/8fz3',
      commande: COMMANDE,
      navigateur,
      userAgent: robot,
    });

    expect(contextes[0]?.userAgent).toBe(robot);
    expect(mesure.http).toBe(200);
    expect(mesure.fcp_ms).toBe(12);
  });
});
