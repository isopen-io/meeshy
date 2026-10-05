import type { Virtualizer } from '@tanstack/react-virtual';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import type { SelectionState } from '@/lib/view/selection';
import type { SwipeOutcome } from '@/lib/view/swipe';
import { act } from 'react';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { ThreadModes } from './thread-modes';

/**
 * **LE GLISSÉ ET L'ICÔNE « RÉPONDRE », SUR LE CHEMIN PRODUIT** (#7559, #8899)
 * — montés dans `ThreadModes`, sur le nœud qui enveloppe les DEUX peaux : la
 * bulle ET la rangée plate glissent, et la sélection les neutralise.
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
  conversationId: 'c-swipe',
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
    conversationId: 'c-swipe',
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

const OTHER = { ...messageOf('m-1', 1), senderId: 'u-other', sender: senderOf('u-other') } as Message;
const PLACED = [placeOf(OTHER)];

const monte = async (options: {
  readonly mode: 'bubbles' | 'focal';
  readonly selection: SelectionState | null;
  readonly journal: string[];
}) =>
  mounter.mount(
    <ThreadModes
      mode={options.mode}
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
      unreadSeparatorMessageId={null}
      unreadCount={0}
      selection={options.selection}
      onRowTap={(id) => options.journal.push(`tap:${id}`)}
      swipeActionsOf={() => (options.selection === null ? { canReply: true, canForward: true } : undefined)}
      onSwipeAction={(id: string, outcome: SwipeOutcome) => options.journal.push(`${outcome}:${id}`)}
    />,
  );

const pointer = (type: string, x: number) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 100, pointerId: 3, pointerType: 'touch', isPrimary: true });

async function glisser(surface: Element, xs: readonly number[]): Promise<void> {
  const [first, ...rest] = xs;
  if (first === undefined) return;
  await act(async () => surface.dispatchEvent(pointer('pointerdown', first)));
  for (const x of rest) await act(async () => surface.dispatchEvent(pointer('pointermove', x)));
  await act(async () => surface.dispatchEvent(pointer('pointerup', rest[rest.length - 1] ?? first)));
}

const REPLY = 'button[data-message-swipe-reply]';

describe('le glissé d’un message, monté sur ThreadModes (#7559)', () => {
  for (const mode of ['bubbles', 'focal'] as const) {
    test(`${mode} : glisser → répond, glisser ← transfère`, async () => {
      const journal: string[] = [];
      const host = await monte({ mode, selection: null, journal });
      const surface = host.querySelector('[data-row="m-1"] [data-message-swipe-content]') as HTMLElement;
      await glisser(surface, [100, 140, 180]);
      await glisser(surface, [200, 160, 120]);
      expect(journal).toEqual(['reply:m-1', 'forward:m-1']);
    });
  }

  test('en SÉLECTION, le glissé ne fait rien et l’icône disparaît ; un tap bascule la coche', async () => {
    const journal: string[] = [];
    const host = await monte({ mode: 'bubbles', selection: { ids: [] }, journal });
    const surface = host.querySelector('[data-row="m-1"] [data-message-swipe-content]') as HTMLElement;
    await glisser(surface, [100, 140, 180]);
    expect(journal.filter((entry) => !entry.startsWith('tap:'))).toEqual([]);
    expect(host.querySelector(REPLY)).toBeNull();
  });
});

describe('l’icône « Répondre », montée sur ThreadModes (#8899)', () => {
  test('hors sélection, elle arme la réponse de CE message sans basculer quoi que ce soit', async () => {
    const journal: string[] = [];
    const host = await monte({ mode: 'bubbles', selection: null, journal });
    const button = host.querySelector<HTMLButtonElement>(`[data-row="m-1"] ${REPLY}`);
    expect(button?.getAttribute('aria-label')).toBe('Répondre');
    await act(async () => button?.click());
    expect(journal).toEqual(['reply:m-1']);
  });
});
