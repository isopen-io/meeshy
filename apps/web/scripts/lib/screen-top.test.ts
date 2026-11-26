import { describe, expect, test } from 'bun:test';

import { BANDEAUX, bandeauVerdict } from './screen-top.mjs';

/**
 * LE GATE DE DÉGAGEMENT JOUE LES DEUX ÉTATS DU BANDEAU (#9942) — un relevé
 * pris avant que la bannière ne se pose lit `bande = 0` et un couloir à 126 :
 * les deux valeurs s'accordent et l'état « bannière » se confond avec l'état
 * « Jeu masqué ». Le verdict exige donc, par état, ce qui les DISTINGUE.
 */

const etat = (nom: string) => {
  const trouve = BANDEAUX.find((b) => b.nom === nom);
  if (trouve === undefined) throw new Error(`état « ${nom} » absent de BANDEAUX`);
  return trouve;
};

const banniere = etat('bannière');
const masque = etat('Jeu masqué');

const mesure = (patch: Partial<Parameters<typeof bandeauVerdict>[1]> = {}): Parameters<typeof bandeauVerdict>[1] => ({
  occupants: ['player'],
  bandeauBas: 80,
  joueurPeint: 60,
  bande: 84,
  encoche: 0,
  hautReserve: 84,
  ...patch,
});

describe('les deux états du bandeau', () => {
  test('BANDEAUX nomme exactement « bannière » puis « Jeu masqué »', () => {
    expect(BANDEAUX.map((b) => b.nom)).toEqual(['bannière', 'Jeu masqué']);
    expect(banniere.masque).toBe(false);
    expect(masque.masque).toBe(true);
  });

  test('bannière peinte et couverte par le haut réservé : vert', () => {
    expect(bandeauVerdict(banniere, mesure())).toEqual([]);
  });

  test('bannière : un relevé pris avant que la bannière ne se pose (bande 0) rougit', () => {
    const echecs = bandeauVerdict(banniere, mesure({ joueurPeint: 0, bande: 0, bandeauBas: 8, hautReserve: 0 }));
    expect(echecs.some((e) => e.includes('peinte'))).toBe(true);
    expect(echecs.some((e) => e.includes('--top-band'))).toBe(true);
  });

  test('bannière : un haut réservé qui ne couvre pas le bandeau rougit', () => {
    const echecs = bandeauVerdict(banniere, mesure({ hautReserve: 40 }));
    expect(echecs).toHaveLength(1);
    expect(echecs[0]).toContain('ne couvre pas');
  });

  test('bannière : le joueur absent des occupants du bandeau rougit', () => {
    expect(bandeauVerdict(banniere, mesure({ occupants: [] })).some((e) => e.includes('occupants'))).toBe(true);
  });

  test('Jeu masqué : bandeau vide, aucune réserve, haut réservé = encoche — vert', () => {
    expect(bandeauVerdict(masque, mesure({ occupants: [], joueurPeint: 0, bande: 0, bandeauBas: 8, hautReserve: 0 }))).toEqual([]);
  });

  test('Jeu masqué : une bannière encore peinte ou une réserve rougit', () => {
    const echecs = bandeauVerdict(masque, mesure());
    expect(echecs.some((e) => e.includes('occupants'))).toBe(true);
    expect(echecs.some((e) => e.includes('peinte'))).toBe(true);
    expect(echecs.some((e) => e.includes('--top-band'))).toBe(true);
    expect(echecs.some((e) => e.includes('encoche'))).toBe(true);
  });

  test('un relevé absent (aucun bandeau dans la page) rougit dans les deux états — garde de vacuité', () => {
    expect(bandeauVerdict(banniere, null)).toHaveLength(1);
    expect(bandeauVerdict(masque, null)).toHaveLength(1);
  });
});
