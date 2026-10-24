import { describe, expect, test } from 'bun:test';

import { runBounded } from './run-bounded.mjs';

/**
 * LES TÂCHES D'UN GATE TOURNENT N À LA FOIS, ET LEURS CONSTATS SORTENT DANS
 * L'ORDRE DES TÂCHES (#12622) — voir le doc-comment de `run-bounded.mjs`.
 */

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('runBounded', () => {
  test('ne fait jamais tourner plus de N tâches à la fois', async () => {
    let enCours = 0;
    let pic = 0;
    const tache = async () => {
      enCours += 1;
      pic = Math.max(pic, enCours);
      await pause(5);
      enCours -= 1;
    };
    await runBounded(Array.from({ length: 9 }, () => tache), 3);
    expect(pic).toBe(3);
  });

  test('joue chaque tâche une fois, même quand N dépasse leur nombre', async () => {
    const jouees: number[] = [];
    await runBounded([0, 1].map((i) => async () => { jouees.push(i); }), 8);
    expect([...jouees].sort()).toEqual([0, 1]);
  });

  test("rend les constats dans l'ordre des tâches, pas dans celui où elles finissent", async () => {
    const constats = await runBounded(
      [30, 1, 15].map((ms, i) => async (constate: (vrai: boolean, quoi: string) => void) => {
        await pause(ms);
        constate(false, `tâche ${i}`);
        constate(true, 'jamais retenu');
      }),
      3,
    );
    expect(constats).toEqual(['tâche 0', 'tâche 1', 'tâche 2']);
  });

  test('une limite sous 1 se lit 1 : le gate reste en série, il ne bloque pas', async () => {
    let enCours = 0;
    let pic = 0;
    const tache = async () => {
      enCours += 1;
      pic = Math.max(pic, enCours);
      await pause(1);
      enCours -= 1;
    };
    await runBounded([tache, tache], 0);
    expect(pic).toBe(1);
  });

  test("une tâche qui jette fait échouer l'ensemble", async () => {
    const erreur = await runBounded([async () => { throw new Error('navigateur perdu'); }], 2).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(erreur).toBeInstanceOf(Error);
    expect((erreur as Error).message).toBe('navigateur perdu');
  });
});
