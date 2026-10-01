import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { appQueryClient } from '@/lib/api/query-client';
import { closeSendSheet, openSendSheet, sendSheetStore } from '@/lib/send/send-sheet-store';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SEND_SHEET_EXIT_MS } from './send-sheet-frame';
import { SendSheetHost } from './send-sheet-host';

/**
 * L'HÔTE DE LA FEUILLE D'ENVOI (#8884) — monté par la coquille sur toutes les
 * routes : il ne rend RIEN tant qu'aucune entrée n'a appelé `openSendSheet`,
 * va chercher la feuille à la demande, et rend le magasin à `null` quand
 * l'utilisateur annule.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  closeSendSheet();
  mounter.unmountAll();
  appQueryClient.clear();
});

const settleLazy = async (): Promise<void> => {
  for (let turn = 0; turn < 20; turn += 1) await mounter.settle();
};

const mount = () =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <SendSheetHost />
    </QueryClientProvider>,
  );

describe('SendSheetHost — une feuille, ouverte par n’importe quelle entrée', () => {
  test('rien tant que personne ne l’ouvre', async () => {
    const host = await mount();
    expect(host.querySelector('dialog')).toBe(null);
  });

  test('`openSendSheet` monte la feuille (à la demande) ; « Annuler » rend le magasin à null', async () => {
    const host = await mount();
    await act(async () => {
      openSendSheet({ payload: { kind: 'text', text: 'Bonjour' }, intent: 'share' });
    });
    await settleLazy();
    expect(host.querySelector('dialog')?.open).toBe(true);
    expect(host.querySelector('h2')?.textContent).toBe('Partager');

    await mounter.click(buttonNamed(host, 'Annuler'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SEND_SHEET_EXIT_MS + 20));
    });
    expect(sendSheetStore.getState().request).toBe(null);
    expect(host.querySelector('dialog')).toBe(null);
  });

  test('une seconde demande REMPLACE la première sans que la fermeture de l’ancienne efface la nouvelle', async () => {
    const host = await mount();
    await act(async () => {
      openSendSheet({ payload: { kind: 'text', text: 'Un' }, intent: 'share' });
    });
    await settleLazy();
    const second = { payload: { kind: 'text', text: 'Deux' }, intent: 'forward' } as const;
    await act(async () => {
      openSendSheet(second);
    });
    await settleLazy();
    expect(sendSheetStore.getState().request).toBe(second);
    expect(host.querySelector('h2')?.textContent).toBe('Transférer');
    expect(host.textContent).toContain('Deux');
  });
});
