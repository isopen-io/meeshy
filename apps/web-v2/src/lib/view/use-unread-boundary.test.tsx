import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { conversationDefaults, message, VIEWER_ID } from '@/lib/api/fixtures-base';
import type { Conversation, Message } from '@/lib/api/types';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useUnreadBoundary } from './unread-boundary';

/**
 * **LE SÉPARATEUR NE BOUGE PAS DE LA SESSION, MÊME QUAND W1 MARQUE LU**
 * (#7202, W3, critère de fin) — `nextFrozenUnreadBoundary` porte la loi du
 * gel et a ses propres témoins ; celui-ci mesure la GLUE, `useUnreadBoundary`,
 * là où le défaut se logerait vraiment : une référence mal tenue, un recalcul
 * à chaque rendu, une valeur rendue après le premier gel.
 *
 * Le scénario est celui de W1 (#7201, `markCaughtUp`) : le fil s'ouvre avec
 * deux non-lus, la lecture est accusée, la ligne de cache repart avec
 * `unreadCount: 0` ET une frontière AVANCÉE — et le séparateur doit rester
 * exactement où il était, sur `m2`.
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
afterEach(() => mounter.unmountAll());

const messageOf = (id: string, minute: number): Message =>
  message({
    id,
    conversationId: 'c-non-lus',
    senderId: 'u-amina',
    content: `m-${id}`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date(`2026-09-21T09:0${minute}:00.000Z`),
  });

const MESSAGES: readonly Message[] = [messageOf('m1', 1), messageOf('m2', 2), messageOf('m3', 3)];

const conversationOf = (overrides: Partial<Conversation>): Conversation => ({
  ...conversationDefaults,
  id: 'c-non-lus',
  title: 'Séparateur de non-lus',
  type: 'direct',
  memberCount: 2,
  participants: [],
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-21T09:03:00.000Z'),
  ...overrides,
});

/** À L'OUVERTURE : `m1` est lu, `m2` et `m3` ne le sont pas. */
const A_L_OUVERTURE = conversationOf({
  unreadCount: 2,
  lastReadMessageId: 'm1',
  lastReadAt: new Date('2026-09-21T09:01:00.000Z'),
  lastReadMessageCreatedAt: new Date('2026-09-21T09:01:00.000Z'),
});

/** APRÈS W1 : la passerelle a confirmé la lecture jusqu'à `m3`. */
const APRES_MARQUAGE_LU = conversationOf({
  unreadCount: 0,
  lastReadMessageId: 'm3',
  lastReadAt: new Date('2026-09-21T09:04:00.000Z'),
  lastReadMessageCreatedAt: new Date('2026-09-21T09:03:00.000Z'),
});

function Sonde({ conversation, vus }: { readonly conversation: Conversation; readonly vus: Array<string | null> }) {
  const boundary = useUnreadBoundary({
    conversationId: conversation.id,
    ready: true,
    conversation,
    confirmedMessages: MESSAGES,
    viewerId: VIEWER_ID,
  });
  vus.push(boundary?.firstUnreadId ?? null);
  return <output data-frontiere={boundary?.firstUnreadId ?? ''}>{boundary?.unreadCount ?? 0}</output>;
}

describe('useUnreadBoundary — gelé pour la session', () => {
  test('W1 marque lu pendant la session : le séparateur RESTE sur le même message', async () => {
    const vus: Array<string | null> = [];
    const host = await mounter.mount(<Sonde conversation={A_L_OUVERTURE} vus={vus} />);
    expect(host.querySelector('output')?.getAttribute('data-frontiere')).toBe('m2');
    expect(host.querySelector('output')?.textContent).toBe('2');

    await mounter.rerender(host, <Sonde conversation={APRES_MARQUAGE_LU} vus={vus} />);

    expect(host.querySelector('output')?.getAttribute('data-frontiere')).toBe('m2');
    expect(host.querySelector('output')?.textContent).toBe('2');
    expect(new Set(vus)).toEqual(new Set(['m2']));
  });

  test('un AUTRE fil ouvert dans la même session refige sa propre frontière', async () => {
    const vus: Array<string | null> = [];
    const host = await mounter.mount(<Sonde conversation={A_L_OUVERTURE} vus={vus} />);
    expect(host.querySelector('output')?.getAttribute('data-frontiere')).toBe('m2');

    await mounter.rerender(
      host,
      <Sonde conversation={conversationOf({ id: 'c-autre', unreadCount: 3 })} vus={vus} />,
    );

    /* Aucun signal CHRONOLOGIQUE sur ce second fil, mais `unreadCount: 3`
       EST servi (#7351, V3, profil neuf) : la frontière se recalcule sur ce
       repli — SA PROPRE valeur (m1, le premier des 3 messages), jamais le
       `m2` gelé du premier fil. */
    expect(host.querySelector('output')?.getAttribute('data-frontiere')).toBe('m1');
  });
});
