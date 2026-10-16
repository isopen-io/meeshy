import type { Virtualizer } from '@tanstack/react-virtual';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import { time, type PlacedMessage } from '@/lib/grouping';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadModes } from './thread-modes';

/**
 * UNE SEULE LANGUE D'INTERFACE (#10817) — le séparateur de jour, l'heure d'une
 * bulle et tout libellé du chrome suivent la langue d'INTERFACE ; le Prisme ne
 * gouverne que le CONTENU. Interface `en`, prisme `fr` ⇒ « Yesterday », jamais
 * « Hier » à côté de « Transcribe ».
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousLang = '';

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('en');
  previousLang = document.documentElement.lang;
  document.documentElement.lang = 'en';
});

afterAll(async () => {
  document.documentElement.lang = previousLang;
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);

const sender = {
  id: 'p-other',
  conversationId: 'c-lang',
  userId: 'u-other',
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
};

const MESSAGE = {
  id: 'm-hier',
  recipientCount: 1,
  conversationId: 'c-lang',
  senderId: 'u-other',
  content: 'Bonjour',
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
  createdAt: YESTERDAY,
  updatedAt: YESTERDAY,
  timestamp: YESTERDAY,
  translations: [],
  sender,
} as unknown as Message;

const PLACED: readonly PlacedMessage[] = [{ message: MESSAGE, head: true, tail: true, opensDay: 'x' }];

const virtualizer = {
  getTotalSize: () => 88,
  getVirtualItems: () => [{ index: 0, start: 0, end: 88, size: 88, key: 0, lane: 0 }],
  measureElement: () => {},
} as unknown as Virtualizer<HTMLElement, Element>;

const VIEWER = { id: 'u-viewer', username: 'viewer', displayName: 'Vous' } as unknown as Viewer;
const SCENE = { elected: null, noteProgrammaticScroll: () => {} } as unknown as ThreadScene;

describe('le fil parle la langue d’interface, le Prisme ne gouverne que le contenu (#10817)', () => {
  test('interface en, prisme fr ⇒ le séparateur de jour dit « Yesterday »', async () => {
    const host = await mounter.mount(
      <ThreadModes
        mode="bubbles"
        viewer={VIEWER}
        placed={PLACED}
        virtualizer={virtualizer}
        scene={SCENE}
        readerLanguages={['fr']}
        group={false}
        highlightedId={null}
        expiredIds={new Set()}
        jumpToMessage={() => {}}
        typists={[]}
        unreadSeparatorMessageId={null}
        unreadCount={0}
        selection={null}
        onRowTap={() => {}}
      />,
    );
    const separator = host.querySelector('[data-day-separator]')?.textContent ?? '';
    expect(separator).toBe('Yesterday');
  });

  test('l’heure d’une bulle suit la langue d’interface, pas un « fr-FR » figé', () => {
    const at = '2026-09-21T15:05:00.000Z';
    expect(time(at)).toBe(new Date(at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }));
  });
});
