import { describe, expect, test } from 'bun:test';

import { isMediaStalled, watchMediaStall } from './media-stall';

/**
 * UN MÉDIA QUI ATTEND SES OCTETS (#9277, #6925) — la loi qui dit, d'un
 * `<video>`/`<audio>`, qu'il VEUT lire et ne le peut pas : c'est l'état qu'un
 * réseau lent produit, et le seul où la scène doit l'attendre.
 */
const probe = (overrides: Partial<{ paused: boolean; ended: boolean; readyState: number; error: unknown }> = {}) => ({
  paused: false,
  ended: false,
  readyState: 4,
  error: null,
  ...overrides,
});

describe('isMediaStalled', () => {
  test('un média qui lit sans données d’avance attend : il est en buffer', () => {
    expect(isMediaStalled(probe({ readyState: 2 }))).toBe(true);
    expect(isMediaStalled(probe({ readyState: 0 }))).toBe(true);
  });

  test('un média qui a des données d’avance lit : aucun buffer', () => {
    expect(isMediaStalled(probe({ readyState: 3 }))).toBe(false);
    expect(isMediaStalled(probe({ readyState: 4 }))).toBe(false);
  });

  test('une pause, une fin ou une erreur ne sont jamais un buffer — la scène ne les attend pas', () => {
    expect(isMediaStalled(probe({ readyState: 1, paused: true }))).toBe(false);
    expect(isMediaStalled(probe({ readyState: 1, ended: true }))).toBe(false);
    expect(isMediaStalled(probe({ readyState: 1, error: { code: 2 } }))).toBe(false);
  });
});

describe('watchMediaStall', () => {
  const element = () => {
    const target = new EventTarget() as EventTarget & { paused: boolean; ended: boolean; readyState: number; error: unknown };
    target.paused = false;
    target.ended = false;
    target.readyState = 4;
    target.error = null;
    return target;
  };

  test('annonce le buffer à `waiting` et sa fin à `playing`, une fois par changement', () => {
    const el = element();
    const seen: boolean[] = [];
    const stop = watchMediaStall(el, (stalled) => seen.push(stalled));
    el.readyState = 2;
    el.dispatchEvent(new Event('waiting'));
    el.dispatchEvent(new Event('waiting'));
    el.readyState = 4;
    el.dispatchEvent(new Event('playing'));
    expect(seen).toEqual([true, false]);
    stop();
  });

  test('une pause pendant le buffer le clôt — et le détacher en annonce la fin', () => {
    const el = element();
    const seen: boolean[] = [];
    const stop = watchMediaStall(el, (stalled) => seen.push(stalled));
    el.readyState = 1;
    el.dispatchEvent(new Event('waiting'));
    el.paused = true;
    el.dispatchEvent(new Event('pause'));
    el.paused = false;
    el.dispatchEvent(new Event('play'));
    stop();
    expect(seen).toEqual([true, false, true, false]);
    el.dispatchEvent(new Event('waiting'));
    expect(seen).toEqual([true, false, true, false]);
  });

  test('un média déjà en buffer au branchement est annoncé tout de suite', () => {
    const el = element();
    el.readyState = 0;
    const seen: boolean[] = [];
    watchMediaStall(el, (stalled) => seen.push(stalled))();
    expect(seen).toEqual([true, false]);
  });
});
