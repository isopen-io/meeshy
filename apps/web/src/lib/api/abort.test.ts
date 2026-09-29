import { describe, expect, test } from 'bun:test';

import { anySignal, timeoutSignal } from './abort';

/**
 * **UNE WEBVIEW ANTÉRIEURE À CHROMIUM 116 N'A PAS `AbortSignal.any`** (#8481).
 * Mesuré sur la WebView système 113 d'un Android 14 : chaque lecture levait
 * `AbortSignal.any is not a function`, et la liste des conversations restait
 * en erreur sans jamais atteindre le réseau. Les deux fonctions reçoivent les
 * statiques natives en paramètre : `{}` simule le moteur qui ne les a pas.
 */

const without = {};

describe('anySignal', () => {
  test('sans AbortSignal.any : annule quand le premier signal annule, avec sa cause', () => {
    const first = new AbortController();
    const second = new AbortController();
    const signal = anySignal([first.signal, second.signal], without);
    expect(signal.aborted).toBe(false);
    first.abort('premier');
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('premier');
  });

  test('sans AbortSignal.any : annule quand le second signal annule', () => {
    const first = new AbortController();
    const second = new AbortController();
    const signal = anySignal([first.signal, second.signal], without);
    second.abort('second');
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('second');
  });

  test('sans AbortSignal.any : un signal déjà annulé rend un signal déjà annulé', () => {
    const done = new AbortController();
    done.abort('déjà');
    const signal = anySignal([new AbortController().signal, done.signal], without);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('déjà');
  });

  test('avec AbortSignal.any : la version native est utilisée', () => {
    const native = new AbortController().signal;
    let seen: readonly AbortSignal[] = [];
    const signal = anySignal([native], {
      any: (signals: AbortSignal[]) => {
        seen = signals;
        return native;
      },
    });
    expect(signal).toBe(native);
    expect(seen).toEqual([native]);
  });
});

describe('timeoutSignal', () => {
  test('sans AbortSignal.timeout : annule après le délai, en TimeoutError', async () => {
    const signal = timeoutSignal(5, without);
    expect(signal.aborted).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(signal.aborted).toBe(true);
    expect((signal.reason as DOMException).name).toBe('TimeoutError');
  });

  test('avec AbortSignal.timeout : la version native est utilisée', () => {
    const native = new AbortController().signal;
    expect(timeoutSignal(1000, { timeout: () => native })).toBe(native);
  });
});
