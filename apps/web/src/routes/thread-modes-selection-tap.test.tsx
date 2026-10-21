import type { Virtualizer } from '@tanstack/react-virtual';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import type { SelectionState } from '@/lib/view/selection';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { ThreadModes } from './thread-modes';

/**
 * **EN SÉLECTION, UN TAP FAIT UN SEUL EFFET : LA BASCULE** — le témoin de
 * `bubble-open-detail.test.tsx` monte `Bubble` seul ; celui-ci monte
 * `ThreadModes`, là où la rangée porte AUSSI le clic de sélection. En
 * SÉLECTION, un tap sur la rangée bascule la coche de sélection : taper
 * l'accusé ne doit ni ouvrir la fiche ni basculer deux choses d'un seul geste.
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
  conversationId: 'c-open-detail',
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
    conversationId: 'c-open-detail',
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
  readonly onOpenDetail: (messageId: string) => void;
  readonly onRowTap: (messageId: string) => void;
  readonly selection: SelectionState | null;
  readonly mode?: 'bubbles' | 'focal';
  readonly scene?: ThreadScene;
}) =>
  mounter.mount(
    <ThreadModes
      mode={options.mode ?? 'bubbles'}
      viewer={VIEWER}
      placed={PLACED}
      virtualizer={virtualizerOf(PLACED.length)}
      scene={options.scene ?? SCENE}
      readerLanguages={['fr']}
      group={false}
      highlightedId={null}
      expiredIds={new Set()}
      jumpToMessage={() => {}}
      typists={[]}
      unreadSeparatorMessageId={null}
      unreadCount={0}
      selection={options.selection}
      onRowTap={options.onRowTap}
      onOpenDetail={options.onOpenDetail}
    />,
  );


const rowOf = (host: HTMLElement): HTMLElement => host.querySelector<HTMLElement>('[data-row="m-1"]')!;

const injected = (host: HTMLElement, tag: 'a' | 'button'): HTMLElement => {
  const el = document.createElement(tag);
  if (el instanceof HTMLAnchorElement) el.href = '/u/someone';
  el.setAttribute('data-test-inner', '');
  rowOf(host).appendChild(el);
  return el;
};

describe('en sélection, avatar, nom, citation et liens ne naviguent pas', () => {
  test('un lien dans la rangée ne reçoit pas le clic : bascule unique, navigation annulée', async () => {
    const tapped: string[] = [];
    const reached: number[] = [];
    const host = await monte({ onOpenDetail: () => {}, onRowTap: (id) => tapped.push(id), selection: { ids: [] } });
    const link = injected(host, 'a');
    link.addEventListener('click', () => reached.push(1));
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(tapped).toEqual(['m-1']);
    expect(reached).toEqual([]);
    expect(event.defaultPrevented).toBe(true);
  });

  test('un bouton dans la rangée ne s’active pas : bascule unique', async () => {
    const tapped: string[] = [];
    const reached: number[] = [];
    const host = await monte({ onOpenDetail: () => {}, onRowTap: (id) => tapped.push(id), selection: { ids: [] } });
    const button = injected(host, 'button');
    button.addEventListener('click', () => reached.push(1));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(tapped).toEqual(['m-1']);
    expect(reached).toEqual([]);
  });

  test('hors sélection, le lien garde son clic et la rangée ne bascule rien', async () => {
    const tapped: string[] = [];
    const reached: number[] = [];
    const host = await monte({ onOpenDetail: () => {}, onRowTap: (id) => tapped.push(id), selection: null });
    const link = injected(host, 'a');
    link.addEventListener('click', () => reached.push(1));
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(reached).toEqual([1]);
    expect(tapped).toEqual([]);
  });
});
