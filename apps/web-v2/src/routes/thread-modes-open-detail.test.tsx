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
 * **LA COCHE OUVRE LA FICHE, SUR LE CHEMIN PRODUIT** (#7352, V4) — le témoin de
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
}) =>
  mounter.mount(
    <ThreadModes
      mode="bubbles"
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
      onRowTap={options.onRowTap}
      onOpenDetail={options.onOpenDetail}
    />,
  );

const DETAIL_BUTTON = 'button[aria-label="Voir les détails du message"]';

describe('la coche ouvre la fiche, montée sur ThreadModes', () => {
  test('hors sélection : taper la coche ouvre la fiche de CE message, et rien d’autre', async () => {
    const opened: string[] = [];
    const tapped: string[] = [];
    const host = await monte({ onOpenDetail: (id) => opened.push(id), onRowTap: (id) => tapped.push(id), selection: null });
    host.querySelector<HTMLButtonElement>(DETAIL_BUTTON)?.click();
    expect(opened).toEqual(['m-1']);
    expect(tapped).toEqual([]);
  });

  test('en sélection : taper l’accusé BASCULE la sélection une fois et n’ouvre aucune fiche', async () => {
    const opened: string[] = [];
    const tapped: string[] = [];
    const host = await monte({
      onOpenDetail: (id) => opened.push(id),
      onRowTap: (id) => tapped.push(id),
      selection: { ids: [] },
    });
    expect(host.querySelector(DETAIL_BUTTON)).toBe(null);
    host.querySelector<HTMLElement>('[data-row="m-1"] svg')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(opened).toEqual([]);
    expect(tapped).toEqual(['m-1']);
  });
});
