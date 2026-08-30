/**
 * @jest-environment node
 *
 * Ce que ce temoin gage : l'instrument de POIDS RESEAU (§ 8.2, mesure n° 2)
 * agrege ce que CDP lui donne sans jamais combler un trou par un zero.
 *
 * Il s'adresse a la commande, comme le temoin du budget, et il l'exerce par son
 * mode `--depuis-journal` : le journal CDP est la matiere premiere de la
 * mesure, et pouvoir le REAGREGER sans navigateur n'est pas un artifice de
 * test — c'est ce qui permet de reprendre une collecte faite ailleurs (une
 * machine qui, elle, atteint la production) sans la refaire, et de la commiter.
 *
 * La regle qui porte le lot : « requetes avant le premier pixel » n'a de sens
 * que si le premier pixel est MESURE. Sans FCP, la reponse est `null` — jamais
 * zero, jamais le total. C'est « ce qui n'est pas mesure reste a etablir »
 * applique a l'INTERIEUR d'une mesure.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const zoneRoot = join(__dirname, '..');
const script = join(zoneRoot, 'scripts', 'mesure-reseau.mjs');

type Evenement = {
  readonly url: string;
  readonly type: string;
  readonly octets: number | null;
  readonly fin_ms: number | null;
  readonly echec?: string;
};

type Journal = {
  readonly url: string;
  readonly statut_http: number | null;
  readonly reseau: string | null;
  readonly premier_pixel_ms: number | null;
  readonly lcp_ms: number | null;
  readonly cls: number | null;
  readonly evenements: readonly Evenement[];
};

type Mesure = {
  readonly url: string;
  readonly octets_total: number | null;
  readonly octets_pesables: number;
  readonly octets_par_type: Record<string, number>;
  readonly requetes_total: number;
  readonly requetes_sans_poids: number;
  readonly requetes_en_cours: number;
  readonly requetes_en_echec: number;
  readonly requetes_avant_premier_pixel: number | null;
  readonly premier_pixel_ms: number | null;
  readonly statut: string;
  readonly raison?: string;
  readonly incomplet_sur: readonly string[];
  readonly sans_conditions: readonly string[];
};

type Couverture = {
  readonly lignes_de_budget: number;
  readonly mesurees: readonly string[];
  readonly non_mesurees: readonly { readonly motif: string; readonly role_premier: boolean }[];
  readonly role_premier_non_mesure: readonly string[];
};

type Rapport = {
  readonly mesures: readonly Mesure[];
  readonly verdict: string;
  readonly couverture: Couverture;
  readonly depassements: readonly string[];
  readonly ecarts_de_cible: readonly string[];
  readonly sans_conditions: readonly string[];
};

const evenement = (partiel: Partial<Evenement>): Evenement => ({
  url: 'https://exemple.test/a.js',
  type: 'script',
  octets: 1000,
  fin_ms: 100,
  ...partiel,
});

const arbre = (): string => mkdtempSync(join(tmpdir(), 'web-v3-reseau-'));

const agreger = (
  journal: Partial<Journal>,
  ...args: readonly string[]
): { code: number; stdout: string; stderr: string; rapport: Rapport } => {
  const racine = arbre();
  const fichier = join(racine, 'journal.json');
  const json = join(racine, 'rapport.json');
  writeFileSync(
    fichier,
    JSON.stringify({
      url: 'https://exemple.test/stories/abc',
      statut_http: 200,
      reseau: '3g-fast',
      premier_pixel_ms: 500,
      lcp_ms: 900,
      cls: 0,
      evenements: [],
      ...journal,
    }),
  );

  try {
    const stdout = execFileSync(
      process.execPath,
      [script, '--depuis-journal', fichier, '--json', json, ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { code: 0, stdout, stderr: '', rapport: JSON.parse(readFileSync(json, 'utf8')) as Rapport };
  } catch (erreur) {
    const e = erreur as { status?: number; stdout?: string; stderr?: string };
    const rapport = JSON.parse(readFileSync(json, 'utf8')) as Rapport;
    return { code: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '', rapport };
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
};

const premiere = (rapport: Rapport): Mesure => {
  const [mesure] = rapport.mesures;
  if (mesure === undefined) throw new Error('le rapport ne porte aucune mesure');
  return mesure;
};

describe('le poids agrege est celui des octets transferes', () => {
  it('somme les octets encodes et compte les requetes', () => {
    const { code, rapport } = agreger({
      evenements: [
        evenement({ octets: 1200, type: 'document' }),
        evenement({ octets: 800, type: 'script' }),
      ],
    });

    expect(code).toBe(0);
    expect(premiere(rapport).octets_total).toBe(2000);
    expect(premiere(rapport).requetes_total).toBe(2);
  });

  it('ventile les octets par type de ressource, pour que le depassement designe un coupable', () => {
    const { rapport } = agreger({
      evenements: [
        evenement({ octets: 1200, type: 'document' }),
        evenement({ octets: 800, type: 'script' }),
        evenement({ octets: 300, type: 'script' }),
      ],
    });

    expect(premiere(rapport).octets_par_type).toEqual({ document: 1200, script: 1100 });
  });

  it("refuse de sommer ce qu'il n'a pas pese : une requete sans poids rend le total `null`, jamais un zero", () => {
    const { code, rapport, stdout } = agreger({
      evenements: [evenement({ octets: 1000 }), evenement({ octets: null })],
    });

    expect(premiere(rapport).octets_total).toBeNull();
    expect(premiere(rapport).octets_pesables).toBe(1000);
    expect(premiere(rapport).requetes_total).toBe(2);
    expect(premiere(rapport).requetes_sans_poids).toBe(1);
    expect(premiere(rapport).incomplet_sur).toEqual([expect.stringContaining('octets_total')]);
    expect(premiere(rapport).statut).toBe('incomplete');
    expect(stdout).toContain('non pese');
    expect(code).toBe(3);
  });

  it("n'affiche jamais « 0.0 Ko » pour une page dont AUCUNE requete n'a ete pesee", () => {
    const { stdout } = agreger({
      evenements: [evenement({ octets: null }), evenement({ octets: null })],
    });

    expect(stdout).not.toContain('0.0 Ko');
  });
});

describe("une page d'erreur n'est pas un ecran", () => {
  it('refuse de peser un 404 : ses octets sont ceux de la page d erreur', () => {
    const { code, rapport } = agreger({
      statut_http: 404,
      evenements: [evenement({ octets: 1000, fin_ms: 100 })],
    });

    expect(premiere(rapport).statut).toBe('incomplete');
    expect(premiere(rapport).raison).toContain('HTTP 404');
    expect(rapport.verdict).toBe('incomplet');
    expect(code).toBe(3);
  });

  it('accepte une redirection : 302 est une reponse SERVIE', () => {
    const { code } = agreger({
      statut_http: 302,
      evenements: [evenement({ octets: 1000, fin_ms: 100, type: 'document' })],
    });

    expect(code).toBe(0);
  });

  it('refuse un 500 tout autant : le code, pas la forme des chiffres', () => {
    const { rapport } = agreger({ statut_http: 500, evenements: [evenement({ fin_ms: 100 })] });

    expect(premiere(rapport).statut).toBe('incomplete');
  });
});

describe("un chemin qu'aucun plafond ne gouverne n'est pas un chemin vert", () => {
  it('sort en `sans-plafond`, en nommant le chemin', () => {
    const { code, rapport, stdout } = agreger({
      url: 'https://exemple.test/inconnu/xyz',
      evenements: [evenement({ octets: 900000, fin_ms: 100 })],
    });

    expect(premiere(rapport).statut).toBe('sans-plafond');
    expect(premiere(rapport).raison).toContain('/inconnu/xyz');
    expect(rapport.verdict).toBe('sans-plafond');
    expect(code).toBe(3);
    expect(stdout).toContain('sans-plafond');
  });

  it("gouverne bien `/post/:id` — l'ecran de lecture d'un post, du role premier", () => {
    const { rapport } = agreger({
      url: 'https://exemple.test/post/abc',
      cls: 0.9,
      evenements: [
        evenement({ fin_ms: 10 }),
        evenement({ fin_ms: 20 }),
        evenement({ fin_ms: 30 }),
        evenement({ fin_ms: 40 }),
      ],
    });

    expect(premiere(rapport).statut).toBe('depassement');
    expect(rapport.depassements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('requetes avant le premier pixel'),
        expect.stringContaining('CLS'),
      ]),
    );
  });
});

describe('une requete qui ne s est jamais achevee (§ 8.3, « 0 connexion tenue »)', () => {
  it("n'entre pas dans « achevees avant le premier pixel » et se compte a part", () => {
    const { rapport } = agreger({
      evenements: [
        evenement({ fin_ms: 100 }),
        evenement({ fin_ms: null }),
        evenement({ fin_ms: null, echec: 'net::ERR_ABORTED' }),
      ],
    });

    expect(premiere(rapport).requetes_avant_premier_pixel).toBe(1);
    expect(premiere(rapport).requetes_en_cours).toBe(1);
    expect(premiere(rapport).requetes_en_echec).toBe(1);
  });

  it('fait rougir le GATE « 0 connexion serveur tenue apres le premier pixel » sur (public)', () => {
    const { code, rapport } = agreger({
      evenements: [evenement({ fin_ms: 100 }), evenement({ fin_ms: null })],
    });

    expect(code).toBe(1);
    expect(rapport.depassements).toEqual([expect.stringContaining('connexions serveur tenues')]);
  });
});

describe('les gates transverses du § 8.5, sur le groupe (public)', () => {
  it('fait rougir un CLS au-dessus de 0,05', () => {
    const { code, rapport } = agreger({ cls: 0.9, evenements: [evenement({ fin_ms: 100 })] });

    expect(code).toBe(1);
    expect(rapport.depassements).toEqual([expect.stringContaining('CLS sur (public) : 0.9 > 0.05')]);
  });

  it('fait rougir une police web servie sur une route du role premier', () => {
    const { code, rapport } = agreger({
      evenements: [evenement({ fin_ms: 100, type: 'font' })],
    });

    expect(code).toBe(1);
    expect(rapport.depassements).toEqual([expect.stringContaining('police web')]);
  });

  it('rapporte le CSS hors cible sans casser la CI', () => {
    const { code, rapport } = agreger({
      evenements: [evenement({ fin_ms: 100, type: 'stylesheet', octets: 30000 })],
    });

    expect(code).toBe(0);
    expect(rapport.ecarts_de_cible).toEqual([expect.stringContaining('CSS transfere')]);
  });
});

describe('la BALANCE : un plafond de temps ne se confronte pas a une mesure non bridee', () => {
  it("sort le plafond en `sans-conditions` quand le journal ne declare aucun bridage", () => {
    const { code, rapport, stdout } = agreger({
      url: 'https://exemple.test/l/abcdef',
      reseau: null,
      premier_pixel_ms: 44,
      evenements: [evenement({ fin_ms: 10, type: 'document', octets: 1000 })],
    });

    expect(premiere(rapport).statut).toBe('sans-conditions');
    expect(rapport.sans_conditions).toEqual([expect.stringContaining('premier pixel')]);
    expect(stdout).toContain('SANS CONDITIONS');
    expect(code).toBe(3);
  });

  it('confronte le plafond quand la mesure DIT sa balance', () => {
    const { code, rapport } = agreger({
      url: 'https://exemple.test/l/abcdef',
      reseau: '3g-fast',
      premier_pixel_ms: 800,
      evenements: [evenement({ fin_ms: 10, type: 'document', octets: 1000 })],
    });

    expect(code).toBe(0);
    expect(rapport.ecarts_de_cible).toEqual([expect.stringContaining('premier pixel')]);
  });
});

describe('la COUVERTURE : ce qui n a pas ete ouvert est nomme', () => {
  it('compte les lignes de budget et nomme celles du role premier non mesurees', () => {
    const { rapport } = agreger({ evenements: [evenement({ fin_ms: 100 })] });

    expect(rapport.couverture.lignes_de_budget).toBeGreaterThan(1);
    expect(rapport.couverture.mesurees).toEqual(['/stories/:id']);
    expect(rapport.couverture.role_premier_non_mesure).toEqual(
      expect.arrayContaining(['/l/:token', '/post/:id', '/chats/:lien']),
    );
  });
});

describe('les requetes AVANT le premier pixel', () => {
  it('ne comptent que celles achevees avant le premier rendu de contenu', () => {
    const { rapport } = agreger({
      evenements: [
        evenement({ fin_ms: 120 }),
        evenement({ fin_ms: 480 }),
        evenement({ fin_ms: 900 }),
      ],
      premier_pixel_ms: 500,
    });

    expect(premiere(rapport).requetes_avant_premier_pixel).toBe(2);
  });

  it("valent `null` quand le premier pixel n'a pas ete mesure — jamais zero", () => {
    const { rapport } = agreger({
      evenements: [evenement({ fin_ms: 120 })],
      premier_pixel_ms: null,
    });

    expect(premiere(rapport).requetes_avant_premier_pixel).toBeNull();
    expect(premiere(rapport).octets_total).toBe(1000);
    expect(premiere(rapport).statut).toBe('incomplete');
  });

  it('rougirait si un jour on comblait ce trou par zero', () => {
    const { rapport } = agreger({ evenements: [], premier_pixel_ms: null });

    expect(premiere(rapport).requetes_avant_premier_pixel).not.toBe(0);
  });
});

describe('le plafond de requetes avant le premier pixel est un GATE (§ 8.3)', () => {
  it('echoue en rc=1 quand une route en fait plus que son plafond, et nomme les deux chiffres', () => {
    const { code, stderr, rapport } = agreger({
      url: 'https://exemple.test/l/abcdef',
      premier_pixel_ms: 800,
      evenements: [
        evenement({ fin_ms: 100, type: 'document' }),
        evenement({ fin_ms: 200, type: 'script' }),
      ],
    });

    expect(code).toBe(1);
    expect(rapport.verdict).toBe('depassement');
    expect(stderr).toContain('/l/:token');
    expect(stderr).toContain('2');
    expect(stderr).toContain('1');
  });

  it('passe quand la route tient son plafond GATE', () => {
    const { code } = agreger({
      url: 'https://exemple.test/l/abcdef',
      premier_pixel_ms: 500,
      evenements: [evenement({ fin_ms: 100, type: 'document' })],
    });

    expect(code).toBe(0);
  });

  it("fait rougir le HTML de `/l/:token` au-dessus de 4 Ko — le critere de fin ECRIT de la ligne 1 de la matrice", () => {
    const { code, rapport } = agreger({
      url: 'https://exemple.test/l/abcdef',
      premier_pixel_ms: 500,
      evenements: [evenement({ fin_ms: 100, type: 'document', octets: 9000 })],
    });

    expect(code).toBe(1);
    expect(rapport.depassements).toEqual([expect.stringContaining('HTML transfere')]);
  });

  it("rapporte sans casser la CI un ecart a une CIBLE — le premier pixel n'est pas un GATE (§ 8.3)", () => {
    const { code, stdout, rapport } = agreger({
      url: 'https://exemple.test/l/abcdef',
      reseau: '3g-fast',
      premier_pixel_ms: 800,
      evenements: [evenement({ fin_ms: 100, type: 'document' })],
    });

    expect(code).toBe(0);
    expect(rapport.ecarts_de_cible).toEqual([expect.stringContaining('premier pixel')]);
    expect(stdout).toContain('HORS CIBLE');
  });

  it("ne juge pas ce qu'il n'a pas mesure : sans premier pixel, aucun depassement n'est prononce", () => {
    const { code, rapport } = agreger({
      url: 'https://exemple.test/l/abcdef',
      premier_pixel_ms: null,
      evenements: [evenement({ fin_ms: 100 }), evenement({ fin_ms: 200 })],
    });

    expect(code).toBe(3);
    expect(rapport.verdict).toBe('incomplet');
  });
});
