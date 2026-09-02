import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  composeRapport,
  estGestionnaireDeRoute,
  formateRapport,
  lireEntrees,
  natureDeRoute,
  normaliseRoute,
  verdict,
} from '../scripts/check-bundle-budget.mjs';
import type { Groupe, RegleDeRoute } from '../scripts/check-bundle-budget.mjs';

const KO = 1024;

const plafond = (valeur: number | null, statut: 'GATE' | 'CIBLE' | 'À ÉTABLIR') => ({
  valeur,
  statut,
});

const groupe = (
  id: string,
  motifs: readonly string[],
  plafonds?: Partial<Groupe['plafonds']>,
): Groupe => ({
  id,
  motifs,
  plafonds: {
    socle_ko: plafond(1000, 'CIBLE'),
    ecran_ko: plafond(1000, 'CIBLE'),
    cumul_p95_ko: plafond(1000, 'CIBLE'),
    ...plafonds,
  },
});

const tailles = (table: Readonly<Record<string, number>>) => (chunk: string): number =>
  table[chunk] ?? 0;

// La sortie RÉELLE de `next build` sur une page de groupe, capturée puis commitée.
// C'est le témoin qui manquait : tous les tests précédents écrivaient des clés à
// la main (« /stories/[id]/page »), c'est-à-dire le modèle mental de l'auteur, et
// aucun ne portait le segment de groupe que Next conserve — ni les entrées
// `/layout` et `/not-found` qu'il émet dès qu'une page existe.
const MANIFESTE_REEL = readFileSync(
  join(__dirname, 'fixtures', 'app-build-manifest-groupe-reel.json'),
  'utf8',
);

describe('ce que le manifeste de build DIT', () => {
  it("ne lit aucune route dans un manifeste vide", () => {
    expect(lireEntrees('{"pages":{}}')).toEqual([]);
    expect(lireEntrees('{}')).toEqual([]);
  });

  it('rend la route et ses chunks', () => {
    expect(lireEntrees('{"pages":{"/stories/[id]/page":["a.js","b.js"]}}')).toEqual([
      { route: '/stories/[id]/page', chunks: ['a.js', 'b.js'] },
    ]);
  });

  it('classe les cinq clés réelles par NATURE, pas par un suffixe', () => {
    const natures = lireEntrees(MANIFESTE_REEL).map((e) => [e.route, natureDeRoute(e.route)]);

    expect(Object.fromEntries(natures)).toEqual({
      '/(public)/stories/[id]/page': 'page',
      '/_not-found/page': 'page',
      '/not-found': 'annexe',
      '/layout': 'annexe',
      '/healthz/route': 'gestionnaire',
    });
  });

  it("distingue un gestionnaire de route d'une page", () => {
    expect(estGestionnaireDeRoute('/healthz/route')).toBe(true);
    expect(estGestionnaireDeRoute('/l/[token]/route')).toBe(true);
    expect(estGestionnaireDeRoute('/stories/[id]/page')).toBe(false);
  });

  it("sort en ANOMALIE une clé dont il ne sait rien — jamais en page silencieuse", () => {
    const rapport = composeRapport({
      entrees: lireEntrees('{"pages":{"/quelque-chose-de-neuf":["a.js"]}}'),
      groupes: [groupe('(public)', ['/*'])],
      tailleGzip: tailles({ 'a.js': KO }),
    });

    expect(rapport.pages).toBe(0);
    expect(rapport.anomalies[0]).toContain('nature inconnue');
    expect(verdict(rapport)).toBe(2);
  });
});

describe('le segment de groupe que Next conserve dans la clé', () => {
  it("retire les segments (…) — ils ne sont JAMAIS servis dans l'URL", () => {
    expect(normaliseRoute('/(public)/stories/[id]/page')).toBe('/stories/[id]/page');
    expect(normaliseRoute('/(connected)/settings/page')).toBe('/settings/page');
    expect(normaliseRoute('/(public)/page')).toBe('/page');
    expect(normaliseRoute('/healthz/route')).toBe('/healthz/route');
  });

  it("classe la clé RÉELLE d'une page de groupe, sans anomalie", () => {
    const rapport = composeRapport({
      entrees: lireEntrees(MANIFESTE_REEL),
      groupes: [groupe('(public)', ['/stories/*', '/_not-found/page'])],
      tailleGzip: () => 0,
    });

    expect(rapport.anomalies).toEqual([]);
    expect(rapport.pages).toBe(2);
    expect(rapport.gestionnaires).toBe(1);
    expect(rapport.annexes).toBe(2);
    expect(verdict(rapport)).toBe(0);
  });

  it('laisse un motif qui porte lui-même un (…) trancher entre deux groupes', () => {
    const rapport = composeRapport({
      entrees: lireEntrees('{"pages":{"/(connected)/page":["a.js"]}}'),
      groupes: [groupe('(public)', ['/page']), groupe('(connected)', ['/(connected)/page'])],
      tailleGzip: tailles({ 'a.js': KO }),
    });

    expect(rapport.anomalies).toEqual([]);
    expect(rapport.groupes.map((l) => l.groupe)).toEqual(['(connected)']);
  });
});

