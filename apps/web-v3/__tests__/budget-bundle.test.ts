/**
 * @jest-environment node
 *
 * Ce que ce temoin gage : `scripts/check-bundle-budget.mjs` REND UN CHIFFRE, et
 * ce chiffre est celui des octets reellement servis — jamais une estimation,
 * jamais un zero de complaisance.
 *
 * Il est ecrit contre la LIGNE DE COMMANDE, pas contre les fonctions internes :
 * c'est la commande que la conception cite (§ 8.2), c'est elle que la CI
 * lancera, et c'est son CODE DE SORTIE qui casse ou non le build. Un test qui
 * appellerait la fonction interne laisserait le contrat de sortie sans temoin.
 *
 * Trois codes, trois sens, et la distinction porte tout le lot :
 *   rc=0  mesure faite, tout tient dans son plafond (le squelette vide en fait
 *         partie : zero route, zero octet, c'est un FAIT, pas un echec) ;
 *   rc=1  mesure faite, un plafond est depasse ;
 *   rc=2  mesure IMPOSSIBLE (pas de build, manifeste illisible, morceau
 *         reference mais absent). Ne JAMAIS confondre avec rc=0 : « je n'ai
 *         pas pu mesurer » et « j'ai mesure zero » sont deux mondes.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const zoneRoot = join(__dirname, '..');
const script = join(zoneRoot, 'scripts', 'check-bundle-budget.mjs');

type Sortie = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

type RapportRoute = {
  readonly route: string;
  readonly entree_du_manifeste: string;
  readonly groupe: string;
  readonly octets_total: number;
  readonly octets_socle: number;
  readonly octets_ecran: number;
  readonly plafond_ecran: number;
  readonly source_du_plafond: string;
  readonly statut: string;
};

type RapportGroupe = {
  readonly groupe: string;
  readonly socle_octets: number;
  readonly ecran_le_plus_lourd_octets: number;
  readonly cumul_p95_octets: number;
};

type Rapport = {
  readonly verdict: string;
  readonly routes: readonly RapportRoute[];
  readonly groupes: readonly RapportGroupe[];
  readonly depassements: readonly string[];
  readonly regressions: readonly string[];
  readonly sans_plafond: readonly string[];
  readonly ecarts_de_cible: readonly string[];
};

/**
 * Un morceau JS INCOMPRESSIBLE. Le temoin doit distinguer un poids d'un
 * plafond : un contenu compressible ferait tomber n'importe quel volume sous
 * n'importe quel plafond, et le test passerait au vert sans rien prouver.
 */
const morceau = (octets: number): Buffer => randomBytes(octets);

const gzip = (...contenus: readonly Buffer[]): number =>
  contenus.reduce((total, c) => total + gzipSync(c, { level: 9 }).length, 0);

const arbre = (): string => mkdtempSync(join(tmpdir(), 'web-v3-budget-'));

const ecrire = (racine: string, relatif: string, contenu: string | Buffer): void => {
  mkdirSync(join(racine, dirname(relatif)), { recursive: true });
  writeFileSync(join(racine, relatif), contenu);
};

const poserManifeste = (racine: string, pages: Record<string, readonly string[]>): void =>
  ecrire(racine, '.next/app-build-manifest.json', JSON.stringify({ pages }));

const poserBudgets = (racine: string, budgets: unknown): void =>
  ecrire(racine, 'budgets.json', JSON.stringify(budgets));

