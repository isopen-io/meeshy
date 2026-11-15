import { describe, expect, test } from 'bun:test';

import { observeCredit } from './credit';

/**
 * LE « +N » APRÈS UN GESTE EST LE CRÉDIT RÉEL (#7908) — relu au serveur, élan
 * compris. Le crédit s'écrit APRÈS l'accusé (un effet de la passerelle, jamais
 * attendu par l'envoi) : la relecture patiente quelques instants, puis rend ce
 * qu'elle a vu, sans jamais inventer.
 */

const reads = (values: readonly (number | null)[]) => {
  let index = 0;
  const calls: number[] = [];
  return {
    calls,
    readScore: async () => {
      calls.push(index);
      const value = values[Math.min(index, values.length - 1)] ?? null;
      index += 1;
      return value;
    },
  };
};

const noWait = async () => undefined;

describe('observeCredit — le crédit relu, jamais supposé', () => {
  test('élan à 2 : le serveur crédite 28 pour un salut annoncé « 14 » au barème — le +N dit 28', async () => {
    const { readScore } = reads([128]);
    expect(await observeCredit({ readScore, before: 100, delays: [0], wait: noWait })).toEqual({ score: 128, credit: 28 });
  });

  test('le crédit arrive après l’accusé : la relecture patiente jusqu’à le voir', async () => {
    const { readScore, calls } = reads([100, 100, 121]);
    expect(await observeCredit({ readScore, before: 100, delays: [0, 10, 20, 40], wait: noWait })).toEqual({ score: 121, credit: 21 });
    expect(calls).toHaveLength(3);
  });

  test('rien de crédité dans la fenêtre : aucun +N, le score lu est rendu tel quel', async () => {
    const { readScore } = reads([100]);
    expect(await observeCredit({ readScore, before: 100, delays: [0, 10], wait: noWait })).toEqual({ score: 100, credit: 0 });
  });

  test('la lecture échoue partout : rien — ni score ni crédit inventés', async () => {
    const { readScore } = reads([null]);
    expect(await observeCredit({ readScore, before: 100, delays: [0, 10], wait: noWait })).toBeNull();
  });

  test('sans repère de départ : le score est relu, aucun crédit n’est attribué', async () => {
    const { readScore } = reads([140]);
    expect(await observeCredit({ readScore, before: undefined, delays: [0], wait: noWait })).toEqual({ score: 140, credit: 0 });
  });
});
