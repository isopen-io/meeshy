import { describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import type { VerificationStatusData } from '@/lib/api/verify-email';

import { VERIFICATION_WATCH_INTERVAL_MS, watchVerificationStatus, type VerificationWatchView } from './verification-watch';

/**
 * L'ÉCRAN DU CODE APPREND QUE L'ADRESSE A ÉTÉ PROUVÉE AILLEURS (#8083) — il
 * interroge `POST /auth/verification/status` toutes les ~3 s tant que l'onglet
 * est visible, tout de suite au retour, et s'arrête au démontage, à la preuve
 * ou quand le jeton n'est plus valable (401/410). Un ÉTAT, jamais une session.
 */
function fakeView(initial: DocumentVisibilityState = 'visible') {
  const doc = Object.assign(new EventTarget(), { visibilityState: initial });
  const timers: Array<{ readonly run: () => void; readonly ms: number; cleared: boolean }> = [];
  const view: VerificationWatchView = {
    document: doc,
    setTimeout: (run, ms) => {
      timers.push({ run, ms, cleared: false });
      return timers.length - 1;
    },
    clearTimeout: (id) => {
      const t = timers[id];
      if (t !== undefined) t.cleared = true;
    },
  };
  const setVisibility = (state: DocumentVisibilityState) => {
    doc.visibilityState = state;
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  const pending = () => timers.filter((t) => !t.cleared);
  const fire = async () => {
    const live = pending();
    live.forEach((t) => {
      t.cleared = true;
    });
    live.forEach((t) => t.run());
    await flush();
  };
  return { view, setVisibility, pending, fire };
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

const ok = (status: VerificationStatusData['status']): ApiResult<VerificationStatusData> => ({ ok: true, status: 200, data: { status } });

function reader(responses: ReadonlyArray<ApiResult<VerificationStatusData>>) {
  const tokens: string[] = [];
  let i = 0;
  const read = async (token: string) => {
    tokens.push(token);
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return r ?? ok('pending');
  };
  return { tokens, read };
}

describe('watchVerificationStatus', () => {
  test('interroge au démarrage, puis toutes les ~3 s tant que c’est « pending »', async () => {
    const { view, pending, fire } = fakeView();
    const r = reader([ok('pending')]);
    watchVerificationStatus({ token: 'tok', read: r.read, view, onProven: () => undefined });
    await flush();
    expect(r.tokens).toEqual(['tok']);
    expect(pending().map((t) => t.ms)).toEqual([VERIFICATION_WATCH_INTERVAL_MS]);
    expect(VERIFICATION_WATCH_INTERVAL_MS).toBe(3_000);
    await fire();
    expect(r.tokens).toEqual(['tok', 'tok']);
  });

  test('« proven » ⇒ annoncé UNE fois, puis plus aucune interrogation', async () => {
    const { view, pending } = fakeView();
    const r = reader([ok('proven')]);
    let proven = 0;
    watchVerificationStatus({ token: 'tok', read: r.read, view, onProven: () => (proven += 1) });
    await flush();
    expect(proven).toBe(1);
    expect(pending()).toEqual([]);
  });

  test('onglet caché : aucune interrogation ; au retour, tout de suite', async () => {
    const { view, setVisibility, pending, fire } = fakeView();
    const r = reader([ok('pending')]);
    watchVerificationStatus({ token: 'tok', read: r.read, view, onProven: () => undefined });
    await flush();
    setVisibility('hidden');
    expect(pending()).toEqual([]);
    await fire();
    expect(r.tokens.length).toBe(1);
    setVisibility('visible');
    await flush();
    expect(r.tokens.length).toBe(2);
  });

  test('jeton inconnu (401) ou expiré (410) ⇒ on s’arrête, sans rien annoncer', async () => {
    for (const status of [401, 410]) {
      const { view, pending, setVisibility } = fakeView();
      const r = reader([{ ok: false, status, error: 'x' }]);
      let proven = 0;
      watchVerificationStatus({ token: 'tok', read: r.read, view, onProven: () => (proven += 1) });
      await flush();
      setVisibility('hidden');
      setVisibility('visible');
      await flush();
      expect(r.tokens.length).toBe(1);
      expect(pending()).toEqual([]);
      expect(proven).toBe(0);
    }
  });

  test('hors-ligne ou débit dépassé ⇒ on réessaie plus tard', async () => {
    const { view, pending } = fakeView();
    const r = reader([{ ok: false, status: 0, error: 'offline' }]);
    watchVerificationStatus({ token: 'tok', read: r.read, view, onProven: () => undefined });
    await flush();
    expect(pending().length).toBe(1);
  });

  test('arrêté (démontage) ⇒ plus rien, même une réponse en vol n’annonce pas', async () => {
    const { view, pending, setVisibility } = fakeView();
    let release: (r: ApiResult<VerificationStatusData>) => void = () => undefined;
    const read = () => new Promise<ApiResult<VerificationStatusData>>((resolve) => (release = resolve));
    let proven = 0;
    const stop = watchVerificationStatus({ token: 'tok', read, view, onProven: () => (proven += 1) });
    stop();
    release(ok('proven'));
    await flush();
    setVisibility('hidden');
    setVisibility('visible');
    await flush();
    expect(proven).toBe(0);
    expect(pending()).toEqual([]);
  });

  test('onglet caché dès le départ : on attend le retour', async () => {
    const { view, setVisibility } = fakeView('hidden');
    const r = reader([ok('pending')]);
    watchVerificationStatus({ token: 'tok', read: r.read, view, onProven: () => undefined });
    await flush();
    expect(r.tokens).toEqual([]);
    setVisibility('visible');
    await flush();
    expect(r.tokens).toEqual(['tok']);
  });
});
