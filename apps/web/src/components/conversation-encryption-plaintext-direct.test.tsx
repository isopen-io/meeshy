import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { PlaintextDirectOutcome } from '@/lib/view/plaintext-direct';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationEncryptionSection } from './conversation-encryption-section';

/**
 * **LA FICHE D'UN TÊTE-À-TÊTE CHIFFRÉ OUVRE LA CONVERSATION NON CHIFFRÉE À
 * CÔTÉ** (#12966, décision porteur du 2026-10-25) — le bout en bout ne se
 * désactive pas ; pour échanger en clair avec la même personne, un second
 * tête-à-tête existe, et la fiche y mène d'un geste. Un groupe n'en a pas, ni
 * un tête-à-tête que le serveur lit déjà.
 */
const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  endToEndRegimeLedger.getState().reset();
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

type Conversation = { readonly id?: string; readonly type: 'direct' | 'group'; readonly encryptionMode: string | null };

const mount = async (conversation: Conversation, outcome: PlaintextDirectOutcome | null = 'opened') => {
  const calls: string[] = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const plaintextDirect =
    outcome === null
      ? undefined
      : {
          peerName: 'Amina',
          open: async () => {
            calls.push('open');
            return outcome;
          },
        };
  act(() => {
    root.render(<ConversationEncryptionSection conversation={conversation} plaintextDirect={plaintextDirect} />);
  });
  for (let tries = 0; tries < 50 && document.querySelector('[data-conversation-encryption]') === null; tries += 1) await settle();
  return calls;
};

const button = () => document.querySelector<HTMLButtonElement>('[data-conversation-encryption-open-plaintext]');
const status = () => document.querySelector<HTMLElement>('[data-conversation-encryption-open-plaintext-status]')?.textContent ?? '';

describe('la fiche d’un tête-à-tête chiffré de bout en bout ouvre la conversation non chiffrée (#12966)', () => {
  test('le geste est nommé par la personne, visible sans déplier, et l’ouvre', async () => {
    const calls = await mount({ id: 'c-sealed', type: 'direct', encryptionMode: 'e2ee' });
    expect(button()?.textContent).toBe('Ouvrir une conversation non chiffrée avec Amina');
    expect(button()?.closest('details')).toBeNull();
    await act(async () => {
      button()?.click();
    });
    await settle();
    expect(calls).toEqual(['open']);
  });

  test('la fiche dit que le tête-à-tête reste chiffré et qu’un second, non chiffré, existe à côté', async () => {
    await mount({ id: 'c-sealed', type: 'direct', encryptionMode: 'e2ee' });
    expect(document.querySelector('[data-conversation-encryption-fact="endToEndNeverTurnedOffDirect"]')?.textContent).toBe(
      'Le chiffrement de bout en bout ne se désactive pas : ce tête-à-tête reste chiffré. Pour échanger en clair avec cette personne, ouvrez une conversation non chiffrée à côté : les deux sont dans la liste, celle-ci marquée d’un cadenas.',
    );
  });

  test('un tête-à-tête vu chiffré par ce compte, servi ensuite sans mode, garde le geste', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd('c-seen');
    await mount({ id: 'c-seen', type: 'direct', encryptionMode: null });
    expect(button()).not.toBeNull();
  });

  const REFUSALS: ReadonlyArray<readonly [string, PlaintextDirectOutcome, string]> = [
    ['un échec', 'failed', 'La conversation non chiffrée n’a pas pu être ouverte. Réessayez.'],
    ['hors connexion', 'offline', 'Hors connexion : reconnectez-vous pour ouvrir la conversation non chiffrée.'],
  ];
  for (const [label, outcome, message] of REFUSALS) test(`${label} se dit sous le geste, qui reste disponible`, async () => {
    await mount({ id: 'c-sealed', type: 'direct', encryptionMode: 'e2ee' }, outcome);
    await act(async () => {
      button()?.click();
    });
    await settle();
    expect(status()).toBe(message);
    expect(button()?.disabled).toBe(false);
  });

  const WITHOUT: ReadonlyArray<readonly [string, Omit<Conversation, 'id'>]> = [
    ['un groupe chiffré', { type: 'group', encryptionMode: 'e2ee' }],
    ['un tête-à-tête sans chiffrement', { type: 'direct', encryptionMode: null }],
    ['un tête-à-tête chiffré par le serveur', { type: 'direct', encryptionMode: 'server' }],
  ];
  for (const [label, conversation] of WITHOUT) test(`${label} n’a pas le geste`, async () => {
    await mount({ id: 'c-x', ...conversation });
    expect(button()).toBeNull();
  });

  test('sans pair connu (hôte qui ne fournit pas le geste), rien n’est promis', async () => {
    await mount({ id: 'c-sealed', type: 'direct', encryptionMode: 'e2ee' }, null);
    expect(button()).toBeNull();
  });
});
