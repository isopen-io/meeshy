import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationEncryptionSection } from './conversation-encryption-section';

/**
 * **LA FEUILLE DE DÉTAILS EXPLIQUE LE CHIFFREMENT DE LA CONVERSATION** (#12880)
 * — miroir de la fiche Chiffrement d'iOS : le mode en mots simples, puis qui
 * lit, ce qui manque, ce qui n'est pas encore livré, les appareils et la bascule.
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
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

const mount = async (conversation: { readonly id?: string; readonly type: 'direct' | 'group'; readonly encryptionMode: string | null }) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<ConversationEncryptionSection conversation={conversation} />);
  });
  for (let tries = 0; tries < 50 && document.querySelector('[data-conversation-encryption]') === null; tries += 1) await settle();
};

const text = (selector: string) => document.querySelector<HTMLElement>(selector)?.textContent ?? '';
const facts = () => [...document.querySelectorAll<HTMLElement>('[data-conversation-encryption-fact]')].map((node) => node.dataset.conversationEncryptionFact);

describe('la section dit le mode de la conversation ouverte, en mots simples', () => {
  test('bout en bout : seuls les appareils lisent, et le web dit qu’il ne lit pas encore', async () => {
    await mount({ type: 'direct', encryptionMode: 'e2ee' });
    expect(text('[data-conversation-encryption] h4')).toBe('Chiffrement');
    expect(text('[data-conversation-encryption-summary]')).toBe('Chiffrée de bout en bout : seuls les appareils des participants lisent les messages');
    expect(facts()).toContain('onlyParticipantsRead');
    expect(facts()).toContain('webCannotReadYet');
    expect(text('[data-conversation-encryption-fact="noEdit"]')).toBe('Un message envoyé ne peut pas être modifié.');
  });

  test('bout en bout : la fiche dit qu’il ne se désactive pas et qu’il faut une nouvelle conversation pour le clair (#12949)', async () => {
    await mount({ type: 'group', encryptionMode: 'e2ee' });
    expect(text('[data-conversation-encryption-fact="endToEndNeverTurnedOff"]')).toBe(
      'Le chiffrement de bout en bout ne se désactive pas. Pour échanger en clair, créez une nouvelle conversation.',
    );
    expect(facts()).not.toContain('switchNeverResendsInClear');
    expect(document.querySelector('[data-conversation-encryption] button')).toBeNull();
  });

  test('vue e2ee par ce compte puis servie sans mode : la fiche dit toujours le bout en bout (#12949)', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd('c-seen-e2ee');
    await mount({ id: 'c-seen-e2ee', type: 'direct', encryptionMode: null });
    expect(document.querySelector('[data-conversation-encryption]')?.getAttribute('data-conversation-encryption')).toBe('end-to-end');
    expect(facts()).toContain('endToEndNeverTurnedOffDirect');
    endToEndRegimeLedger.getState().reset();
  });

  test('bout en bout : « Meeshy ne peut pas les lire » porte sa réserve tant que les numéros de sécurité manquent (#12520)', async () => {
    await mount({ type: 'direct', encryptionMode: 'e2ee' });
    expect(text('[data-conversation-encryption-fact="onlyParticipantsRead"]')).toContain('tant que la vérification des numéros de sécurité n’est pas disponible');
  });

  test('hybride : identique au mode Serveur, jamais « de bout en bout »', async () => {
    await mount({ type: 'group', encryptionMode: 'hybrid' });
    expect(document.querySelector('[data-conversation-encryption]')?.getAttribute('data-conversation-encryption')).toBe('hybrid');
    expect(facts()).toContain('hybridIsServerToday');
    expect(facts()).not.toContain('onlyParticipantsRead');
  });

  test('sans chiffrement : stocké sans chiffrement sur le serveur', async () => {
    await mount({ type: 'direct', encryptionMode: null });
    expect(text('[data-conversation-encryption-summary]')).toBe('Non chiffrée : les messages sont stockés sans chiffrement sur le serveur');
  });
});
