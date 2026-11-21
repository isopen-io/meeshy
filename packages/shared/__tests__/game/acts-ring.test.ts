import { describe, it, expect } from 'vitest';
import { gameActsRing, type GameActsRingSource } from '../../utils/game/acts-ring.js';

const source = (overrides: { readonly unlocked?: boolean; readonly done?: ReadonlyArray<boolean> } = {}): GameActsRingSource => {
  const missions = {
    unlocked: overrides.unlocked ?? true,
    items: (overrides.done ?? [false, false, false]).map((done) => ({ completedAt: done ? '2026-11-13T09:00:00.000Z' : null })),
  };
  return { missions };
};

describe('gameActsRing — l’anneau des actes du jour autour du bouton du menu (#17768)', () => {
  it('compte les actes du jour réalisés sur ceux du jour', () => {
    expect(gameActsRing(source({ done: [true, false, true] }), { hidden: false })).toEqual({ done: 2, total: 3 });
  });

  it('aucun acte réalisé : l’anneau existe, éteint', () => {
    expect(gameActsRing(source(), { hidden: false })).toEqual({ done: 0, total: 3 });
  });

  it('les trois actes réalisés : l’anneau est plein', () => {
    expect(gameActsRing(source({ done: [true, true, true] }), { hidden: false })).toEqual({ done: 3, total: 3 });
  });

  it('avant le niveau 5, le premier Rêve a un acte : un anneau d’un segment (#17370)', () => {
    expect(gameActsRing(source({ unlocked: false, done: [true] }), { hidden: false })).toEqual({ done: 1, total: 1 });
  });

  it('avant le niveau 5 devant un ancien serveur (aucun acte servi) : aucun anneau', () => {
    expect(gameActsRing(source({ unlocked: false, done: [] }), { hidden: false })).toBeNull();
  });

  it('un jour servi sans acte : aucun anneau', () => {
    expect(gameActsRing(source({ done: [] }), { hidden: false })).toBeNull();
  });

  it('« Jeu masqué » : aucun anneau', () => {
    expect(gameActsRing(source({ done: [true, true, false] }), { hidden: true })).toBeNull();
  });

  it('sans bloc de jeu (cache vide, ancien serveur) : aucun anneau', () => {
    expect(gameActsRing(null, { hidden: false })).toBeNull();
    expect(gameActsRing(undefined, { hidden: false })).toBeNull();
  });
});