describe('le socle et son écran, rendus séparément', () => {
  const entrees = lireEntrees(
    JSON.stringify({
      pages: {
        '/stories/[id]/page': ['socle.js', 'story.js'],
        '/reels/[id]/page': ['socle.js', 'reel.js'],
      },
    }),
  );
  const tailleGzip = tailles({
    'socle.js': 50 * KO,
    'story.js': 10 * KO,
    'reel.js': 30 * KO,
  });

  it("appelle socle ce que TOUTES les pages du groupe chargent, et écran le reste", () => {
    const [ligne] = composeRapport({
      entrees,
      groupes: [groupe('(public)', ['/stories/*', '/reels/*'])],
      tailleGzip,
    }).groupes;

    expect(ligne?.socle_ko).toBe(50);
    expect(ligne?.ecran_le_plus_lourd).toEqual({ route: '/reels/[id]/page', ko: 30 });
  });

  it('rend le cumul p95 du groupe — socle compris', () => {
    const [ligne] = composeRapport({
      entrees,
      groupes: [groupe('(public)', ['/stories/*', '/reels/*'])],
      tailleGzip,
    }).groupes;

    expect(ligne?.cumul_p95_ko).toBe(80);
  });

  it('rend TROIS lignes par groupe, pas une', () => {
    const texte = formateRapport(
      composeRapport({
        entrees,
        groupes: [groupe('(public)', ['/stories/*', '/reels/*'])],
        tailleGzip,
      }),
    );

    expect(texte).toContain('socle');
    expect(texte).toContain('écran le plus lourd');
    expect(texte).toContain('cumul p95');
  });
});

// Le cas que produit la PREMIÈRE page réelle de la v3, et le seul où
// l'intersection qui définit le socle n'a rien à intersecter.
describe("un groupe qui ne porte QU'UNE page", () => {
  const entrees = lireEntrees('{"pages":{"/stories/[id]/page":["a.js","b.js","c.js"]}}');
  const tailleGzip = tailles({ 'a.js': 10 * KO, 'b.js': 20 * KO, 'c.js': 270 * KO });

  it("n'appelle pas socle ce qu'aucune comparaison n'a établi", () => {
    const [ligne] = composeRapport({
      entrees,
      groupes: [groupe('(public)', ['/stories/*'])],
      tailleGzip,
    }).groupes;

    expect(ligne?.socle_ko).toBeNull();
    expect(ligne?.socle_indetermine).toContain('une');
    expect(formateRapport(
      composeRapport({ entrees, groupes: [groupe('(public)', ['/stories/*'])], tailleGzip }),
    )).toContain('indéterminé');
  });

  it('impute le poids ENTIER à l\'écran — là où le plafond mord', () => {
    const rapport = composeRapport({
      entrees,
      groupes: [groupe('(public)', ['/stories/*'], { ecran_ko: plafond(95, 'GATE') })],
      tailleGzip,
    });

    expect(rapport.groupes[0]?.ecran_le_plus_lourd).toEqual({
      route: '/stories/[id]/page',
      ko: 300,
    });
    expect(rapport.depassements).toHaveLength(1);
    expect(rapport.depassements[0]).toContain('300 Ko > 95 Ko');
    expect(verdict(rapport)).toBe(1);
  });

  it("ne se réfugie plus derrière un plafond « À ÉTABLIR » non comparé", () => {
    const rapport = composeRapport({
      entrees,
      groupes: [
        groupe('(public)', ['/stories/*'], {
          socle_ko: plafond(null, 'À ÉTABLIR'),
          ecran_ko: plafond(95, 'CIBLE'),
        }),
      ],
      tailleGzip,
    });

    expect(rapport.avertissements).toHaveLength(1);
    expect(rapport.avertissements[0]).toContain('écran le plus lourd : 300 Ko');
  });
});

