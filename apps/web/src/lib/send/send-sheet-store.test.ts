import { describe, expect, test } from 'bun:test';

import type { SendPayload } from './send-sheet-plan';
import { createSendSheetStore } from './send-sheet-store';

/**
 * L'OUVERTURE DE LA FEUILLE D'ENVOI (#8884) — un seul magasin, sans UI : toute
 * entrée (transfert, visionneuse, publication, partage entrant) l'ouvre par le
 * même geste, l'hôte monté à la racine s'y abonne.
 */
const text: SendPayload = { kind: 'text', text: 'Salut' };
const files: SendPayload = { kind: 'files', files: [new File([new Uint8Array(1)], 'a.png', { type: 'image/png' })] };

describe('openSendSheet / closeSendSheet', () => {
  test('fermée au départ', () => {
    expect(createSendSheetStore().getState().request).toBeNull();
  });

  test('ouvrir pose la demande, fermer la retire', () => {
    const store = createSendSheetStore();
    store.getState().open({ payload: text, intent: 'share' });
    expect(store.getState().request).toEqual({ payload: text, intent: 'share' });
    store.getState().close();
    expect(store.getState().request).toBeNull();
  });

  test('“plus d’options” voyage avec la demande', () => {
    const store = createSendSheetStore();
    store.getState().open({ payload: text, intent: 'share', moreOptions: { url: 'https://meeshy.me/p/1' } });
    expect(store.getState().request?.moreOptions).toEqual({ url: 'https://meeshy.me/p/1' });
  });

  test('ouvrir une seconde demande REMPLACE la première (une seule feuille à la fois)', () => {
    const store = createSendSheetStore();
    store.getState().open({ payload: text, intent: 'forward' });
    store.getState().open({ payload: files, intent: 'share' });
    expect(store.getState().request?.payload.kind).toBe('files');
  });

  test('les abonnés sont prévenus à l’ouverture et à la fermeture, pas après désabonnement', () => {
    const store = createSendSheetStore();
    const seen: (string | null)[] = [];
    const stop = store.subscribe((state) => seen.push(state.request?.intent ?? null));
    store.getState().open({ payload: text, intent: 'forward' });
    store.getState().close();
    stop();
    store.getState().open({ payload: text, intent: 'share' });
    expect(seen).toEqual(['forward', null]);
  });

  test('fermer une feuille déjà fermée ne réveille personne', () => {
    const store = createSendSheetStore();
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.getState().close();
    expect(calls).toBe(0);
  });
});
