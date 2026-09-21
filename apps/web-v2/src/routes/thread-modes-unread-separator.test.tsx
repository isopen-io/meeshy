import type { Virtualizer } from '@tanstack/react-virtual';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { ThreadModes } from './thread-modes';

/**
 * **LE SÉPARATEUR « — N MESSAGES NON LUS — » EN FLUX** (#7202, W3, D-L3) —
 * même patron de mesure que `thread-modes-reveal-label.test.tsx` : monté sur
 * le CHEMIN PRODUIT (`ThreadModes`), pas sur une fonction pure isolée, pour
 * que le témoin attrape un séparateur JAMAIS câblé aussi bien qu'un séparateur
 * mal placé.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const senderOf = (userId: string) => ({
  id: `p-${userId}`,
  conversationId: 'c-unread',
  userId,
  displayName: 'Amina',
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
    conversationId: 'c-unread',
    senderId: 'u-amina',
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
    sender: senderOf('u-amina'),
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

const MESSAGES = [messageOf('m-1', 1), messageOf('m-2', 2), messageOf('m-3', 3)];
const PLACED = MESSAGES.map(placeOf);

const monte = async (mode: ConversationReadingMode, unreadSeparatorMessageId: string | null) =>
  mounter.mount(
    <ThreadModes
      mode={mode}
      viewer={VIEWER}
      readerLocale="fr"
      placed={PLACED}
      virtualizer={virtualizerOf(PLACED.length)}
      scene={SCENE}
      readerLanguages={['fr']}
      group={false}
      highlightedId={null}
      expiredIds={new Set()}
      jumpToMessage={() => {}}
      typists={[]}
      unreadSeparatorMessageId={unreadSeparatorMessageId}
      unreadCount={unreadSeparatorMessageId === null ? 0 : 2}
    />,
  );

describe('le séparateur de non-lus, monté sur le chemin produit', () => {
  test('absent quand aucun message n’ouvre la frontière (tout lu)', async () => {
    const host = await monte('bubbles', null);
    expect(host.querySelector('[data-unread-separator]')).toBe(null);
  });

  test('se pose juste AVANT la rangée qui ouvre la frontière, jamais ailleurs', async () => {
    const host = await monte('bubbles', 'm-2');
    const rows = [...host.querySelectorAll('[data-row], [data-unread-separator]')];
    const separatorIndex = rows.findIndex((node) => node.hasAttribute('data-unread-separator'));
    const rowIndex = rows.findIndex((node) => node.getAttribute('data-row') === 'm-2');
    expect(separatorIndex).toBeGreaterThanOrEqual(0);
    expect(separatorIndex).toBe(rowIndex - 1);
  });

  test('porte le compte, au pluriel, dans la langue de l’interface', async () => {
    const host = await monte('bubbles', 'm-2');
    expect(host.querySelector('[data-unread-separator]')?.textContent).toContain('2 messages non lus');
  });

  test('la couleur est le jeton PRIMAIRE, jamais l’accent de la conversation (D-L3)', async () => {
    const host = await monte('bubbles', 'm-2');
    const pill = host.querySelector<HTMLElement>('[data-unread-separator] span');
    expect(pill?.style.backgroundColor).toBe('var(--color-ios-brand)');
  });

  test('même comportement sur la peau Focal', async () => {
    const host = await monte('focal', 'm-2');
    expect(host.querySelector('[data-unread-separator]')).not.toBe(null);
  });
});