describe('les plafonds', () => {
  const entrees = lireEntrees(
    JSON.stringify({
      pages: {
        '/stories/[id]/page': ['socle.js', 'story.js'],
        '/reels/[id]/page': ['socle.js', 'reel.js'],
      },
    }),
  );
  const tailleGzip = tailles({ 'socle.js': 50 * KO, 'story.js': 100 * KO, 'reel.js': 10 * KO });

  it("échoue quand un plafond GATE est dépassé", () => {
    const rapport = composeRapport({
      entrees,
      groupes: [groupe('(public)', ['/stories/*', '/reels/*'], { ecran_ko: plafond(95, 'GATE') })],
      tailleGzip,
    });

    expect(rapport.depassements).toHaveLength(1);
    expect(rapport.depassements[0]).toContain('(public)');
    expect(verdict(rapport)).toBe(1);
  });

  it("signale sans échouer quand une CIBLE est dépassée", () => {
    const rapport = composeRapport({
      entrees,
      groupes: [groupe('(public)', ['/stories/*', '/reels/*'], { ecran_ko: plafond(95, 'CIBLE') })],
      tailleGzip,
    });

    expect(rapport.depassements).toEqual([]);
    expect(rapport.avertissements).toHaveLength(1);
    expect(verdict(rapport)).toBe(0);
  });
});

describe('les plafonds attachés à une ROUTE nommée', () => {
  const routes: readonly RegleDeRoute[] = [
    { motifs: ['/l/*'], plafonds: { js_ko: plafond(0, 'GATE') } },
    { motifs: ['/l/[token]/expired/page'], plafonds: { js_ko: plafond(10, 'CIBLE') } },
  ];

  it("attrape un /l/:token qui expédie du JS là où le groupe l'autoriserait", () => {
    const rapport = composeRapport({
      entrees: lireEntrees('{"pages":{"/(public)/l/[token]/page":["a.js"]}}'),
      groupes: [groupe('(public)', ['/l/*'], { ecran_ko: plafond(95, 'CIBLE') })],
      routes,
      tailleGzip: tailles({ 'a.js': 40 * KO }),
    });

    expect(rapport.depassements).toHaveLength(1);
    expect(rapport.depassements[0]).toContain('40 Ko de JS > 0 Ko (GATE');
    expect(verdict(rapport)).toBe(1);
  });

  it('laisse le motif le plus précis prendre le pas sur le GATE du préfixe', () => {
    const rapport = composeRapport({
      entrees: lireEntrees('{"pages":{"/(public)/l/[token]/expired/page":["a.js"]}}'),
      groupes: [groupe('(public)', ['/l/*'])],
      routes,
      tailleGzip: tailles({ 'a.js': 8 * KO }),
    });

    expect(rapport.depassements).toEqual([]);
    expect(rapport.avertissements).toEqual([]);
  });
});

describe('le ratchet — ce qui interdit la croissance SILENCIEUSE', () => {
  const entrees = lireEntrees(
    '{"pages":{"/stories/[id]/page":["socle.js","a.js"],"/reels/[id]/page":["socle.js","b.js"]}}',
  );
  const tailleGzip = tailles({ 'socle.js': 50 * KO, 'a.js': 10 * KO, 'b.js': 10 * KO });

  it('rougit quand une valeur mesurée dépasse celle enregistrée', () => {
    const rapport = composeRapport({
      entrees,
      groupes: [groupe('(public)', ['/stories/*', '/reels/*'])],
      tailleGzip,
      mesuresEnregistrees: { groupes: { '(public)': { socle_ko: 40, ecran_ko: 10, cumul_p95_ko: 60 } } },
    });

    expect(rapport.regressions).toHaveLength(1);
    expect(rapport.regressions[0]).toContain('socle : 50 Ko > 40 Ko enregistré');
    expect(verdict(rapport)).toBe(1);
  });

  it('se tait quand rien ne dépasse ce qui est enregistré', () => {
    const rapport = composeRapport({
      entrees,
      groupes: [groupe('(public)', ['/stories/*', '/reels/*'])],
      tailleGzip,
      mesuresEnregistrees: { groupes: { '(public)': { socle_ko: 50, ecran_ko: 10, cumul_p95_ko: 60 } } },
    });

    expect(rapport.regressions).toEqual([]);
    expect(verdict(rapport)).toBe(0);
  });

  it("n'invente aucune référence pour un groupe qu'il n'a jamais enregistré", () => {
    const rapport = composeRapport({
      entrees,
      groupes: [groupe('(public)', ['/stories/*', '/reels/*'])],
      tailleGzip,
      mesuresEnregistrees: { groupes: {} },
    });

    expect(rapport.regressions).toEqual([]);
  });
});

