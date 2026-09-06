import { NAVIGATIONS, verdictDeFuite, type Releve } from '../e2e/visual/lib/fuites';

/**
 * LE GATE DE FUITE DU NAVIGATEUR DE ZONE, gagé sans navigateur — le patron de
 * `lifecycle-gate.test.ts` (§ 8.5) : la LOI vit dans `e2e/visual/lib/fuites.ts`,
 * ce fichier la GAGE ; `v3-navigateur-fuites.spec.ts` n'est que la main qui
 * l'applique à un vrai navigateur.
 */

const plat = (n: number, releve: Partial<Releve> = {}): readonly Releve[] =>
  Array.from({ length: n }, () => ({ ecouteurs: 9, canaux: 1, socketsOuvertes: 1, ...releve }));

describe('le verdict de fuite', () => {
  it('une série plate de 10 relevés à socketsOuvertes: 1 sort VERT', () => {
    const serie = plat(10);
    expect(verdictDeFuite(serie)).toEqual({ vert: true });
  });

  it("un compte d'écouteurs strictement croissant sort ROUGE — la fuite nominale", () => {
    const serie: readonly Releve[] = Array.from({ length: 10 }, (_, i) => ({
      ecouteurs: 9 + i,
      canaux: 1,
      socketsOuvertes: 1,
    }));
    const verdict = verdictDeFuite(serie);
    expect(verdict.vert).toBe(false);
    if (!verdict.vert) expect(verdict.raison).toMatch(/écouteurs/);
  });

  it('un canal BroadcastChannel resté ouvert (dernier > premier) sort ROUGE', () => {
    const serie: readonly Releve[] = [
      { ecouteurs: 9, canaux: 1, socketsOuvertes: 1 },
      ...plat(9, { canaux: 2 }),
    ];
    const verdict = verdictDeFuite(serie);
    expect(verdict.vert).toBe(false);
    if (!verdict.vert) expect(verdict.raison).toMatch(/canaux/);
  });

  it('un dernier relevé à 2 sockets ouvertes sort ROUGE — accumulation', () => {
    const serie: readonly Releve[] = [...plat(9), { ecouteurs: 9, canaux: 1, socketsOuvertes: 2 }];
    const verdict = verdictDeFuite(serie);
    expect(verdict.vert).toBe(false);
    if (!verdict.vert) expect(verdict.raison).toMatch(/UNE seule connexion/);
  });

  it('un dernier relevé à 0 socket ouverte sort ROUGE — accumulation, pas inertie, sur le DERNIER relevé', () => {
    const serie: readonly Releve[] = [...plat(9), { ecouteurs: 9, canaux: 1, socketsOuvertes: 0 }];
    const verdict = verdictDeFuite(serie);
    expect(verdict.vert).toBe(false);
    if (!verdict.vert) expect(verdict.raison).toMatch(/inertie/);
  });

  it('un SEUL relevé sans aucune socket ouverte, ailleurs que le dernier, sort ROUGE — anti-inertie', () => {
    const serie: readonly Releve[] = [{ ecouteurs: 9, canaux: 1, socketsOuvertes: 0 }, ...plat(9)];
    const verdict = verdictDeFuite(serie);
    expect(verdict.vert).toBe(false);
    if (!verdict.vert) expect(verdict.raison).toMatch(/inertie/);
  });

  it("une série ENTIÈRE à -1 écouteur sort ROUGE — le compteur ABSENT ne sort pas vert (revue 2026-09-06)", () => {
    // `compteEcouteurs`/`compteCanaux` de `v3-navigateur-fuites.spec.ts`
    // poussent EXACTEMENT cette valeur quand `window.__fuites` n'existe pas.
    // Une telle série est PLATE : sans cette garde, la moitié « listeners » du
    // critère de fin sortait verte sans avoir rien mesuré.
    const serie: readonly Releve[] = Array.from({ length: 10 }, () => ({
      ecouteurs: -1,
      canaux: -1,
      socketsOuvertes: 1,
    }));
    const verdict = verdictDeFuite(serie);
    expect(verdict.vert).toBe(false);
    if (!verdict.vert) expect(verdict.raison).toMatch(/inertie du compteur/);
  });

  it('un SEUL relevé à 0 écouteur, ailleurs que le dernier, sort ROUGE — le compteur a été perdu en route', () => {
    const serie: readonly Releve[] = [...plat(5), ...plat(5, { ecouteurs: 0 })];
    const verdict = verdictDeFuite(serie);
    expect(verdict.vert).toBe(false);
    if (!verdict.vert) expect(verdict.raison).toMatch(/inertie du compteur/);
  });

  it('un compte de canaux à ZÉRO reste VERT — un écran sans BroadcastChannel est légitime', () => {
    expect(verdictDeFuite(plat(10, { canaux: 0 }))).toEqual({ vert: true });
  });

  it('une série de 3 relevés sort ROUGE — vacuité, en dessous du plancher', () => {
    const verdict = verdictDeFuite(plat(3));
    expect(verdict.vert).toBe(false);
    if (!verdict.vert) expect(verdict.raison).toMatch(/vacuité/);
  });

  it("n'invente pas son seuil de non-vacuité : il vient de NAVIGATIONS, jamais d'un littéral recopié", () => {
    const plancher = Math.floor(NAVIGATIONS / 2);
    expect(verdictDeFuite(plat(plancher))).toEqual({ vert: true });
    const verdict = verdictDeFuite(plat(plancher - 1));
    expect(verdict.vert).toBe(false);
    if (!verdict.vert) expect(verdict.raison).toContain(String(NAVIGATIONS));
  });
});
