import type { Virtualizer } from '@tanstack/react-virtual';
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';

import { ConversationReadingModeSchema, type ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { Attachment, Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import { resetEphemeralReception } from '@/lib/view/ephemeral-reception';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadModes } from './thread-modes';

/**
 * TOUCHER UNE IMAGE FLOUTÉE LA RÉVÈLE SUR PLACE, LE TOUCHER SUIVANT L'OUVRE EN
 * PLEIN ÉCRAN — DANS CHAQUE MODE (#8389, directive porteur du 2026-09-27, qui
 * défait le plein écran direct de #8008). `ProtectedContent` ne rend la grille
 * des substituts que si son HÔTE lui passe `media` : une peau qui l'oublierait
 * laisserait l'image voilée sans forme. La garde vit donc au niveau du FIL,
 * mode par mode, et la table croise l'énumération partagée : un mode ajouté
 * demain est mesuré d'office.
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

const photo = {
  id: 'a-flou',
  messageId: 'm-flou',
  fileName: 'plage.jpg',
  originalName: 'plage.jpg',
  fileUrl: 'https://cdn.test/plage.jpg',
  thumbnailUrl: 'https://cdn.test/plage-thumb.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1000,
  width: 800,
  height: 600,
} as unknown as Attachment;

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
  test(`mode ${mode} : toucher l’image floutée la révèle sur place ; le toucher suivant l’ouvre en plein écran`, async () => {
    const host = await monte(mode, [
      messageOf({ id: 'm-flou', content: '', messageType: 'image', isBlurred: true, attachments: [photo] }),
    ]);
    expect(host.querySelector('[data-protected-media]')).not.toBeNull();
    const tile = host.querySelector<HTMLElement>('[data-protected-media] button');
    expect(tile).not.toBeNull();
    await mounter.click(tile);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await mounter.settle();
    expect(document.body.querySelector('[data-media-viewer]')).toBeNull();
    const revealed = host.querySelector<HTMLElement>('[data-protected="revealed"] button[data-media-tile]');
    expect(revealed?.querySelector('img')?.getAttribute('src')).toContain('plage');

    await mounter.click(revealed);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await mounter.settle();
    expect(document.body.querySelector('[data-media-viewer]')).not.toBeNull();
  });
}
