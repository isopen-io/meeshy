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
 * **SEUL LE DERNIER MESSAGE ARRIVÉ S'ANIME** (#11223, décision porteur
 * 2026-10-24) — monté sur le CHEMIN PRODUIT (`ThreadModes`) : le témoin
 * attrape une règle jamais câblée aussi bien qu'une règle mal appliquée. Un
 * lot chargé d'un coup (premier rendu, pagination, rattrapage) apparaît sans
 * animation ; « Réduire les animations » coupe tout.
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
afterEach(() => {
  mounter.unmountAll();
  Reflect.deleteProperty(window, 'matchMedia');
});

const messageOf = (id: string, createdAt: Date): Message =>
  ({
    id,
    conversationId: 'c-arrival',
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
    createdAt,
    updatedAt: createdAt,
    timestamp: createdAt,
    translations: [],
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

const secondsAgo = (seconds: number): Date => new Date(Date.now() - seconds * 1000);
const OLD = ['m-1', 'm-2', 'm-3'].map((id, i) => messageOf(id, secondsAgo(3600 - i * 60)));

const view = (messages: readonly Message[], mode: ConversationReadingMode = 'bubbles') => {
  const placed = messages.map(placeOf);
  return (
    <ThreadModes
      mode={mode}
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
    />
  );
};

const arriving = (host: HTMLElement): readonly string[] =>
  [...host.querySelectorAll('[data-arriving]')].map((node) => node.getAttribute('data-row') ?? '');

const reduceMotion = (): void => {
  const reduced = (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: reduced });
};

describe('l’animation d’arrivée, montée sur le chemin produit', () => {
  test('premier rendu : aucune rangée ne s’anime', async () => {
    const host = await mounter.mount(view(OLD));
    expect(arriving(host)).toEqual([]);
  });

  test('un message en temps réel : lui seul s’anime', async () => {
    const host = await mounter.mount(view(OLD));
    await mounter.rerender(host, view([...OLD, messageOf('m-4', secondsAgo(1))]));
    expect(arriving(host)).toEqual(['m-4']);
  });

  test('cinq d’un coup : seul le DERNIER s’anime', async () => {
    const host = await mounter.mount(view(OLD));
    const burst = ['m-4', 'm-5', 'm-6', 'm-7', 'm-8'].map((id) => messageOf(id, secondsAgo(2)));
    await mounter.rerender(host, view([...OLD, ...burst]));
    expect(arriving(host)).toEqual(['m-8']);
  });

  test('une page plus ancienne (pagination) : aucune rangée ne s’anime', async () => {
    const host = await mounter.mount(view(OLD));
    const older = ['m-0a', 'm-0b'].map((id, i) => messageOf(id, secondsAgo(9000 - i)));
    await mounter.rerender(host, view([...older, ...OLD]));
    expect(arriving(host)).toEqual([]);
  });

  test('un rattrapage de reconnexion (messages anciens) : aucune rangée ne s’anime', async () => {
    const host = await mounter.mount(view(OLD));
    const missed = ['m-4', 'm-5'].map((id, i) => messageOf(id, secondsAgo(600 - i)));
    await mounter.rerender(host, view([...OLD, ...missed]));
    expect(arriving(host)).toEqual([]);
  });

  test('« Réduire les animations » : aucune rangée ne s’anime', async () => {
    reduceMotion();
    const host = await mounter.mount(view(OLD));
    await mounter.rerender(host, view([...OLD, messageOf('m-4', secondsAgo(1))]));
    expect(arriving(host)).toEqual([]);
  });

  test('l’arrivée survit à un rendu sans nouveauté (une traduction qui atterrit) — l’animation n’est pas coupée', async () => {
    const host = await mounter.mount(view(OLD));
    const fresh = messageOf('m-4', secondsAgo(1));
    await mounter.rerender(host, view([...OLD, fresh]));
    await mounter.rerender(host, view([...OLD, { ...fresh, translations: [] }]));
    expect(arriving(host)).toEqual(['m-4']);
  });

  test('même règle sur la rangée plate (Focal)', async () => {
    const host = await mounter.mount(view(OLD, 'focal'));
    await mounter.rerender(host, view([...OLD, messageOf('m-4', secondsAgo(1))], 'focal'));
    expect(arriving(host)).toEqual(['m-4']);
  });
});

describe('mon envoi confirmé ne rejoue pas son arrivée', () => {
  test('l’optimiste s’anime, sa confirmation (nouvel id, même clientMessageId) ne s’anime pas une seconde fois', async () => {
    const host = await mounter.mount(view(OLD));
    const sentAt = secondsAgo(1);
    const optimistic = { ...messageOf('cid-1', sentAt), clientMessageId: 'cid-1' };
    await mounter.rerender(host, view([...OLD, optimistic]));
    expect(arriving(host)).toEqual(['cid-1']);
    const confirmed = { ...messageOf('s-1', sentAt), clientMessageId: 'cid-1' };
    await mounter.rerender(host, view([...OLD, confirmed]));
    expect(arriving(host)).toEqual([]);
  });
});
