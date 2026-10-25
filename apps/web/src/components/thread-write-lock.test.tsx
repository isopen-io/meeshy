import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { Conversation, Message } from '@/lib/api/types';
import { canSendPlaintext, endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { LocalMessage } from '@/lib/send/local-message';
import type { PlaintextDirectGesture, PlaintextDirectOutcome } from '@/lib/view/plaintext-direct';
import { outboxStore } from '@/lib/send/outbox-store';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadWriteLock } from './thread-write-lock';

/**
 * LE COMPOSEUR VERROUILLÉ DE MEESHY GLOBAL (#9928) — un mineur lit Global sans
 * champ de saisie ; un envoi refusé `GLOBAL_ADULTS_ONLY` (état périmé) bascule
 * le fil dans le même état et retire la bulle optimiste.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/chat/c-global' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  endToEndRegimeLedger.getState().reset();
});

const conversation = (id: string, extra: Record<string, unknown> = {}): Conversation =>
  ({
    id,
    identifier: 'meeshy',
    type: 'global',
    status: 'active',
    visibility: 'public',
    isActive: true,
    memberCount: 10,
    participants: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  }) as Conversation;

function Probe({
  conversation: served,
  messages,
  plaintextDirect,
}: {
  readonly conversation: Conversation;
  readonly messages?: readonly Message[];
  readonly plaintextDirect?: PlaintextDirectGesture;
}) {
  return (
    <ThreadWriteLock conversationId={served.id} conversation={served} messages={messages} plaintextDirect={plaintextDirect}>
      <textarea data-probe-field />
    </ThreadWriteLock>
  );
}

describe('le bandeau qui remplace le composeur', () => {
  test('servi « minor-global » : aucun champ de saisie, la phrase sobre à sa place', async () => {
    const host = await mount(<Probe conversation={conversation('c-served', { viewerWriteRestriction: 'minor-global' })} />);
    expect(host.querySelector('textarea, input, [contenteditable]')).toBeNull();
    expect(host.querySelector('[data-write-restriction]')?.textContent).toBe('Global s’ouvre à l’écriture à tes 18 ans');
  });

  test('aucune restriction servie : le composeur reste', async () => {
    const host = await mount(<Probe conversation={conversation('c-adult', { viewerWriteRestriction: null })} />);
    expect(host.querySelector('[data-probe-field]')).not.toBeNull();
  });

  test('un envoi refusé GLOBAL_ADULTS_ONLY : la bulle part et le fil bascule dans le même état', async () => {
    const id = 'c-stale';
    const host = await mount(<Probe conversation={conversation(id)} />);
    const message = { id: 'm1', clientMessageId: 'm1', conversationId: id, content: 'salut' } as unknown as LocalMessage;
    await act(async () => {
      outboxStore.getState().enqueue(id, { message, delivery: 'pending', attempts: 1, startedAt: 0 });
      outboxStore.getState().markFailed(id, 'm1', { ok: false, status: 403, error: 'adultes', code: 'GLOBAL_ADULTS_ONLY' });
    });
    expect(outboxStore.getState().entries[id]).toBeUndefined();
    expect(host.querySelector('[data-probe-field]')).toBeNull();
    expect(host.querySelector('[data-write-restriction]')).not.toBeNull();
  });
});

describe('le composeur d’une conversation chiffrée de bout en bout (#11216)', () => {
  test('e2ee : aucun champ de saisie, la mention claire à sa place', async () => {
    const host = await mount(<Probe conversation={conversation('c-e2ee', { type: 'direct', encryptionMode: 'e2ee' })} />);
    expect(host.querySelector('textarea, input, [contenteditable]')).toBeNull();
    const band = host.querySelector('[data-write-restriction]');
    expect(band?.getAttribute('data-write-restriction')).toBe('end-to-end-encrypted');
    expect(band?.textContent).toBe('Conversation chiffrée de bout en bout : écrivez depuis l’app Meeshy');
  });

  test('modes en clair, server et hybrid : le composeur reste libre (le serveur chiffre lui-même)', async () => {
    for (const mode of [null, 'server', 'hybrid']) {
      const host = await mount(<Probe conversation={conversation(`c-${String(mode)}`, { type: 'direct', encryptionMode: mode })} />);
      expect(host.querySelector('[data-probe-field]')).not.toBeNull();
    }
  });
});

describe('une conversation vue chiffrée de bout en bout ne repasse jamais en clair (#12949)', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 25, 12, minute));
  const enabledNotice = (id: string): Message =>
    ({
      id: `a-${id}`,
      conversationId: id,
      messageType: 'system',
      messageSource: 'system',
      content: '🔒 End-to-end encryption enabled.',
      isEncrypted: false,
      createdAt: at(1),
      metadata: { kind: 'encryption-enabled', mode: 'e2ee', epoch: 1 },
    }) as unknown as Message;
  const sealedMessage = (id: string, minute = 2): Message =>
    ({ id: `e-${id}-${minute}`, conversationId: id, messageType: 'text', messageSource: 'user', content: '', isEncrypted: true, encryptionMode: 'e2ee', createdAt: at(minute) }) as unknown as Message;
  const disabledNotice = (id: string): Message =>
    ({
      id: `n-${id}`,
      conversationId: id,
      messageType: 'system',
      messageSource: 'system',
      content: '🔓 Ana a désactivé le chiffrement de bout en bout.',
      isEncrypted: false,
      createdAt: at(5),
      metadata: { kind: 'encryption-disabled', previousMode: 'e2ee', epoch: 2 },
    }) as unknown as Message;
  const band = (host: Element) => host.querySelector('[data-write-restriction]')?.getAttribute('data-write-restriction');

  test('vue e2ee, puis resservie sans mode par le serveur : aucun champ, le bandeau du bout en bout reste', async () => {
    const id = 'c-downgraded';
    await mount(<Probe conversation={conversation(id, { type: 'direct', encryptionMode: 'e2ee' })} />);
    unmountAll();

    const host = await mount(<Probe conversation={conversation(id, { type: 'direct', encryptionMode: null })} />);

    expect(host.querySelector('textarea, input, [contenteditable]')).toBeNull();
    expect(band(host)).toBe('end-to-end-encrypted');
  });

  test('le fil montre l’avis d’activation, le serveur sert le clair : fermé, et l’envoi unique l’apprend aussi', async () => {
    const id = 'c-thread-shows';
    const host = await mount(<Probe conversation={conversation(id, { type: 'direct', encryptionMode: null })} messages={[enabledNotice(id), sealedMessage(id)]} />);
    expect(host.querySelector('[data-probe-field]')).toBeNull();
    expect(canSendPlaintext({ conversationId: id })).toBe(false);
  });

  test('un avis de désactivation affiché en dernier ne rouvre RIEN', async () => {
    const id = 'c-notice-last';
    const host = await mount(<Probe conversation={conversation(id, { type: 'direct', encryptionMode: null })} messages={[enabledNotice(id), sealedMessage(id), disabledNotice(id)]} />);
    expect(host.querySelector('[data-probe-field]')).toBeNull();
    expect(band(host)).toBe('end-to-end-encrypted');
  });

  test('aucun bouton ne propose d’écrire sans chiffrement', async () => {
    const id = 'c-no-gesture';
    endToEndRegimeLedger.getState().learnEndToEnd(id);
    const host = await mount(<Probe conversation={conversation(id, { type: 'direct', encryptionMode: null })} />);
    expect(host.querySelector('button')).toBeNull();
  });

  test('un message chiffré de bout en bout affiché, sans régime servi : fermé, et le compte la retient (#12986, option 2)', async () => {
    const id = 'c-marked';
    const host = await mount(<Probe conversation={conversation(id, { type: 'direct', encryptionMode: null })} messages={[sealedMessage(id)]} />);
    expect(host.querySelector('textarea, input, [contenteditable]')).toBeNull();
    expect(band(host)).toBe('end-to-end-encrypted');
    expect(canSendPlaintext({ conversationId: id })).toBe(false);
    unmountAll();

    const again = await mount(<Probe conversation={conversation(id, { type: 'direct', encryptionMode: null })} messages={[]} />);
    expect(again.querySelector('[data-probe-field]')).toBeNull();
  });

  test('une conversation jamais vue chiffrée : le composeur est là', async () => {
    const host = await mount(<Probe conversation={conversation('c-never', { type: 'direct', encryptionMode: null })} messages={[]} />);
    expect(host.querySelector('[data-probe-field]')).not.toBeNull();
  });
});

describe('l’état final d’un tête-à-tête chiffré sur le web : lisible, sans boucle ni clair (#12986, #12966)', () => {
  const gesture = (outcome: PlaintextDirectOutcome) => {
    const calls: string[] = [];
    const value: PlaintextDirectGesture = {
      peerName: 'Ana',
      open: async () => {
        calls.push('open');
        return outcome;
      },
    };
    return { calls, value };
  };
  const action = (host: Element) => host.querySelector<HTMLButtonElement>('[data-write-restriction-open-plaintext]');
  const status = (host: Element) => host.querySelector('[data-write-restriction-open-plaintext-status]')?.textContent ?? '';

  test('le bandeau dit d’écrire depuis l’app, et offre d’ouvrir la conversation non chiffrée avec le contact', async () => {
    const id = 'c-direct-sealed';
    const { calls, value } = gesture('opened');
    const host = await mount(<Probe conversation={conversation(id, { type: 'direct', encryptionMode: 'e2ee' })} plaintextDirect={value} />);

    expect(host.querySelector('textarea, input, [contenteditable]')).toBeNull();
    expect(host.querySelector('[data-write-restriction]')?.textContent).toBe('Conversation chiffrée de bout en bout : écrivez depuis l’app Meeshy');
    expect(action(host)?.textContent).toBe('Ouvrir une conversation non chiffrée avec Ana');

    await act(async () => {
      action(host)?.click();
    });
    expect(calls).toEqual(['open']);
  });

  test('l’ouverture échoue ou le réseau manque : le bandeau le dit, rien ne s’ouvre dans ce fil', async () => {
    for (const [outcome, said] of [
      ['failed', 'La conversation non chiffrée n’a pas pu être ouverte. Réessayez.'],
      ['offline', 'Hors connexion : reconnectez-vous pour ouvrir la conversation non chiffrée.'],
    ] as const) {
      const id = `c-direct-${outcome}`;
      const { value } = gesture(outcome);
      const host = await mount(<Probe conversation={conversation(id, { type: 'direct', encryptionMode: 'e2ee' })} plaintextDirect={value} />);
      await act(async () => {
        action(host)?.click();
      });
      expect(status(host)).toBe(said);
      expect(host.querySelector('[data-probe-field]')).toBeNull();
      unmountAll();
    }
  });

  test('un groupe chiffré, ou une restriction d’âge : aucun geste, même fourni', async () => {
    const { value } = gesture('opened');
    const group = await mount(<Probe conversation={conversation('c-group', { type: 'group', encryptionMode: 'e2ee' })} plaintextDirect={value} />);
    expect(action(group)).toBeNull();
    unmountAll();

    const minor = await mount(<Probe conversation={conversation('c-minor', { type: 'direct', viewerWriteRestriction: 'minor-global' })} plaintextDirect={value} />);
    expect(action(minor)).toBeNull();
  });
});