describe("le squelette d'aujourd'hui", () => {
  it("rend 0 Ko : un gestionnaire de route n'expédie aucun JS au navigateur", () => {
    const rapport = composeRapport({
      entrees: lireEntrees('{"pages":{"/healthz/route":["framework.js","main.js"]}}'),
      groupes: [groupe('(public)', ['/*'])],
      tailleGzip: tailles({ 'framework.js': 60 * KO, 'main.js': 40 * KO }),
    });

    expect(rapport.pages).toBe(0);
    expect(rapport.gestionnaires).toBe(1);
    expect(rapport.groupes).toEqual([]);
    expect(verdict(rapport)).toBe(0);
    expect(formateRapport(rapport)).toContain('0 Ko');
  });
});

describe("aucun écran n'entre sans budget", () => {
  it('refuse une page qu\'aucun motif ne réclame', () => {
    const rapport = composeRapport({
      entrees: lireEntrees('{"pages":{"/composer/page":["a.js"]}}'),
      groupes: [groupe('(public)', ['/stories/*'])],
      tailleGzip: tailles({ 'a.js': KO }),
    });

    expect(rapport.anomalies).toHaveLength(1);
    expect(rapport.anomalies[0]).toContain('/composer/page');
    expect(verdict(rapport)).toBe(2);
  });

  it('refuse une page que deux motifs de même précision réclament', () => {
    const rapport = composeRapport({
      entrees: lireEntrees('{"pages":{"/chats/[key]/page":["a.js"]}}'),
      groupes: [groupe('(public)', ['/chats/*']), groupe('(connected)', ['/chats/*'])],
      tailleGzip: tailles({ 'a.js': KO }),
    });

    expect(rapport.anomalies).toHaveLength(1);
    expect(rapport.anomalies[0]).toContain('ambigu');
    expect(verdict(rapport)).toBe(2);
  });

  it('tranche par PRÉCISION quand un motif est plus littéral que l\'autre', () => {
    const rapport = composeRapport({
      entrees: lireEntrees('{"pages":{"/stories/new/page":["a.js"]}}'),
      groupes: [groupe('(public)', ['/stories/*']), groupe('(connected)', ['/stories/new/page'])],
      tailleGzip: tailles({ 'a.js': KO }),
    });

    expect(rapport.anomalies).toEqual([]);
    expect(rapport.groupes.map((l) => l.groupe)).toEqual(['(connected)']);
  });
});

