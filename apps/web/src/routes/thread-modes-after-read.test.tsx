import type { Virtualizer } from '@tanstack/react-virtual';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ConversationReadingModeSchema, type ConversationReadingMode } from '@meeshy/shared/types/reading-modes';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import { resetEphemeralReception } from '@/lib/view/ephemeral-reception';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadModes } from './thread-modes';

/**
 * LA FLAMME-ŒIL DANS LE FIL (#8304, précision porteur 2026-09-27) — « ni
 * décompte ni indicateur (pas de pastille, pas de chrono). À la place : une
 * grande flamme en FILIGRANE derrière le message, posée à GAUCHE derrière
 * l'avatar, qui s'étend jusqu'à la première lettre du message — ou jusqu'à
 * l'angle de la pièce jointe. Discrète, jamais par-dessus le texte. »
 *
 * Même garde du « plus tard » que `thread-modes-protection-chrome.test.tsx` :
 * chaque mode qui rend des rangées est mesuré, et la table croise
 * l'énumération partagée à l'exécution.
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
afterEach(() => {
  mounter.unmountAll();
  resetEphemeralReception();
});

const senderOf = (displayName: string, userId: string) => ({
  id: `p-${userId}`,
  conversationId: 'c-chrome',
  userId,
  displayName,
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

const messageOf = (partial: Partial<Message>): Message =>
  ({
    id: 'm-chrome',
    conversationId: 'c-chrome',
    senderId: 'u-bruno',
    content: 'Rendez-vous à 18 h devant la gare.',
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
    createdAt: new Date('2026-09-22T09:02:00.000Z'),
    updatedAt: new Date('2026-09-22T09:02:00.000Z'),
    timestamp: new Date('2026-09-22T09:02:00.000Z'),
    translations: [],
    sender: senderOf('Bruno Bêta', 'u-bruno'),
    ...partial,
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

const monte = async (mode: ConversationReadingMode, messages: readonly Message[]) =>
  mounter.mount(
    <ThreadModes
      mode={mode}
      viewer={VIEWER}
      readerLocale="fr"
      placed={messages.map(placeOf)}
      virtualizer={virtualizerOf(messages.length)}
      scene={SCENE}
      readerLanguages={['fr']}
      group={false}
      highlightedId={null}
      expiredIds={new Set()}
      jumpToMessage={() => {}}
      typists={[]}
    />,
  );

const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;

const MODE_CONTRACT = {
  focal: { rendersRows: true },
  script: { rendersRows: true },
  bubbles: { rendersRows: true },
  river: { rendersRows: true },
  summary: { rendersRows: false },
} as const satisfies Record<ConversationReadingMode, { readonly rendersRows: boolean }>;

test('la table des modes couvre TOUTE l’énumération partagée', () => {
  for (const mode of ConversationReadingModeSchema.options) {
    expect(Object.keys(MODE_CONTRACT)).toContain(mode);
  }
});

for (const mode of ConversationReadingModeSchema.options.filter((m) => MODE_CONTRACT[m].rendersRows)) {
  describe(`mode ${mode}`, () => {
    test('une flamme-œil REÇUE : aucune pastille, aucun chiffre — un filigrane derrière, à gauche', async () => {
      const host = await monte(mode, [messageOf({ id: 'm-flamme', effectFlags: AFTER_READ })]);
      expect(host.querySelector('[data-ephemeral]')).toBeNull();
      const watermark = host.querySelector<HTMLElement>('[data-after-read-watermark]');
      expect(watermark).not.toBeNull();
      expect(watermark?.getAttribute('aria-hidden')).toBe('true');
      expect(watermark?.style.zIndex).toBe('-1');
      expect(watermark?.style.pointerEvents).toBe('none');
      expect(watermark?.querySelector('svg')).not.toBeNull();
    });

    test('chez l’EXPÉDITEUR non plus, ni « en attente » ni décompte', async () => {
      const host = await monte(mode, [
        messageOf({ id: 'm-flamme', effectFlags: AFTER_READ, senderId: 'u-viewer', sender: senderOf('Vous', 'u-viewer') }),
      ]);
      expect(host.querySelector('[data-ephemeral]')).toBeNull();
      expect(host.querySelector('[data-after-read-watermark]')).not.toBeNull();
    });

    test('la sonde de lecture (#8343) : sur une flamme-œil REÇUE, jamais sur la sienne', async () => {
      const recue = await monte(mode, [messageOf({ id: 'm-flamme', effectFlags: AFTER_READ })]);
      expect(recue.querySelector('[data-after-read-probe]')).not.toBeNull();
      const mienne = await monte(mode, [
        messageOf({ id: 'm-flamme', effectFlags: AFTER_READ, senderId: 'u-viewer', sender: senderOf('Vous', 'u-viewer') }),
      ]);
      expect(mienne.querySelector('[data-after-read-probe]')).toBeNull();
    });

    test('un message ordinaire ne porte aucun filigrane', async () => {
      const host = await monte(mode, [messageOf({ id: 'm-ordinaire' })]);
      expect(host.querySelector('[data-after-read-watermark]')).toBeNull();
    });
  });
}

test('le filigrane s’arrête à la PREMIÈRE LETTRE : colonne du nom en rangée plate, marge intérieure en bulle', async () => {
  const flat = await monte('focal', [messageOf({ id: 'm-flamme', effectFlags: AFTER_READ })]);
  const bubble = await monte('bubbles', [messageOf({ id: 'm-flamme', effectFlags: AFTER_READ })]);
  const flatWidth = Number.parseFloat(flat.querySelector<HTMLElement>('[data-after-read-watermark]')?.style.width ?? '');
  const bubbleWidth = Number.parseFloat(bubble.querySelector<HTMLElement>('[data-after-read-watermark]')?.style.width ?? '');
  expect(flatWidth).toBe(14 + 16 + 41);
  expect(bubbleWidth).toBe(14 + 14);
});
