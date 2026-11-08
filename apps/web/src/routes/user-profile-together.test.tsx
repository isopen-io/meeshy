import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { TOGETHER_CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/together-event-names';

import { mediaHubQueryKey } from '@/lib/api/conversation-media-hub';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import type { HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { RELATION_LINKS_QUERY_KEY, type RelationLink } from '@/lib/api/relations';
import type { Message } from '@/lib/api/types';
import type { WatchRealtime } from '@/lib/api/watch-realtime';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import type { SocketClient } from '@/lib/net/socket';
import { createTogetherStore } from '@/lib/together/together-live';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProfileTogetherRow, togetherPieces } from './user-profile-together';

/**
 * REGARDER OU ÉCOUTER ENSEMBLE DEPUIS LA FICHE D'UN PROCHE (#17055) — dès Proche, la
 * fiche liste les vidéos et audios de notre conversation directe ; un toucher invite.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadCirclesCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  appQueryClient.clear();
});

const PROCHE = '64b000000000000000000001';
const CONV = '64b0000000000000000000c1';
const noop = () => undefined;

const link = (effectiveLevel: RelationLink['effectiveLevel']): RelationLink => ({
  userId: PROCHE,
  effectiveLevel,
  grantedByMe: effectiveLevel,
  since: null,
  progress: { activeWeeks: 3, needed: 4, missing: [] },
  eligibleFor: null,
});

const piece = (id: string, mimeType: string, overrides: Readonly<Record<string, unknown>> = {}) => ({
  id,
  messageId: `m-${id}`,
  fileName: `${id}.bin`,
  originalName: `${id}-nom`,
  mimeType,
  fileSize: 10,
  fileUrl: `https://media.example/${id}`,
  uploadedBy: PROCHE,
  isAnonymous: false,
  createdAt: '2026-11-08T10:00:00.000Z',
  isViewOnce: false,
  isEncrypted: false,
  ...overrides,
});

const message = (id: string, createdAt: string, attachments: readonly unknown[]) => ({ id, conversationId: CONV, senderId: PROCHE, content: '', createdAt, attachments }) as unknown as Message;

describe('togetherPieces', () => {
  test('ne garde que les vidéos et les audios lisibles, les plus récents d’abord, sans doublon', () => {
    const pieces = togetherPieces([
      message('a', '2026-11-08T09:00:00.000Z', [piece('photo', 'image/jpeg'), piece('vieux', 'video/mp4')]),
      message('b', '2026-11-08T11:00:00.000Z', [piece('vocal', 'audio/mp4'), piece('unique', 'video/mp4', { isViewOnce: true }), piece('chiffre', 'audio/mp4', { isEncrypted: true })]),
      message('c', '2026-11-08T11:00:00.000Z', [piece('vocal', 'audio/mp4')]),
    ]);
    expect(pieces.map((entry) => [entry.attachment.id, entry.media])).toEqual([
      ['vocal', 'audio'],
      ['vieux', 'video'],
    ]);
  });
});

function harness(ack: unknown) {
  const emitted: Array<{ readonly event: string; readonly payload: unknown }> = [];
  const socket: SocketClient = {
    connected: true,
    connect: noop,
    disconnect: noop,
    on: noop,
    off: noop,
    emit: (event, payload) => {
      emitted.push({ event, payload });
    },
    emitWithAck: async (event, payload) => {
      emitted.push({ event, payload });
      return ack;
    },
  };
  const watch: WatchRealtime = (watcher) => watcher(socket);
  const transport = { request: (async () => ({ ok: true, data: appQueryClient.getQueryData(RELATION_LINKS_QUERY_KEY) ?? [] })) as HttpTransport['request'] } as HttpTransport;
  const notices: Array<{ readonly message: string; readonly failed: boolean }> = [];
  const store = createTogetherStore();
  const row = (
    <ProfileTogetherRow
      language="fr"
      person={{ id: PROCHE, username: 'ada', displayName: 'Ada', avatar: null }}
      onNotice={(text, failed) => notices.push({ message: text, failed })}
      deps={{ source: 'gateway', transport }}
      relationDeps={{ source: 'gateway', transport }}
      watch={watch}
      store={store}
    />
  );
  return { row, emitted, notices, store };
}

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const seedDirect = (): void => {
  appQueryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [{ conversations: [{ id: CONV, type: 'direct', participants: [{ userId: PROCHE }], createdAt: '2026-11-01T00:00:00.000Z' }] }],
    pageParams: [undefined],
  });
  const page = (messages: readonly unknown[]) => ({ pages: [{ messages, hasOlder: false, nextCursor: null }], pageParams: [undefined] });
  appQueryClient.setQueryData(mediaHubQueryKey(CONV, 'visual', null), page([message('v', '2026-11-08T10:00:00.000Z', [piece('film', 'video/mp4')])]));
  appQueryClient.setQueryData(mediaHubQueryKey(CONV, 'audio', null), page([]));
};

describe('ProfileTogetherRow', () => {
  test('absent sous Proche : un Ami ne lit rien ensemble', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('FRIEND')]);
    seedDirect();
    const node = await mount(harness({ success: true }).row);
    await settle();
    expect(node.querySelector('[data-together-row]')).toBeNull();
  });

  test('dès Proche : la liste des médias de la conversation, puis un toucher invite', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('CLOSE')]);
    seedDirect();
    const { row, emitted, notices, store } = harness({ success: true, data: { sessionId: '0123456789abcdef0123456789abcdef', expiresAt: '2026-11-08T18:02:00.000Z', media: 'video' } });
    const node = await mount(row);
    await settle();
    await click(node.querySelector<HTMLButtonElement>('[data-together-open]'));
    const film = node.querySelector<HTMLButtonElement>('[data-together-piece="film"]');
    expect(film?.getAttribute('aria-label')).toBe('Inviter Ada à lire film-nom ensemble');
    await click(film);
    await settle();
    expect(emitted[0]).toEqual({ event: TOGETHER_CLIENT_EVENTS.TOGETHER_INVITE, payload: { toUserId: PROCHE, conversationId: CONV, attachmentId: 'film' } });
    expect(notices).toEqual([{ message: 'Invitation envoyée à Ada.', failed: false }]);
    expect(store.getState().outgoing?.toUserId).toBe(PROCHE);
  });

  test('un refus se dit d’une phrase neutre, sans raison', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('BLOOD')]);
    seedDirect();
    const { row, notices } = harness({ success: false, error: 'x', code: 'TOGETHER_NOT_ALLOWED' });
    const node = await mount(row);
    await settle();
    await click(node.querySelector<HTMLButtonElement>('[data-together-open]'));
    await click(node.querySelector<HTMLButtonElement>('[data-together-piece="film"]'));
    await settle();
    expect(notices).toEqual([{ message: 'Ce média ne peut pas se lire ensemble.', failed: true }]);
  });

  test('sans conversation directe connue, une phrase invite à envoyer un média', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('CLOSE')]);
    const node = await mount(harness({ success: true }).row);
    await settle();
    await click(node.querySelector<HTMLButtonElement>('[data-together-open]'));
    expect(node.querySelector('[data-together-empty]')?.textContent).toBe('Envoyez-lui une vidéo ou un audio pour le lire ensemble.');
  });
});
