import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CIBLES_PRODUCTION, composeBaseline } from '../scripts/baseline.mjs';
import type { LigneDeBaseline } from '../scripts/baseline.mjs';
import { composeMesure, mesureIndisponible } from '../scripts/mesure-reseau.mjs';

const CHEMIN = join(__dirname, '..', 'e2e', 'visual', 'baseline.json');

describe('la ligne de base « AVANT », mesurée sur la prod actuelle', () => {
  it('vise les quatre gestes du rôle premier, sur l\'apex de production', () => {
    expect(CIBLES_PRODUCTION.length).toBeGreaterThanOrEqual(4);
    CIBLES_PRODUCTION.forEach((cible) => expect(cible.url).toMatch(/^https:\/\/meeshy\.me\//));
  });

  it('date la mesure et nomme ce qu\'elle mesure', () => {
    const baseline = composeBaseline({
      date: '2026-08-30',
      mesures: [],
    });

    expect(baseline.date).toBe('2026-08-30');
    expect(baseline.mesure).toContain('apps/web');
    expect(baseline.mesures).toEqual([]);
  });

  it('garde « à établir » ce qui n\'a pas pu être joint — jamais un zéro', () => {
    const baseline = composeBaseline({
      date: '2026-08-30',
      mesures: [
        mesureIndisponible({
          url: 'https://meeshy.me/',
          commande: 'node apps/web-v3/scripts/baseline.mjs',
          raison: 'proxy 403',
        }),
      ],
    });

    expect(baseline.mesures[0]?.statut).toBe('à établir');
    expect(baseline.mesures[0]?.octets_transferes).toBeNull();
    expect(baseline.etablie).toBe(false);
  });
});

describe('le baseline.json commité', () => {
  const baseline: unknown = JSON.parse(readFileSync(CHEMIN, 'utf8'));
  const lignes = (baseline as { readonly mesures?: readonly LigneDeBaseline[] }).mesures ?? [];

  it('porte une entrée par geste du rôle premier', () => {
    expect(lignes.length).toBe(CIBLES_PRODUCTION.length);
  });

  it('accompagne CHAQUE valeur de la commande qui la produit', () => {
    expect(lignes.length).toBeGreaterThan(0);
    lignes.forEach((ligne) => expect(ligne.commande).toContain('baseline.mjs'));
  });

  it("n'avance aucun chiffre qu'une mesure n'a pas rendu", () => {
    lignes
      .filter((ligne) => ligne.statut !== 'mesuré')
      .forEach((ligne) => {
        expect(ligne.octets_transferes).toBeNull();
        expect(ligne.lcp_ms).toBeNull();
        expect(ligne.requetes_avant_premier_pixel).toBeNull();
        expect(ligne.raison).toEqual(expect.any(String));
      });
  });
});

// Le critère de fin du lot demande des valeurs MESURÉES. Tant qu'il n'est pas
// atteint, le fichier doit le DIRE — un manque qui ne se voit pas devient un
// critère silencieusement réputé rempli.
describe('un manque reste un point OUVERT, jamais un critère réputé rempli', () => {
  const baseline: {
    readonly etablie?: boolean;
    readonly point_ouvert?: { readonly a_rejouer?: string; readonly prerequis?: readonly string[] } | null;
    readonly mesures?: readonly LigneDeBaseline[];
  } = JSON.parse(readFileSync(CHEMIN, 'utf8'));

  it("nomme ce qu'il faut rejouer, et où, tant que la ligne de base n'est pas établie", () => {
    if (baseline.etablie) {
      expect(baseline.point_ouvert).toBeNull();
      return;
    }
    expect(baseline.point_ouvert?.a_rejouer).toContain('baseline.mjs');
    expect(baseline.point_ouvert?.prerequis?.length).toBeGreaterThan(0);
  });

  it("ne peut pas se déclarer établi sans porter de chiffres", () => {
    const declaree = composeBaseline({
      date: '2026-08-30',
      mesures: [
        mesureIndisponible({ url: 'https://meeshy.me/', commande: 'x', raison: 'proxy 403' }),
      ],
    });

    expect(declaree.etablie).toBe(false);
    expect(declaree.point_ouvert).not.toBeNull();
  });

  it("retire le point ouvert dès que TOUTES les cibles ont rendu un chiffre", () => {
    const mesuree = composeMesure({
      url: 'https://meeshy.me/',
      commande: 'x',
      http: 200,
      dureeMs: 1,
      requetesEmises: 1,
      requetesTerminees: 1,
      reponses: [],
      chargements: [{ requestId: '1', encodedDataLength: 1024 }],
      ressources: [],
      fcpMs: 100,
      lcpMs: 200,
      cls: 0,
    });

    const etablie = composeBaseline({ date: '2026-08-30', mesures: [mesuree] });

    expect(etablie.etablie).toBe(true);
    expect(etablie.point_ouvert).toBeNull();
  });

  it("le fichier commité dit lui-même s'il satisfait le critère de fin", () => {
    const chiffrees = (baseline.mesures ?? []).filter((m) => m.statut === 'mesuré').length;

    expect(baseline.etablie).toBe(chiffrees === (baseline.mesures ?? []).length && chiffrees > 0);
  });
});
