import type { Virtualizer } from '@tanstack/react-virtual';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import type { SelectionState } from '@/lib/view/selection';
import { reactionCapsuleTargetId } from '@/lib/view/reaction-capsule';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadModes } from './thread-modes';

/**
 * **LA CAPSULE « + » SE POSE SOUS LE DERNIER MESSAGE REÇU, ET SOUS LUI SEUL**
 * (#10583) — montée sur `ThreadModes`, le chemin produit : la même capsule
 * dans tous les modes de fil, jamais sous un message envoyé, jamais sous un
 * message plus ancien, jamais pendant une sélection ni sans geste de réaction.
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

const senderOf = (userId: string) => ({
  id: `p-${userId}`,
  conversationId: 'c-capsule',
  userId,
  displayName: userId === 'u-viewer' ? 'Vous' : 'Awa',
  type: 'user' as const,
  role: 'member' as const,
  language: 'fr',
  permissions: {
    canSendMessages: true,
    canSendFiles: true,
    canSendImages: true,
    canSendVideos: true,
    canSendAudios: true,
    canSendLocations: true,
    canSendLinks: true,
  },
  isActive: true,
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  isOnline: false,
});

const messageOf = (id: string, minute: number, senderId: string, extra: Partial<Message> = {}): Message =>
  ({
    id,
    recipientCount: 1,
    conversationId: 'c-capsule',
    senderId,
    content: `Message ${id}`,
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    maxViewOnceCount: 1,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 1,
    readCount: 1,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: new Date(`2026-09-21T09:0${minute}:00.000Z`),
    updatedAt: new Date(`2026-09-21T09:0${minute}:00.000Z`),
    timestamp: new Date(`2026-09-21T09:0${minute}:00.000Z`),
    translations: [],
    sender: senderOf(senderId),
    ...extra,
  }) as Message;

const placeOf = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

const virtualizerOf = (count: number): Virtualizer<HTMLElement, Element> =>
  ({
    getTotalSize: () => count * 88,
    getVirtualItems: () =>
      Array.from({ length: count }, (_unused, index) => ({
        index,
        start: index * 88,
        end: (index + 1) * 88,
        size: 88,
        key: index,
        lane: 0,
      })),
    measureElement: () => {},
  }) as unknown as Virtualizer<HTMLElement, Element>;

const VIEWER: Viewer = { id: 'u-viewer', username: 'viewer', displayName: 'Vous' } as unknown as Viewer;
const SCENE: ThreadScene = { elected: null, noteProgrammaticScroll: () => {} } as unknown as ThreadScene;

const RECEIVED_OLD = messageOf('m-1', 1, 'u-awa');
const RECEIVED_LAST = messageOf('m-2', 2, 'u-awa');
const SENT_AFTER = messageOf('m-3', 3, 'u-viewer');

const monte = async (options: {
  readonly messages: readonly Message[];
  readonly mode?: 'bubbles' | 'focal';
  readonly reacts?: boolean;
  /** Le verdict `canReact` du lecteur (#11372) — vrai par défaut. */
  readonly reactable?: boolean;
  readonly selection?: SelectionState | null;
}) => {
  const journal: string[] = [];
  const placed = options.messages.map(placeOf);
  const host = await mounter.mount(
    <ThreadModes
      mode={options.mode ?? 'bubbles'}
      viewer={VIEWER}
      placed={placed}
      virtualizer={virtualizerOf(placed.length)}
      scene={SCENE}
      readerLanguages={['fr']}
      group={false}
      highlightedId={null}
      expiredIds={new Set()}
      jumpToMessage={() => {}}
      typists={[]}
      unreadSeparatorMessageId={null}
      unreadCount={0}
      selection={options.selection ?? null}
      onRowTap={() => {}}
      {...(options.reacts === false
        ? {}
        : {
            onReact: (messageId: string, emoji: string) => journal.push(`react:${messageId}:${emoji}`),
            onExpandReactions: (messageId: string) => journal.push(`expand:${messageId}`),
            reactableOf: () => options.reactable ?? true,
          })}
    />,
  );
  return { host, journal };
};

const CAPSULE = 'button[data-reaction-add]';