describe('le fichier budgets.json du dépôt', () => {
  type Budgets = {
    readonly groupes?: readonly Groupe[];
    readonly routes?: readonly RegleDeRoute[];
    readonly questions_ouvertes?: readonly { readonly id: string; readonly constat: string }[];
    readonly reseau?: {
      readonly ecrans?: readonly {
        readonly motifs: readonly string[];
        readonly plafonds: Readonly<
          Record<string, { readonly valeur: number | null; readonly statut: string }>
        >;
      }[];
    };
  };

  const budgets: Budgets = JSON.parse(readFileSync(join(__dirname, '..', 'budgets.json'), 'utf8'));
  const groupes = budgets.groupes ?? [];

  it('déclare les deux zones de la conception', () => {
    expect(groupes.map((g) => g.id).sort()).toEqual(['(connected)', '(public)']);
  });

  it('porte, pour chaque plafond, un statut connu', () => {
    const statuts = groupes.flatMap((g) => Object.values(g.plafonds).map((p) => p.statut));

    expect(statuts.length).toBeGreaterThan(0);
    statuts.forEach((s) => expect(['GATE', 'CIBLE', 'À ÉTABLIR']).toContain(s));
  });

  it("ne compare rien à un plafond « À ÉTABLIR » — un chiffre non mesuré ne s'invente pas", () => {
    const aEtablir = groupes.flatMap((g) =>
      Object.values(g.plafonds).filter((p) => p.statut === 'À ÉTABLIR'),
    );

    expect(aEtablir.length).toBeGreaterThan(0);
    aEtablir.forEach((p) => expect(p.valeur).toBeNull());
  });

  it('réclame toutes les routes de la lecture partagée, rôle premier', () => {
    const motifs = groupes.flatMap((g) => (g.id === '(public)' ? g.motifs : []));

    ['/stories/*', '/posts/*', '/reels/*', '/moods/*', '/l/*'].forEach((motif) =>
      expect(motifs).toContain(motif),
    );
  });

  it('porte au moins un plafond GATE — sans quoi aucune commande ne peut rougir sur un poids', () => {
    const gates = (budgets.routes ?? []).flatMap((r) =>
      Object.values(r.plafonds).filter((p) => p?.statut === 'GATE'),
    );

    expect(gates.length).toBeGreaterThan(0);
    gates.forEach((p) => expect(p?.valeur).toEqual(expect.any(Number)));
  });

  it('réclame CHAQUE page du manifeste réel, segment de groupe compris', () => {
    const rapport = composeRapport({
      entrees: lireEntrees(MANIFESTE_REEL),
      groupes,
      routes: budgets.routes,
      tailleGzip: () => 0,
    });

    expect(rapport.anomalies).toEqual([]);
    expect(rapport.pages).toBe(2);
    expect(verdict(rapport)).toBe(0);
  });

  // Le plancher d'App Router — mesuré, pas supposé — dépasse le plafond du rôle
  // premier AVANT toute ligne de code produit. Tant que c'est vrai, la
  // contradiction doit être DÉCLARÉE : c'est une décision d'architecture, pas
  // un détail de gate.
  describe('le plancher mesuré contre le plafond du rôle premier', () => {
    const mesures: {
      readonly plancher_next_ko?: number;
      readonly plancher_next_requetes?: { readonly valeur?: number };
    } = JSON.parse(
      readFileSync(join(__dirname, '..', 'budgets-mesures.json'), 'utf8'),
    );

    it('mesure le plancher plutôt que de le supposer', () => {
      expect(mesures.plancher_next_ko).toEqual(expect.any(Number));
    });

    it('déclare toute zone dont le plafond par écran est SOUS le plancher mesuré', () => {
      const plancher = mesures.plancher_next_ko ?? 0;
      const sousLePlancher = groupes.filter(
        (g) => g.plafonds.ecran_ko.valeur !== null && g.plafonds.ecran_ko.valeur < plancher,
      );
      const declare = (budgets.questions_ouvertes ?? []).map((q) => `${q.id} ${q.constat}`).join(' ');

      expect(sousLePlancher.map((g) => g.id)).toEqual(['(public)']);
      sousLePlancher.forEach((g) =>
        expect(declare).toContain(String(g.plafonds.ecran_ko.valeur)),
      );
      expect(declare).toContain('plancher');
    });

    /**
     * La même contradiction, comptée en REQUÊTES — celle que le premier écran
     * rendu par une page rencontre (§ 8.3, `/l/:token/expired` : 2 « HTML +
     * CSS »). Le runtime d'App Router en pose quatre de plus dans le `<head>`
     * de toute page, y compris une page sans un seul composant client.
     *
     * Ce témoin ne juge pas le chiffre : il exige qu'un GATE que le PLANCHER
     * franchit soit DÉCLARÉ. Un gate franchi par construction et non déclaré
     * est un gate que la première exécution rouge fera desserrer en silence.
     */
    it('déclare le plancher de requêtes dès qu’un GATE d’écran passe en dessous', () => {
      const plancher = mesures.plancher_next_requetes?.valeur ?? 0;
      const franchis = (budgets.reseau?.ecrans ?? []).filter((ecran) => {
        const plafond = ecran.plafonds.requetes_avant_premier_pixel;
        return plafond?.statut === 'GATE' && plafond.valeur !== null && plafond.valeur < plancher;
      });
      const declare = (budgets.questions_ouvertes ?? []).map((q) => `${q.id} ${q.constat}`).join(' ');

      expect(plancher).toBeGreaterThan(0);
      expect(franchis.map((ecran) => ecran.motifs.join(','))).toContain('/l/*/expired');
      expect(declare).toContain(String(plancher));
    });
  });
});
