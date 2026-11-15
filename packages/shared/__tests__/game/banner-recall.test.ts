import { describe, it, expect } from 'vitest';
import { bannerMoment, bannerRecall, PLAYER_BANNER_RECALL_MS, type BannerMomentSource } from '../../utils/game/banner-recall.js';

const game = (overrides: {
  readonly unlocked?: boolean;
  readonly done?: number;
  readonly total?: number;
  readonly chest?: BannerMomentSource['chest']['status'];
  readonly flame?: BannerMomentSource['flame']['status'];
  readonly days?: number;
} = {}): BannerMomentSource => {
  const total = overrides.total ?? 3;
  const done = overrides.done ?? 0;
  return {
    missions: {
      unlocked: overrides.unlocked ?? true,
      items: Array.from({ length: total }, (_, index) => ({ completedAt: index < done ? '2026-11-14T09:00:00.000Z' : null })),
    },
    chest: { status: overrides.chest ?? 'locked' },
    flame: { status: overrides.flame ?? 'lit', days: overrides.days ?? 4 },
  };
};

const recall = (before: BannerMomentSource | null, after: BannerMomentSource | null, hidden = false) =>
  bannerRecall(bannerMoment(before, { hidden }), bannerMoment(after, { hidden }));

describe('bannerRecall — le bandeau revient quand quelque chose change (#17366, retouche 3)', () => {
  it('un acte du jour réalisé rappelle le bandeau', () => {
    expect(recall(game({ done: 1 }), game({ done: 2 }))).toBe('act');
  });

  it('l’Offrande qui devient prête rappelle le bandeau, et l’emporte sur l’acte qui l’a ouverte', () => {
    expect(recall(game({ done: 2 }), game({ done: 3, chest: 'ready' }))).toBe('offering-ready');
  });

  it('la Flamme qui passe à risque rappelle le bandeau', () => {
    expect(recall(game({ flame: 'lit' }), game({ flame: 'at-risk' }))).toBe('flame-at-risk');
  });

  it('un acte réalisé l’emporte sur la Flamme qui passe à risque au même instant', () => {
    expect(recall(game({ done: 0, flame: 'lit' }), game({ done: 1, flame: 'at-risk' }))).toBe('act');
  });

  it('un signal déjà levé ne rappelle pas une seconde fois', () => {
    expect(recall(game({ chest: 'ready' }), game({ chest: 'ready' }))).toBeNull();
    expect(recall(game({ flame: 'at-risk' }), game({ flame: 'at-risk' }))).toBeNull();
    expect(recall(game({ done: 2 }), game({ done: 2 }))).toBeNull();
  });

  it('ce qui retombe ne rappelle rien : un nouveau jour, une Offrande ouverte, une Flamme sauvée', () => {
    expect(recall(game({ done: 3 }), game({ done: 0 }))).toBeNull();
    expect(recall(game({ chest: 'ready' }), game({ chest: 'claimed' }))).toBeNull();
    expect(recall(game({ flame: 'at-risk' }), game({ flame: 'lit' }))).toBeNull();
  });

  it('la première lecture ne rappelle rien : l’ouverture de l’app montre déjà le bandeau', () => {
    expect(recall(null, game({ done: 2, chest: 'ready', flame: 'at-risk' }))).toBeNull();
  });

  it('un bloc qui disparaît ne rappelle rien', () => {
    expect(recall(game({ done: 1 }), null)).toBeNull();
  });

  it('« Jeu masqué » : rien ne rappelle le bandeau', () => {
    expect(recall(game({ done: 1 }), game({ done: 2, chest: 'ready' }), true)).toBeNull();
  });

  it('les actes qui s’ouvrent au niveau 5 comptent à partir de zéro', () => {
    expect(recall(game({ unlocked: false }), game({ unlocked: true, done: 1 }))).toBe('act');
    expect(recall(game({ unlocked: false }), game({ unlocked: true, done: 0 }))).toBeNull();
  });

  it('le rappel dure quelques secondes, bien moins que l’ouverture', () => {
    expect(PLAYER_BANNER_RECALL_MS).toBe(5_000);
  });
});