describe('la règle : le dernier message reçu', () => {
  test('le dernier message qui n’est pas le mien, même suivi d’un envoi', () => {
    expect(reactionCapsuleTargetId({ messages: [RECEIVED_OLD, RECEIVED_LAST, SENT_AFTER], viewerId: 'u-viewer' })).toBe('m-2');
  });

  test('aucun message reçu ⇒ aucune cible', () => {
    expect(reactionCapsuleTargetId({ messages: [SENT_AFTER], viewerId: 'u-viewer' })).toBeNull();
    expect(reactionCapsuleTargetId({ messages: [], viewerId: 'u-viewer' })).toBeNull();
  });

  test('un message système n’est pas un message reçu', () => {
    const system = messageOf('m-sys', 4, 'u-awa', { messageSource: 'system' } as Partial<Message>);
    expect(reactionCapsuleTargetId({ messages: [RECEIVED_LAST, system], viewerId: 'u-viewer' })).toBe('m-2');
  });
});

describe('la capsule « + », montée sur ThreadModes (#10583)', () => {
  for (const mode of ['bubbles', 'focal'] as const) {
    test(`mode ${mode} : UNE capsule, sous le dernier message reçu`, async () => {
      const { host } = await monte({ messages: [RECEIVED_OLD, RECEIVED_LAST, SENT_AFTER], mode });
      const capsules = [...host.querySelectorAll(CAPSULE)];
      expect(capsules.length).toBe(1);
      expect(capsules[0]?.closest('[data-reaction-add-for]')?.getAttribute('data-reaction-add-for')).toBe('m-2');
    });
  }

  test('la capsule vit HORS de la rangée : un appui long dessus n’ouvre pas le menu du message', async () => {
    const { host } = await monte({ messages: [RECEIVED_LAST] });
    expect(host.querySelector(CAPSULE)?.closest('[data-row]')).toBeNull();
  });

  test('un fil sans message reçu n’a pas de capsule', async () => {
    const { host } = await monte({ messages: [SENT_AFTER] });
    expect(host.querySelector(CAPSULE)).toBeNull();
  });

  test('sans geste de réaction (fil en lecture seule), aucune capsule', async () => {
    const { host } = await monte({ messages: [RECEIVED_LAST], reacts: false });
    expect(host.querySelector(CAPSULE)).toBeNull();
  });

  test('pendant une sélection, la capsule s’efface', async () => {
    const { host } = await monte({ messages: [RECEIVED_LAST], selection: { ids: ['m-2'] } });
    expect(host.querySelector(CAPSULE)).toBeNull();
  });

  test('la barre réagit sur CE message, et « ＋ » ouvre la feuille complète pour lui', async () => {
    const { host, journal } = await monte({ messages: [RECEIVED_OLD, RECEIVED_LAST] });
    const open = async () => {
      await act(async () => {
        host.querySelector<HTMLButtonElement>(CAPSULE)?.click();
      });
    };
    await open();
    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('[data-reaction-quick-bar] button[role="menuitem"]')?.click();
    });
    await open();
    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('[data-reaction-quick-bar] button[data-add-reaction]')?.click();
    });
    expect(journal.length).toBe(2);
    expect(journal[0]?.startsWith('react:m-2:')).toBe(true);
    expect(journal[1]).toBe('expand:m-2');
  });

  test('un lecteur que la loi ne laisse pas réagir (`canReact`) n’a ni capsule ni pastille à basculer (#11372)', async () => {
    const reacted = messageOf('m-2', 2, 'u-awa', { reactionSummary: { '👍': 2 }, reactionCount: 2 } as Partial<Message>);
    for (const mode of ['bubbles', 'focal'] as const) {
      const { host } = await monte({ messages: [reacted], mode, reactable: false });
      expect(host.querySelector(CAPSULE)).toBeNull();
      expect([...host.querySelectorAll('button')].some((button) => button.textContent?.includes('👍'))).toBe(false);
      mounter.unmountAll();
    }
    const { host } = await monte({ messages: [reacted] });
    expect([...host.querySelectorAll('button')].some((button) => button.textContent?.includes('👍'))).toBe(true);
  });
});
