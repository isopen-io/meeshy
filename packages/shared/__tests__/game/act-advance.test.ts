import { describe, it, expect } from 'vitest';
import { actAdvance, type ActAdvanceSource } from '../../utils/game/act-advance.js';

type Act = ActAdvanceSource['missions']['items'][number];

const act = (id: string, difficulty: Act['difficulty'], progress: number, target: number): Act => ({ id, difficulty, progress, target });

const game = (items: readonly Act[], overrides: { readonly dayKey?: string; readonly unlocked?: boolean } = {}): ActAdvanceSource => ({
  missions: { dayKey: overrides.dayKey ?? '2026-11-18', unlocked: overrides.unlocked ?? true, items },
});

const day = (medium: number, hard = 0) => game([act('a', 'easy', 1, 1), act('b', 'medium', medium, 5), act('c', 'hard', hard, 8)]);

describe('actAdvance — un acte du Rêve qui avance se voit à l’envoi (#17367)', () => {
  it('l’acte dont la progression monte est rendu avec sa nouvelle progression et son objectif', () => {
    expect(actAdvance(day(2), day(3), { hidden: false })).toEqual({ difficulty: 'medium', progress: 3, target: 5 });
  });

  it('un acte qui atteint son objectif est rendu aussi : « 5 sur 5 »', () => {
    expect(actAdvance(day(4), day(5), { hidden: false })).toEqual({ difficulty: 'medium', progress: 5, target: 5 });
  });

  it('une progression servie au-delà de l’objectif se lit à l’objectif', () => {
    expect(actAdvance(day(4), day(7), { hidden: false })).toEqual({ difficulty: 'medium', progress: 5, target: 5 });
  });

  it('quand deux actes avancent ensemble, le premier dans l’ordre du jour parle', () => {
    expect(actAdvance(day(2, 1), day(3, 2), { hidden: false })).toEqual({ difficulty: 'medium', progress: 3, target: 5 });
  });

  it('aucun acte n’avance : rien', () => {
    expect(actAdvance(day(2), day(2), { hidden: false })).toBeNull();
  });

  it('une progression qui baisse ne dit rien', () => {
    expect(actAdvance(day(3), day(2), { hidden: false })).toBeNull();
  });

  it('« Jeu masqué » : rien, même quand un acte avance', () => {
    expect(actAdvance(day(2), day(3), { hidden: true })).toBeNull();
  });

  it('un nouveau jour n’est pas une avancée : les actes ont changé de journée', () => {
    expect(actAdvance(day(2), game([act('b', 'medium', 3, 5)], { dayKey: '2026-11-19' }), { hidden: false })).toBeNull();
  });

  it('un acte remplacé (relance) n’est pas une avancée : seul un même acte se compare', () => {
    expect(actAdvance(day(2), game([act('a', 'easy', 1, 1), act('z', 'medium', 3, 5), act('c', 'hard', 0, 8)]), { hidden: false })).toBeNull();
  });

  it('actes pas encore ouverts : rien', () => {
    expect(actAdvance(game([act('b', 'medium', 2, 5)], { unlocked: false }), game([act('b', 'medium', 3, 5)], { unlocked: false }), { hidden: false })).toBeNull();
  });

  it('sans lecture d’avant ou d’après (cache vide, ancien serveur) : rien, jamais une exception', () => {
    expect(actAdvance(null, day(3), { hidden: false })).toBeNull();
    expect(actAdvance(day(2), undefined, { hidden: false })).toBeNull();
  });
});
