import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { Conversation } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { LocalMessage } from '@/lib/send/local-message';
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

function Probe({ conversation: served }: { readonly conversation: Conversation }) {
  return (
    <ThreadWriteLock conversationId={served.id} conversation={served}>
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
