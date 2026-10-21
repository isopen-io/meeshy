import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { apiDeps } from '@/lib/api/deps';
import type { HttpTransport } from '@/lib/api/http';
import { sessionStore, type GuestIdentity } from '@/lib/api/session';
import { mentionSourceStore, usePublishMentionSource } from '@/lib/view/mention-source';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { RichText } from './rich-text';

/**
 * CE QUE LA PASSERELLE REFUSE À UN INVITÉ, LE CLIENT NE LE DEMANDE PAS
 * (#10205, lot serveur : 403 `ACCOUNT_REQUIRED` sur les membres d'une
 * conversation, les accusés par personne et les profils). Une @mention ne mène
 * à aucun profil, et l'autocomplétion des mentions ne part pas sur le réseau :
 * l'invité mentionne les auteurs qu'il lit déjà.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const GUEST: GuestIdentity = { participantId: 'p-awa', nickname: 'Awa', conversationId: 'c-world', link: 'mshy_world', mayWrite: true };

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
  mounter.unmountAll();
  sessionStore.setState({ session: { status: 'anonymous' } });
  mentionSourceStore.setState({ source: null });
});

const asGuest = () => sessionStore.setState({ session: { status: 'guest', sessionToken: 'anon', guest: GUEST, expiresAt: Number.MAX_SAFE_INTEGER } });

describe('une @mention lue par un invité', () => {
  test('reste du texte : aucun lien de profil', async () => {
    asGuest();
    const host = await mounter.mount(<RichText text="Merci @alice !" mentions={['alice']} />);
    expect(host.querySelector('a[href="/u/alice"]')).toBeNull();
    expect(host.textContent).toContain('@alice');
  });

  test('un lecteur qui n’est pas invité garde le lien', async () => {
    const host = await mounter.mount(<RichText text="Merci @alice !" mentions={['alice']} />);
    expect(host.querySelector('a[href="/u/alice"]')).not.toBeNull();
  });
});

function Publisher() {
  usePublishMentionSource({ conversationId: 'c-world', messages: [] });
  return null;
}

/* Le transport de l'application, remplacé le temps d'un témoin : en source
   `fixtures`, la recherche rendrait [] sans réseau et le témoin ne pourrait pas
   tomber. */
async function searchWith(guest: boolean): Promise<{ readonly found: readonly unknown[] | undefined; readonly calls: number }> {
  if (guest) asGuest();
  const deps = apiDeps as unknown as { source: string; transport: HttpTransport };
  const saved = { source: deps.source, transport: deps.transport };
  let calls = 0;
  const fake = (async () => ({ ok: true, data: [] })) as unknown as HttpTransport;
  fake.request = (async () => {
    calls += 1;
    return { ok: true, status: 200, data: [{ id: 'u-alice', username: 'alice', displayName: 'Alice', badge: 'member' }] };
  }) as unknown as HttpTransport['request'];
  deps.source = 'gateway';
  deps.transport = fake;
  try {
    await mounter.mount(<Publisher />);
    const found = await mentionSourceStore.getState().source?.search('al', new AbortController().signal);
    return { found, calls };
  } finally {
    deps.source = saved.source;
    deps.transport = saved.transport;
  }
}

describe('l’autocomplétion des mentions d’un invité', () => {
  test('ne demande pas les membres au réseau', async () => {
    const { found, calls } = await searchWith(true);
    expect(calls).toBe(0);
    expect(found).toEqual([]);
  });

  test('un compte, lui, les demande', async () => {
    const { calls } = await searchWith(false);
    expect(calls).toBe(1);
  });
});
