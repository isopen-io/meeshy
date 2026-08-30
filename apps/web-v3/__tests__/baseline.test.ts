/**
 * @jest-environment node
 *
 * Ce que ce temoin gage : `e2e/visual/baseline.json` — la ligne de base « AVANT »,
 * mesuree sur la production actuelle (§ 8.2) — ne porte AUCUN chiffre qui n'ait
 * ete mesure, et porte pour chaque ecran la commande qui le mesure.
 *
 * Le defaut qu'il attrape est le plus tentant de tout le lot : remplir une
 * ligne de base « d'ordres de grandeur » pour que le tableau soit joli. Un
 * chiffre invente dans un point de COMPARAISON est pire qu'un chiffre absent :
 * il fabrique un progres ou une regression qui n'ont jamais eu lieu.
 *
 * La regle est donc binaire et verifiee par la machine (`--verifier`) :
 * `statut: "mesure"` ⇒ des nombres et une date ; tout autre statut ⇒ tous les
 * champs de mesure a `null` et une raison ecrite.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const zoneRoot = join(__dirname, '..');
const script = join(zoneRoot, 'scripts', 'baseline.mjs');
const fichier = join(zoneRoot, 'e2e', 'visual', 'baseline.json');

type Ecran = {
  readonly id: string;
  readonly url: string;
  readonly commande: string;
  readonly statut: string;
  readonly raison?: string;
  readonly statut_http: number | null;
  readonly conditions: { readonly reseau: string; readonly tirages: number } | null;
  readonly octets_total: number | null;
  readonly requetes_total: number | null;
  readonly requetes_avant_premier_pixel: number | null;
  readonly premier_pixel_ms: number | null;
  readonly lcp_ms: number | null;
};

type Baseline = {
  readonly cible: string;
  readonly genere_par: string;
  readonly mesure_le: string | null;
  readonly statut: string;
  readonly instrument: {
    readonly fichier: string;
    readonly methode: string;
    readonly conditions: { readonly reseau: string; readonly tirages: number; readonly bridage: string };
  };
  readonly ecrans: readonly Ecran[];
};

const baseline = JSON.parse(readFileSync(fichier, 'utf8')) as Baseline;

const verifier = (contenu: unknown): { code: number; stderr: string } => {
  const racine = mkdtempSync(join(tmpdir(), 'web-v3-baseline-'));
  const cible = join(racine, 'baseline.json');
  writeFileSync(cible, JSON.stringify(contenu));
  try {
    execFileSync(process.execPath, [script, '--verifier', cible], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stderr: '' };
  } catch (erreur) {
    const e = erreur as { status?: number; stderr?: string };
    return { code: e.status ?? -1, stderr: e.stderr ?? '' };
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
};

describe('la ligne de base vise la production actuelle', () => {
  it('nomme la cible et le script qui la produit, et ce script existe', () => {
    expect(baseline.cible).toContain('meeshy.me');
    expect(baseline.genere_par).toContain('baseline.mjs');
    expect(existsSync(script)).toBe(true);
  });

  it("nomme l'instrument de mesure, pour que la v3 soit pesee a la meme balance", () => {
    expect(existsSync(join(zoneRoot, baseline.instrument.fichier))).toBe(true);
    expect(baseline.instrument.methode).toMatch(/CDP/);
  });

  it('DIT a quelle balance elle pese : profil reseau, nombre de tirages, bridage', () => {
    expect(typeof baseline.instrument.conditions.reseau).toBe('string');
    expect(typeof baseline.instrument.conditions.tirages).toBe('number');
    expect(baseline.instrument.conditions.bridage).not.toBe('');
  });

  it('couvre les quatre ecrans du role premier cites au § 8.2', () => {
    const chemins = baseline.ecrans.map((e) => new URL(e.url).pathname);

    expect(chemins.some((c) => c.startsWith('/l/'))).toBe(true);
    expect(chemins.some((c) => c.startsWith('/story/'))).toBe(true);
    expect(chemins.some((c) => c.startsWith('/reel/'))).toBe(true);
    expect(chemins.some((c) => c.startsWith('/post/'))).toBe(true);
  });

  it('donne pour chaque ecran la commande qui le mesure', () => {
    for (const ecran of baseline.ecrans) {
      expect(ecran.commande).toContain('baseline.mjs');
      expect(ecran.commande).toContain(ecran.url);
    }
  });
});

describe('aucun chiffre ne s invente : la machine refuse une valeur non mesuree', () => {
  it('accepte la ligne de base commitee telle quelle', () => {
    expect(verifier(baseline).code).toBe(0);
  });

  it("refuse un ecran « a etablir » qui porterait quand meme un nombre", () => {
    const [premier] = baseline.ecrans;
    const forge = {
      ...baseline,
      ecrans: [{ ...premier, statut: 'a-etablir', lcp_ms: 1800 }],
    };

    const { code, stderr } = verifier(forge);

    expect(code).toBe(1);
    expect(stderr).toMatch(/lcp_ms/);
  });

  it('refuse un ecran « mesure » sans date de mesure', () => {
    const [premier] = baseline.ecrans;
    const forge = {
      ...baseline,
      mesure_le: null,
      ecrans: [
        {
          ...premier,
          statut: 'mesure',
          octets_total: 120000,
          requetes_total: 20,
          requetes_avant_premier_pixel: 4,
          premier_pixel_ms: 900,
          lcp_ms: 1800,
        },
      ],
    };

    expect(verifier(forge).code).toBe(1);
  });

  /**
   * Le defaut que ce temoin ferme : un 404 pese des octets, peint un premier
   * pixel et rend un LCP. Sa FORME est celle d'une mesure. `--verifier` ne
   * controlait que la forme — il aurait accepte, sans broncher, une ligne de
   * base entierement batie sur des pages d'erreur, et le jour ou la v3 sert de
   * vraies pages elle aurait affiche un progres qui n'a jamais eu lieu.
   */
  it("refuse un ecran « mesure » pose sur une page d'erreur, meme parfaitement chiffre", () => {
    const [premier] = baseline.ecrans;
    const forge = {
      ...baseline,
      mesure_le: '2026-08-30T00:00:00.000Z',
      ecrans: [
        {
          ...premier,
          statut: 'mesure',
          statut_http: 404,
          conditions: { reseau: '3g-fast', tirages: 3 },
          octets_total: 107118,
          requetes_total: 9,
          requetes_avant_premier_pixel: 4,
          premier_pixel_ms: 44,
          lcp_ms: 44,
          cls: 0,
        },
      ],
    };

    const { code, stderr } = verifier(forge);

    expect(code).toBe(1);
    expect(stderr).toMatch(/HTTP 404/);
  });

  it("refuse un ecran « mesure » sans code HTTP : on ne sait pas ce qui a ete pese", () => {
    const [premier] = baseline.ecrans;
    const forge = {
      ...baseline,
      mesure_le: '2026-08-30T00:00:00.000Z',
      ecrans: [
        {
          ...premier,
          statut: 'mesure',
          conditions: { reseau: '3g-fast', tirages: 3 },
          octets_total: 1,
          requetes_total: 1,
          requetes_avant_premier_pixel: 1,
          premier_pixel_ms: 1,
          lcp_ms: 1,
          cls: 0,
        },
      ],
    };

    expect(verifier(forge).code).toBe(1);
  });

  it("refuse un ecran « mesure » sans conditions : une mesure qui ne dit pas sa balance ne se compare a rien", () => {
    const [premier] = baseline.ecrans;
    const forge = {
      ...baseline,
      mesure_le: '2026-08-30T00:00:00.000Z',
      ecrans: [
        {
          ...premier,
          statut: 'mesure',
          statut_http: 200,
          octets_total: 1,
          requetes_total: 1,
          requetes_avant_premier_pixel: 1,
          premier_pixel_ms: 1,
          lcp_ms: 1,
          cls: 0,
        },
      ],
    };

    const { code, stderr } = verifier(forge);

    expect(code).toBe(1);
    expect(stderr).toMatch(/conditions/);
  });

  it('refuse un ecran sans commande : un chiffre sans sa commande est un chiffre sans preuve', () => {
    const [premier] = baseline.ecrans;
    const forge = { ...baseline, ecrans: [{ ...premier, commande: '' }] };

    const { code, stderr } = verifier(forge);

    expect(code).toBe(1);
    expect(stderr).toMatch(/commande/);
  });
});

describe("tant que la mesure n'a pas eu lieu, la ligne de base le DIT", () => {
  it('porte une raison ecrite pour chaque ecran non mesure', () => {
    for (const ecran of baseline.ecrans.filter((e) => e.statut !== 'mesure')) {
      expect(ecran.raison ?? '').not.toBe('');
    }
  });

  it("laisse `mesure_le` a null tant qu'aucun ecran n'est mesure", () => {
    const auMoinsUneMesure = baseline.ecrans.some((e) => e.statut === 'mesure');

    expect(baseline.mesure_le === null).toBe(!auMoinsUneMesure);
  });
});
