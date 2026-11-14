import { describe, it, expect } from 'vitest';
import { gameAttention, hasGameAttention, NO_GAME_ATTENTION, type GameAttentionSource } from '../../utils/game/attention.js';

const source = (overrides: {
  readonly unlocked?: boolean;
  readonly chest?: GameAttentionSource['chest']['status'];
  readonly flame?: GameAttentionSource['flame']['status'];
  readonly days?: number;
} = {}): GameAttentionSource => ({
  missions: { unlocked: overrides.unlocked ?? true },
  chest: { status: overrides.chest ?? 'locked' },
  flame: { status: overrides.flame ?? 'lit', days: overrides.days ?? 4 },
});

describe('gameAttention — ce que le Jeu signale hors de ses écrans (#17796)', () => {
  it('l’Offrande servie prête se signale', () => {
    expect(gameAttention(source({ chest: 'ready' }), { hidden: false })).toEqual({ chestReady: true, flameAtRisk: false });
  });

  it('une Offrande voilée ou déjà ouverte ne se signale pas', () => {
    expect(gameAttention(source({ chest: 'locked' }), { hidden: false }).chestReady).toBe(false);
    expect(gameAttention(source({ chest: 'claimed' }), { hidden: false }).chestReady).toBe(false);
  });

  it('avant le niveau 5, aucune Offrande ne se signale, même servie prête', () => {
    expect(gameAttention(source({ unlocked: false, chest: 'ready' }), { hidden: false }).chestReady).toBe(false);
  });

  it('la Flamme servie à risque se signale', () => {
    expect(gameAttention(source({ flame: 'at-risk' }), { hidden: false })).toEqual({ chestReady: false, flameAtRisk: true });
  });

  it('une Flamme allumée, couverte, éteinte ou absente ne se signale pas', () => {
    for (const status of ['none', 'lit', 'covered', 'out'] as const) {
      expect(gameAttention(source({ flame: status }), { hidden: false }).flameAtRisk).toBe(false);
    }
  });

  it('une Flamme sans jour ne se dit pas à risque', () => {
    expect(gameAttention(source({ flame: 'at-risk', days: 0 }), { hidden: false }).flameAtRisk).toBe(false);
  });

  it('« Jeu masqué » : rien ne se signale', () => {
    expect(gameAttention(source({ chest: 'ready', flame: 'at-risk' }), { hidden: true })).toEqual(NO_GAME_ATTENTION);
  });

  it('sans bloc de jeu (cache vide, ancien serveur), rien ne se signale', () => {
    expect(gameAttention(null, { hidden: false })).toEqual(NO_GAME_ATTENTION);
    expect(gameAttention(undefined, { hidden: false })).toEqual(NO_GAME_ATTENTION);
  });

  it('les deux signaux coexistent', () => {
    expect(gameAttention(source({ chest: 'ready', flame: 'at-risk' }), { hidden: false })).toEqual({ chestReady: true, flameAtRisk: true });
  });

  it('hasGameAttention : vrai dès qu’un signal est levé', () => {
    expect(hasGameAttention(NO_GAME_ATTENTION)).toBe(false);
    expect(hasGameAttention({ chestReady: true, flameAtRisk: false })).toBe(true);
    expect(hasGameAttention({ chestReady: false, flameAtRisk: true })).toBe(true);
  });
});
