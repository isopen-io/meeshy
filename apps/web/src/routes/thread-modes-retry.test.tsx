import type { Virtualizer } from '@tanstack/react-virtual';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';

import { ThreadModes } from './thread-modes';

/**
 * **« RÉESSAYER » EN LIGNE LIT LA MÊME LOI QUE LE MENU** (#11372, contre-vérification) —
 * le bouton d'une rangée en échec ne s'offre que si l'hôte dit que le web sait
 * renvoyer CE message ici (`useMessageMenu.retryableOf`) : en bout en bout, le
 * web ne chiffre pas, un nouvel essai partirait en clair. Sans verdict de
 * l'hôte, rien ne s'offre.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const senderOf = (userId: string) => ({
  id: `p-${userId}`,
  conversationId: 'c-retry',
  userId,
  displayName: 'Vous',
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

const messageOf = (id: string, minute: number): Message =>
  ({
    id,
    recipientCount: 1,
    conversationId: 'c-retry',
    senderId: 'u-viewer',
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
    sender: senderOf('u-viewer'),
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

const PLACED = [placeOf(messageOf('m-1', 1))];

const monte = async (options: {
  readonly retry: (messageId: string) => void;
  readonly retryableOf?: (messageId: string) => boolean;
  readonly permanent?: boolean;
  readonly discard?: (messageId: string) => void;
  readonly discardableOf?: (messageId: string) => boolean;
  readonly mode?: 'bubbles' | 'focal';
}) =>
  mounter.mount(
    <ThreadModes
      mode={options.mode ?? 'bubbles'}
      deliveryOf={() => 'failed'}
      permanentOf={() => options.permanent === true}
      retry={options.retry}
      {...(options.retryableOf === undefined ? {} : { retryableOf: options.retryableOf })}
      {...(options.discard === undefined ? {} : { discard: options.discard })}
      {...(options.discardableOf === undefined ? {} : { discardableOf: options.discardableOf })}
      viewer={VIEWER}
      placed={PLACED}
      virtualizer={virtualizerOf(PLACED.length)}
      scene={SCENE}
      readerLanguages={['fr']}
      group={false}
      highlightedId={null}
      expiredIds={new Set()}
      jumpToMessage={() => {}}
      typists={[]}
      unreadSeparatorMessageId={null}
      unreadCount={0}
    />,
  );

const RETRY_BUTTON = '[data-send-failed="retryable"]';

describe('« Réessayer » en ligne, monté sur ThreadModes', () => {
  for (const mode of ['bubbles', 'focal'] as const) {
    test(`${mode} — l’hôte refuse (bout en bout) : aucun bouton, aucun rejeu`, async () => {
      const retried: string[] = [];
      const host = await monte({ mode, retry: (id) => retried.push(id), retryableOf: () => false });
      expect(host.querySelector(RETRY_BUTTON)).toBe(null);
      expect(retried).toEqual([]);
    });

    test(`${mode} — sans verdict de l’hôte, rien ne s’offre`, async () => {
      const host = await monte({ mode, retry: () => {} });
      expect(host.querySelector(RETRY_BUTTON)).toBe(null);
    });

    test(`${mode} — l’hôte admet : le bouton relance CE message`, async () => {
      const retried: string[] = [];
      const host = await monte({ mode, retry: (id) => retried.push(id), retryableOf: (id) => id === 'm-1' });
      host.querySelector<HTMLButtonElement>(RETRY_BUTTON)?.click();
      expect(retried).toEqual(['m-1']);
    });
  }
});

describe('« Abandonner » sur la bande, monté sur ThreadModes (#12632)', () => {
  for (const mode of ['bubbles', 'focal'] as const) {
    test(`${mode} — un refus permanent s’abandonne : le geste retire CE message`, async () => {
      const discarded: string[] = [];
      const host = await monte({ mode, permanent: true, retry: () => {}, discard: (id) => discarded.push(id), discardableOf: (id) => id === 'm-1' });
      expect(host.querySelector(RETRY_BUTTON)).toBe(null);
      host.querySelector<HTMLButtonElement>('[data-send-failed="permanent"] [data-send-discard]')?.click();
      expect(discarded).toEqual(['m-1']);
    });

    test(`${mode} — sans verdict de l’hôte, la bande n’offre pas l’abandon`, async () => {
      const host = await monte({ mode, permanent: true, retry: () => {}, discard: () => {} });
      expect(host.querySelector('[data-send-discard]')).toBe(null);
    });
  }
});