const lancer = (racine: string, ...args: readonly string[]): Sortie => {
  try {
    const stdout = execFileSync(process.execPath, [script, '--racine', racine, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (erreur) {
    const e = erreur as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
};

const rapportDe = (
  racine: string,
  ...args: readonly string[]
): { sortie: Sortie; rapport: Rapport } => {
  const json = join(racine, 'rapport.json');
  const sortie = lancer(racine, '--json', json, ...args);
  return { sortie, rapport: JSON.parse(readFileSync(json, 'utf8')) as Rapport };
};

const budgetsLarges = {
  groupes: {
    '(public)': { socle: 999999, ecran: 999999, statut: 'CIBLE' },
    '(connected)': { socle: 999999, ecran: 999999, statut: 'CIBLE' },
    '(racine)': { socle: 999999, ecran: 999999, statut: 'CIBLE' },
  },
  routes: {},
};

describe('sans mesure possible, le budget ECHOUE — il ne rend pas zero', () => {
  it("le dit et nomme la commande qui manque quand la zone n'a jamais ete construite", () => {
    const racine = arbre();
    try {
      poserBudgets(racine, budgetsLarges);
      const sortie = lancer(racine);

      expect(sortie.code).toBe(2);
      expect(sortie.stderr).toContain('app-build-manifest.json');
      expect(sortie.stderr).toContain('build');
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it("echoue quand un morceau du manifeste n'existe pas dans le build : un fichier absent n'est pas un fichier vide", () => {
    const racine = arbre();
    try {
      poserBudgets(racine, budgetsLarges);
      poserManifeste(racine, { '/(public)/page': ['static/chunks/fantome.js'] });
      const sortie = lancer(racine);

      expect(sortie.code).toBe(2);
      expect(sortie.stderr).toContain('fantome.js');
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

describe('sur un squelette vide, il rend 0 Ko et passe', () => {
  it('mesure zero route, zero octet, et le DIT — sans echouer', () => {
    const racine = arbre();
    try {
      poserBudgets(racine, budgetsLarges);
      poserManifeste(racine, {});
      const { sortie, rapport } = rapportDe(racine);

      expect(sortie.code).toBe(0);
      expect(rapport.verdict).toBe('squelette-vide');
      expect(rapport.routes).toEqual([]);
      expect(sortie.stdout).toContain('0 Ko');
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

describe('une route est nommee par son chemin PUBLIC, jamais par le chemin interne du manifeste', () => {
  it('traduit `/(public)/stories/[id]/page` en `/stories/:id`, et garde la trace de son origine', () => {
    const racine = arbre();
    try {
      ecrire(racine, '.next/static/chunks/a.js', morceau(1000));
      poserBudgets(racine, budgetsLarges);
      poserManifeste(racine, { '/(public)/stories/[id]/page': ['static/chunks/a.js'] });

      const { rapport } = rapportDe(racine);

      expect(rapport.routes[0]?.route).toBe('/stories/:id');
      expect(rapport.routes[0]?.entree_du_manifeste).toBe('/(public)/stories/[id]/page');
      expect(rapport.routes[0]?.groupe).toBe('(public)');
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it("range hors groupe ce qui n'est dans aucun groupe de routes", () => {
    const racine = arbre();
    try {
      ecrire(racine, '.next/static/chunks/a.js', morceau(1000));
      poserBudgets(racine, budgetsLarges);
      poserManifeste(racine, { '/page': ['static/chunks/a.js'] });

      const { rapport } = rapportDe(racine);

      expect(rapport.routes[0]?.route).toBe('/');
      expect(rapport.routes[0]?.groupe).toBe('(racine)');
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

describe('le chiffre rendu est celui des octets gzip reellement servis', () => {
  it('pese chaque morceau de la route, une seule fois', () => {
    const racine = arbre();
    try {
      const a = morceau(20000);
      const b = morceau(9000);
      ecrire(racine, '.next/static/chunks/a.js', a);
      ecrire(racine, '.next/static/chunks/b.js', b);
      poserBudgets(racine, budgetsLarges);
      poserManifeste(racine, {
        '/(public)/page': ['static/chunks/a.js', 'static/chunks/b.js', 'static/chunks/a.js'],
      });

      const { sortie, rapport } = rapportDe(racine);

      expect(sortie.code).toBe(0);
      expect(rapport.routes[0]?.octets_total).toBe(gzip(a, b));
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it('separe le SOCLE (ce que toutes les routes du groupe partagent) du code d ECRAN', () => {
    const racine = arbre();
    try {
      const commun = morceau(30000);
      const propreA = morceau(8000);
      const propreB = morceau(4000);
      ecrire(racine, '.next/static/chunks/commun.js', commun);
      ecrire(racine, '.next/static/chunks/a.js', propreA);
      ecrire(racine, '.next/static/chunks/b.js', propreB);
      poserBudgets(racine, budgetsLarges);
      poserManifeste(racine, {
        '/(public)/stories/[id]/page': ['static/chunks/commun.js', 'static/chunks/a.js'],
        '/(public)/posts/[id]/page': ['static/chunks/commun.js', 'static/chunks/b.js'],
      });

      const { rapport } = rapportDe(racine);
      const groupe = rapport.groupes.find((g) => g.groupe === '(public)');
      const story = rapport.routes.find((r) => r.route === '/stories/:id');

      expect(groupe?.socle_octets).toBe(gzip(commun));
      expect(story?.octets_socle).toBe(gzip(commun));
      expect(story?.octets_ecran).toBe(gzip(propreA));
      expect(groupe?.ecran_le_plus_lourd_octets).toBe(gzip(propreA));
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it('rend TROIS lignes par groupe : socle, ecran le plus lourd, cumul p95 (§ 8.4)', () => {
    const racine = arbre();
    try {
      ecrire(racine, '.next/static/chunks/commun.js', morceau(30000));
      ecrire(racine, '.next/static/chunks/a.js', morceau(8000));
      poserBudgets(racine, budgetsLarges);
      poserManifeste(racine, {
        '/(public)/page': ['static/chunks/commun.js', 'static/chunks/a.js'],
      });

      const { sortie, rapport } = rapportDe(racine);

      expect(rapport.groupes).toHaveLength(1);
      expect(sortie.stdout).toMatch(/\(public\).*socle.*ecran le plus lourd.*cumul p95/);
      expect(rapport.groupes[0]?.cumul_p95_octets).toBeGreaterThan(0);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

describe('un plafond depasse casse le build, en nommant le coupable et les deux chiffres', () => {
  it('echoue en rc=1 et cite la route, la mesure et le plafond', () => {
    const racine = arbre();
    try {
      const lourd = morceau(60000);
      ecrire(racine, '.next/static/chunks/lourd.js', lourd);
      poserBudgets(racine, {
        groupes: { '(public)': { socle: 999999, ecran: 1024, statut: 'GATE' } },
        routes: {},
      });
      poserManifeste(racine, { '/(public)/stories/[id]/page': ['static/chunks/lourd.js'] });

      const { sortie, rapport } = rapportDe(racine);

      expect(sortie.code).toBe(1);
      expect(rapport.verdict).toBe('depassement');
      expect(sortie.stderr).toContain('/stories/:id');
      expect(sortie.stderr).toContain(String(gzip(lourd)));
      expect(sortie.stderr).toContain('1024');
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it("rapporte, sans casser la CI, un plafond CIBLE franchi — c'est un chiffre a confirmer, pas une loi (§ 8.3)", () => {
    const racine = arbre();
    try {
      ecrire(racine, '.next/static/chunks/lourd.js', morceau(60000));
      poserBudgets(racine, {
        groupes: { '(public)': { socle: 999999, ecran: 1024, statut: 'CIBLE' } },
        routes: {},
      });
      poserManifeste(racine, { '/(public)/stories/[id]/page': ['static/chunks/lourd.js'] });

      const { sortie, rapport } = rapportDe(racine);

      expect(sortie.code).toBe(0);
      expect(rapport.ecarts_de_cible).toHaveLength(1);
      expect(rapport.depassements).toEqual([]);
      expect(sortie.stdout).toContain('HORS CIBLE');
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it("tient le GATE a 0 octet de `/l/:token` : le moindre octet de JS d'ecran le casse", () => {
    const racine = arbre();
    try {
      ecrire(racine, '.next/static/chunks/l.js', morceau(500));
      poserBudgets(racine, {
        groupes: { '(public)': { socle: 999999, ecran: 999999, statut: 'CIBLE' } },
        routes: { '/l/:token': { ecran: 0, statut: 'GATE' } },
      });
      poserManifeste(racine, { '/(public)/l/[token]/route': ['static/chunks/l.js'] });

      const { sortie, rapport } = rapportDe(racine);

      expect(sortie.code).toBe(1);
      expect(rapport.routes[0]?.source_du_plafond).toBe('route');
      expect(rapport.routes[0]?.plafond_ecran).toBe(0);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it('le plafond nomme pour une route prime sur celui de son groupe', () => {
    const racine = arbre();
    try {
      const petit = morceau(2000);
      ecrire(racine, '.next/static/chunks/petit.js', petit);
      poserBudgets(racine, {
        groupes: { '(connected)': { socle: 999999, ecran: 10, statut: 'CIBLE' } },
        routes: { '/chats': { ecran: 999999, statut: 'CIBLE' } },
      });
      poserManifeste(racine, { '/(connected)/chats/page': ['static/chunks/petit.js'] });

      const { sortie, rapport } = rapportDe(racine);

      expect(sortie.code).toBe(0);
      expect(rapport.routes[0]?.source_du_plafond).toBe('route');
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

describe('les plafonds commites sont ceux de la conception', () => {
  const budgets = JSON.parse(readFileSync(join(zoneRoot, 'budgets.json'), 'utf8')) as {
    readonly groupes: Record<string, { readonly socle: number; readonly ecran: number }>;
    readonly routes: Record<
      string,
      { readonly ecran: number; readonly statut: string; readonly requetes_avant_premier_pixel?: number }
    >;
  };

  it('pose le GATE a 0 octet sur la redirection de lien (§ 8.3)', () => {
    expect(budgets.routes['/l/:token']).toEqual(
      expect.objectContaining({ ecran: 0, statut: 'GATE', requetes_avant_premier_pixel: 1 }),
    );
  });

  it('pose le socle connecte a 150 Ko et la lecture partagee a 95 Ko (§ 8.3)', () => {
    expect(budgets.groupes['(connected)']?.socle).toBe(150 * 1024);
    expect(budgets.groupes['(public)']?.ecran).toBe(95 * 1024);
  });

  it('sont lus tels quels par le script : le fichier commite est utilisable', () => {
    const racine = arbre();
    try {
      poserManifeste(racine, {});
      const json = join(racine, 'rapport.json');
      const sortie = lancer(racine, '--budgets', join(zoneRoot, 'budgets.json'), '--json', json);

      expect(sortie.code).toBe(0);
      expect((JSON.parse(readFileSync(json, 'utf8')) as Rapport).verdict).toBe('squelette-vide');
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

/**
 * Le RATCHET du § 8.3. La conception ecrit : « CIBLE = valeur a confirmer par la
 * premiere mesure ; jusque-la le gate ENREGISTRE la valeur mesuree et interdit
 * toute REGRESSION (ratchet strictement decroissant) ». La premiere moitie
 * etait implementee, la seconde non — rien n'enregistrait, donc aucune
 * regression n'etait detectable. Consequence chiffree : une seule ligne de
 * `budgets.json` portait un plafond de bundle GATE (`/l/:token`, ecran a 0 o),
 * et c'est precisement la route SANS bundle, absente du manifeste. Le gate ne
 * pouvait litteralement pas echouer.
 */
describe('le ratchet du § 8.3 : une valeur enregistree ne remonte jamais', () => {
  const poserRatchet = (racine: string, valeurs: Record<string, number>): string => {
    const fichier = join(racine, 'ratchet.json');
    writeFileSync(fichier, JSON.stringify({ genere_le: '2026-08-30T00:00:00.000Z', valeurs }));
    return fichier;
  };

  const zoneAvecUneRoute = (octets: number): string => {
    const racine = arbre();
    ecrire(racine, '.next/static/ecran.js', morceau(octets));
    poserManifeste(racine, { '/(public)/stories/[id]/page': ['static/ecran.js'] });
    poserBudgets(racine, budgetsLarges);
    return racine;
  };

  it('ECHOUE quand une route grossit au-dela de la valeur enregistree, meme SOUS le plafond CIBLE', () => {
    const racine = zoneAvecUneRoute(40000);
    const ratchet = poserRatchet(racine, { 'bundle:/stories/:id:ecran_octets': 1000 });

    const { sortie, rapport } = rapportDe(racine, '--ratchet', ratchet);

    expect(sortie.code).toBe(1);
    expect(rapport.verdict).toBe('depassement');
    expect(rapport.regressions).toEqual([expect.stringContaining('bundle:/stories/:id:ecran_octets')]);
    expect(rapport.depassements).toEqual([]);
    expect(sortie.stderr).toMatch(/ratchet/);
  });

  it('passe quand la route a MAIGRI depuis la derniere mesure', () => {
    const racine = zoneAvecUneRoute(1000);
    const ratchet = poserRatchet(racine, { 'bundle:/stories/:id:ecran_octets': 999999 });

    expect(lancer(racine, '--ratchet', ratchet).code).toBe(0);
  });

  it("n'invente aucune regression sur une mesure NEUVE : sans valeur enregistree, il n'y a rien contre quoi regresser", () => {
    const racine = zoneAvecUneRoute(40000);
    const ratchet = poserRatchet(racine, {});

    const { sortie, rapport } = rapportDe(racine, '--ratchet', ratchet);

    expect(sortie.code).toBe(0);
    expect(rapport.regressions).toEqual([]);
  });

  it('`--enregistrer` ecrit le MINIMUM par cle — le meilleur etat atteint, jamais le dernier', () => {
    const racine = zoneAvecUneRoute(1000);
    const ratchet = poserRatchet(racine, {
      'bundle:/stories/:id:ecran_octets': 999999,
      'bundle:/autre:ecran_octets': 42,
    });

    lancer(racine, '--ratchet', ratchet, '--enregistrer');
    const ecrit = JSON.parse(readFileSync(ratchet, 'utf8')) as {
      readonly valeurs: Record<string, number>;
    };

    expect(ecrit.valeurs['bundle:/stories/:id:ecran_octets']).toBeLessThan(999999);
    expect(ecrit.valeurs['bundle:/autre:ecran_octets']).toBe(42);
  });
});

/**
 * Une route qu'AUCUN plafond ne gouverne n'est pas une route verte.
 * `plafondDe()` calculait deja `statut: 'ABSENT'` et l'appelant le jetait :
 * `octetsEcran > null` etant faux, la route sortait `vert`, sans un mot.
 */
describe("une route sans plafond n'est pas une route verte", () => {
  it('sort en rc=3 et la NOMME, au lieu de la classer verte en silence', () => {
    const racine = arbre();
    ecrire(racine, '.next/static/ecran.js', morceau(40000));
    poserManifeste(racine, { '/(inconnu)/mystere/page': ['static/ecran.js'] });
    poserBudgets(racine, { groupes: {}, routes: {} });

    const { sortie, rapport } = rapportDe(racine);

    expect(sortie.code).toBe(3);
    expect(rapport.verdict).toBe('sans-plafond');
    expect(rapport.sans_plafond).toEqual([expect.stringContaining('/mystere')]);
    expect(sortie.stdout).toMatch(/SANS PLAFOND/);
  });
});

/**
 * Le budget de bundle nomme une route d'apres le REPERTOIRE du build
 * (`chats/[key]` ⇒ `/chats/:key`) ; `budgets.json` la nomme d'apres la matrice
 * (`/chats/:lien`). Le rapprochement se faisait par egalite de CHAINE : la
 * route retombait donc en silence sur le plafond de son GROUPE — plus large que
 * le sien — sans qu'aucun temoin ne rougisse. Le nom d'un parametre n'appartient
 * pas a l'espace de noms des routes.
 */
describe('le nom d un parametre ne change pas le plafond qui gouverne une route', () => {
  it('applique la ligne NOMMEE meme quand le repertoire du build nomme son segment autrement', () => {
    const racine = arbre();
    ecrire(racine, '.next/static/ecran.js', morceau(40000));
    poserManifeste(racine, { '/(public)/chats/[key]/page': ['static/ecran.js'] });
    poserBudgets(racine, {
      groupes: { '(public)': { socle: 999999, ecran: 999999, statut: 'CIBLE' } },
      routes: { '/chats/:lien': { ecran: 1, statut: 'GATE' } },
    });

    const { sortie, rapport } = rapportDe(racine);

    expect(rapport.routes[0]?.source_du_plafond).toBe('route');
    expect(rapport.routes[0]?.plafond_ecran).toBe(1);
    expect(sortie.code).toBe(1);
  });
});
