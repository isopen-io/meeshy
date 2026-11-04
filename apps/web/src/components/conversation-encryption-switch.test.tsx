import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { EncryptionModeSwitchGesture, EncryptionStatus, EncryptionSwitchOutcome } from '@/lib/view/conversation-encryption-switch';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationEncryptionSection } from './conversation-encryption-section';

/**
 * **LA FICHE CHIFFREMENT MONTE LE MODE D'UN TÊTE-À-TÊTE DEPUIS LE WEB** (#14648)
 * — miroir de la section « Changer de mode » de la fiche iOS : au rôle que la
 * passerelle autorise, serveur ⇄ hybride d'un geste ; le bout en bout se voit,
 * grisé, avec la raison (#12975) ; une conversation chiffrée de bout en bout,
 * servie ou vue telle, ne propose rien.
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

type Conversation = { readonly id: string; readonly type: 'direct' | 'group'; readonly encryptionMode: string | null };

type Calls = { reads: number; switches: string[] };

const gestureOf = (status: EncryptionStatus | null, outcome: EncryptionSwitchOutcome, calls: Calls): EncryptionModeSwitchGesture => ({
  readStatus: async () => {
    calls.reads += 1;
    return status;
  },
  switchTo: async ({ target }) => {
    calls.switches.push(target);
    return outcome;
  },
});

const mount = async (conversation: Conversation, status: EncryptionStatus | null, outcome: EncryptionSwitchOutcome = { kind: 'switched', mode: 'hybrid' }) => {
  const calls: Calls = { reads: 0, switches: [] };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<ConversationEncryptionSection conversation={conversation} modeSwitch={gestureOf(status, outcome, calls)} />);
  });
  for (let tries = 0; tries < 50 && document.querySelector('[data-conversation-encryption]') === null; tries += 1) await settle();
  await settle();
  return calls;
};

const target = (mode: string) => document.querySelector<HTMLButtonElement>(`[data-conversation-encryption-switch-target="${mode}"]`);
const feedback = () => document.querySelector<HTMLElement>('[data-conversation-encryption-switch-status]')?.textContent ?? '';

describe('changer de mode depuis la fiche (#14648)', () => {
  test('serveur : « Passer au mode Hybride » visible sans déplier, avec ce que fait ce mode', async () => {
    await mount({ id: 'c1', type: 'direct', encryptionMode: 'server' }, { mode: 'server', canToggleEncryption: true });
    const hybrid = target('hybrid');
    expect(hybrid?.disabled).toBe(false);
    expect(hybrid?.closest('details')).toBeNull();
    expect(hybrid?.textContent).toContain('Passer au mode Hybride');
    expect(hybrid?.textContent).toContain('Chiffré sur nos serveurs');
    expect(target('server')).toBeNull();
  });

  test('le bout en bout se voit, désactivé, et dit pourquoi le navigateur ne l’active pas', async () => {
    await mount({ id: 'c1', type: 'direct', encryptionMode: 'server' }, { mode: 'server', canToggleEncryption: true });
    const endToEnd = target('e2ee');
    expect(endToEnd?.disabled).toBe(true);
    expect(endToEnd?.getAttribute('aria-disabled')).toBe('true');
    expect(endToEnd?.textContent).toContain('Bientôt disponible sur le web');
    expect(document.querySelector('[data-conversation-encryption-switch-apps-only]')?.textContent).toBe(
      'Le chiffrement de bout en bout s’active depuis l’application Meeshy installée : ce navigateur ne sait pas encore chiffrer les messages sur l’appareil.',
    );
  });

  test('toucher Hybride change le mode et le dit', async () => {
    const calls = await mount({ id: 'c1', type: 'direct', encryptionMode: 'server' }, { mode: 'server', canToggleEncryption: true });
    await act(async () => {
      target('hybrid')?.click();
    });
    await settle();
    expect(calls.switches).toEqual(['hybrid']);
    expect(feedback()).toBe('Le mode de chiffrement est maintenant : Hybride.');
    expect(target('server')).not.toBeNull();
    expect(target('hybrid')).toBeNull();
  });

  test('passée au bout en bout après la bascule : la fiche ne dit plus « maintenant Hybride »', async () => {
    await mount({ id: 'c1', type: 'direct', encryptionMode: 'server' }, { mode: 'server', canToggleEncryption: true });
    await act(async () => {
      target('hybrid')?.click();
    });
    await settle();
    await act(async () => {
      endToEndRegimeLedger.getState().learnEndToEnd('c1');
    });
    await settle();
    expect(feedback()).toBe('');
    expect(document.querySelector('[data-conversation-encryption-switch]')).toBeNull();
  });

  test('un clic sur le bout en bout grisé ne part jamais', async () => {
    const calls = await mount({ id: 'c1', type: 'direct', encryptionMode: 'server' }, { mode: 'server', canToggleEncryption: true });
    await act(async () => {
      target('e2ee')?.click();
    });
    expect(calls.switches).toEqual([]);
  });

  test('409 E2EE_IRREVERSIBLE : le refus se dit en mots simples', async () => {
    await mount({ id: 'c1', type: 'direct', encryptionMode: 'server' }, { mode: 'server', canToggleEncryption: true }, { kind: 'irreversible' });
    await act(async () => {
      target('hybrid')?.click();
    });
    await settle();
    expect(feedback()).toBe('Cette conversation est chiffrée de bout en bout : ce chiffrement ne se désactive jamais.');
  });

  test('bascule concurrente : l’état est relu', async () => {
    const calls = await mount({ id: 'c1', type: 'direct', encryptionMode: 'server' }, { mode: 'server', canToggleEncryption: true }, { kind: 'regime-changed' });
    expect(calls.reads).toBe(1);
    await act(async () => {
      target('hybrid')?.click();
    });
    await settle();
    expect(calls.reads).toBe(2);
    expect(feedback()).toBe('Le chiffrement vient d’être modifié par un autre membre : l’état est actualisé.');
  });

  test('sans le droit servi, rien ne se propose', async () => {
    await mount({ id: 'c1', type: 'direct', encryptionMode: 'server' }, { mode: 'server', canToggleEncryption: false });
    expect(document.querySelector('[data-conversation-encryption-switch]')).toBeNull();
  });

  test('bout en bout servi : aucun geste, et l’état n’est même pas demandé', async () => {
    const calls = await mount({ id: 'c1', type: 'direct', encryptionMode: 'e2ee' }, { mode: 'server', canToggleEncryption: true });
    expect(document.querySelector('[data-conversation-encryption-switch]')).toBeNull();
    expect(calls.reads).toBe(0);
  });

  test('vue e2ee par ce compte, servie en serveur : la rétrogradation est ignorée, aucun geste', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd('c-seen');
    await mount({ id: 'c-seen', type: 'direct', encryptionMode: 'server' }, { mode: 'server', canToggleEncryption: true });
    expect(document.querySelector('[data-conversation-encryption-switch]')).toBeNull();
    expect(document.querySelector('[data-conversation-encryption]')?.getAttribute('data-conversation-encryption')).toBe('end-to-end');
  });

  test('le détail servi en clair alors que la liste dit e2ee : aucun geste', async () => {
    await mount({ id: 'c1', type: 'direct', encryptionMode: 'e2ee' }, { mode: null, canToggleEncryption: true });
    expect(document.querySelector('[data-conversation-encryption-switch]')).toBeNull();
  });

  test('un fil qui retient l’envoi : aucune cible proposée, et la fiche ne se dit pas « bout en bout » (#14664)', async () => {
    endToEndRegimeLedger.getState().holdSend('c-held', true);
    await mount({ id: 'c-held', type: 'direct', encryptionMode: 'server' }, { mode: 'server', canToggleEncryption: true });
    expect(document.querySelector('[data-conversation-encryption-switch-target]')).toBeNull();
    expect(document.querySelector('[data-conversation-encryption]')?.getAttribute('data-conversation-encryption')).toBe('server');
  });

  test('retenu pendant que la fiche est ouverte : les cibles disparaissent (#14664)', async () => {
    await mount({ id: 'c-held', type: 'direct', encryptionMode: 'server' }, { mode: 'server', canToggleEncryption: true });
    expect(target('hybrid')).not.toBeNull();
    await act(async () => {
      endToEndRegimeLedger.getState().holdSend('c-held', true);
    });
    await settle();
    expect(document.querySelector('[data-conversation-encryption-switch-target]')).toBeNull();
  });

  test('un refus « retenu » se dit pour ce qu’il est, jamais « bout en bout » (#14664)', async () => {
    await mount({ id: 'c1', type: 'direct', encryptionMode: 'server' }, { mode: 'server', canToggleEncryption: true }, { kind: 'held' });
    await act(async () => {
      target('hybrid')?.click();
    });
    await settle();
    expect(feedback()).toBe('Un message de ce fil utilise un chiffrement que ce navigateur ne reconnaît pas : le mode ne peut pas être changé d’ici.');
  });

  test('un groupe ne change pas de mode depuis le web', async () => {
    await mount({ id: 'g1', type: 'group', encryptionMode: 'server' }, { mode: 'server', canToggleEncryption: true });
    expect(document.querySelector('[data-conversation-encryption-switch]')).toBeNull();
  });
});
