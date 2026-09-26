import type { Virtualizer } from '@tanstack/react-virtual';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { longMessageExcerpt } from '@meeshy/shared/utils/long-message';
import { FOCAL_METRICS } from '@meeshy/shared/utils/focal-metrics';
import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import { collapseUnfolded } from '@/lib/view/unfold-store';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadModes } from './thread-modes';

/**
 * UN MESSAGE LONG SE DÉPLIE SUR PLACE, EN FOCAL (#8147) — directive porteur
 * 2026-09-26 : l'extrait n'en montre qu'un quart, coupé au mot, suivi de
 * « … Lire la suite » ; toucher DÉPLIE dans le fil, « Réduire » replie ; le
 * message déplié reçoit l'effet Focal (bloc de verre, voisins atténués) —
 * dans TOUS les modes qui rendent des rangées, d'où le passage par
 * `ThreadModes`, le nœud qui enveloppe les deux peaux.
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

type Played = { readonly target: Element; readonly keyframes: readonly Keyframe[] };
let played: Played[] = [];
let reduceMotion = false;
let nativeAnimate: unknown;
let nativeMatchMedia: unknown;

beforeEach(() => {
  played = [];
  reduceMotion = false;
  const proto = (globalThis as unknown as { Element: { prototype: Record<string, unknown> } }).Element.prototype;
  nativeAnimate = proto.animate;
  proto.animate = function animate(this: Element, keyframes: Keyframe[]) {
    played.push({ target: this, keyframes });
    return { cancel: () => {}, finished: Promise.resolve(), onfinish: null } as unknown as Animation;
  };
  const win = globalThis as unknown as { matchMedia: unknown };
  nativeMatchMedia = win.matchMedia;
  win.matchMedia = (query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduceMotion : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  });
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  collapseUnfolded();
  (globalThis as unknown as { Element: { prototype: Record<string, unknown> } }).Element.prototype.animate = nativeAnimate;
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = nativeMatchMedia;
});

const LONG_TEXT = `Début du récit ${'une phrase qui continue encore '.repeat(40)}FIN-DU-MESSAGE`;
const SECOND_LONG = `Autre récit ${'des mots et encore des mots '.repeat(40)}QUEUE-DU-SECOND`;

const messageOf = (partial: Partial<Message>): Message =>
  ({
    id: 'm-long',
    conversationId: 'c-long',
    senderId: 'u-bruno',
    content: LONG_TEXT,
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
    createdAt: new Date('2026-09-26T09:02:00.000Z'),
    updatedAt: new Date('2026-09-26T09:02:00.000Z'),
    timestamp: new Date('2026-09-26T09:02:00.000Z'),
    translations: [],
    sender: {
      id: 'p-u-bruno',
      conversationId: 'c-long',
      userId: 'u-bruno',
      displayName: 'Bruno Bêta',
      type: 'user',
      role: 'member',
      language: 'fr',
      isActive: true,
      joinedAt: new Date('2026-01-01T00:00:00.000Z'),
      isOnline: false,
    },
    ...partial,
  }) as Message;

const placeOf = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

const virtualizerOf = (count: number): Virtualizer<HTMLElement, Element> =>
  ({
    getTotalSize: () => count * 88,
    getVirtualItems: () =>
      Array.from({ length: count }, (_unused, index) => ({ index, start: index * 88, end: (index + 1) * 88, size: 88, key: index, lane: 0 })),
    measureElement: () => {},
  }) as unknown as Virtualizer<HTMLElement, Element>;

const VIEWER: Viewer = { id: 'u-viewer', username: 'viewer', displayName: 'Vous' } as unknown as Viewer;
const SCENE: ThreadScene = { elected: null, noteProgrammaticScroll: () => {} } as unknown as ThreadScene;

const THREAD = [
  messageOf({}),
  messageOf({ id: 'm-court', content: 'Un message court.' }),
  messageOf({ id: 'm-long-2', content: SECOND_LONG }),
];

const monte = (mode: ConversationReadingMode, messages: readonly Message[] = THREAD) =>
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

const rowOf = (host: HTMLElement, id: string) => host.querySelector(`[data-row="${id}"]`);
const toggleOf = (host: HTMLElement, id: string) =>
  rowOf(host, id)?.querySelector<HTMLButtonElement>('button[data-long-message-toggle]') ?? null;
const press = (button: HTMLButtonElement | null) =>
  act(() => {
    button?.click();
  });

const ROW_MODES = ['focal', 'script', 'bubbles', 'river'] as const satisfies readonly ConversationReadingMode[];

for (const mode of ROW_MODES) {
  describe(`mode ${mode}`, () => {
    test('un message long ne montre que son extrait, suivi de « … » et de « Lire la suite »', async () => {
      const host = await monte(mode);
      const text = rowOf(host, 'm-long')?.textContent ?? '';
      const { excerpt } = longMessageExcerpt(LONG_TEXT);

      expect(text).toContain(`${excerpt}…`);
      expect(text).not.toContain('FIN-DU-MESSAGE');
      const toggle = toggleOf(host, 'm-long');
      expect(toggle?.textContent).toBe('Lire la suite');
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    });

    test('un message court n’a ni extrait ni bouton', async () => {
      const host = await monte(mode);
      expect(rowOf(host, 'm-court')?.textContent).toContain('Un message court.');
      expect(toggleOf(host, 'm-court')).toBeNull();
    });

    test('toucher « Lire la suite » déplie EN PLACE, sous un bloc de verre, voisins atténués', async () => {
      const host = await monte(mode);
      await press(toggleOf(host, 'm-long'));

      expect(rowOf(host, 'm-long')?.textContent).toContain('FIN-DU-MESSAGE');
      const toggle = toggleOf(host, 'm-long');
      expect(toggle?.textContent).toBe('Réduire');
      expect(toggle?.getAttribute('aria-expanded')).toBe('true');

      const stage = rowOf(host, 'm-long')?.querySelector('[data-unfold-stage]');
      expect(stage?.hasAttribute('data-unfolded')).toBe(true);
      const glass = stage?.querySelector('[data-unfold-glass]');
      expect(glass?.classList.contains('glass')).toBe(true);
      expect(glass?.classList.contains('glass-card')).toBe(true);
      expect(glass?.getAttribute('aria-hidden')).toBe('true');

      expect(host.querySelectorAll('ol [data-unfolded]')).toHaveLength(1);
      expect(rowOf(host, 'm-court')?.querySelector('[data-unfold-stage]')?.hasAttribute('data-unfolded')).toBe(false);
      expect(rowOf(host, 'm-court')?.querySelector('[data-unfold-glass]')).toBeNull();
    });

    test('« Réduire » replie : l’extrait revient, le verre et l’atténuation s’en vont', async () => {
      const host = await monte(mode);
      await press(toggleOf(host, 'm-long'));
      await press(toggleOf(host, 'm-long'));

      expect(rowOf(host, 'm-long')?.textContent).not.toContain('FIN-DU-MESSAGE');
      expect(toggleOf(host, 'm-long')?.getAttribute('aria-expanded')).toBe('false');
      expect(rowOf(host, 'm-long')?.querySelector('[data-unfold-glass]')).toBeNull();
      expect(host.querySelectorAll('ol [data-unfolded]')).toHaveLength(0);
    });

    test('un seul déplié à la fois : déplier le second replie le premier', async () => {
      const host = await monte(mode);
      await press(toggleOf(host, 'm-long'));
      await press(toggleOf(host, 'm-long-2'));

      expect(rowOf(host, 'm-long')?.textContent).not.toContain('FIN-DU-MESSAGE');
      expect(rowOf(host, 'm-long-2')?.textContent).toContain('QUEUE-DU-SECOND');
      expect(host.querySelectorAll('[data-unfold-glass]')).toHaveLength(1);
    });

    test('le dépliage anime la HAUTEUR, au tempo partagé ; sous Réduire le mouvement, rien ne bouge', async () => {
      const host = await monte(mode);
      await press(toggleOf(host, 'm-long'));
      expect(played.some((entry) => entry.keyframes.some((frame) => frame.height !== undefined))).toBe(true);
      expect(played.some((entry) => entry.keyframes.some((frame) => frame.transform !== undefined))).toBe(false);

      played = [];
      reduceMotion = true;
      await press(toggleOf(host, 'm-long'));
      expect(played).toHaveLength(0);
    });

    test('le verre prend la géométrie partagée avec iOS', async () => {
      const host = await monte(mode);
      await press(toggleOf(host, 'm-long'));
      const glass = rowOf(host, 'm-long')?.querySelector<HTMLElement>('[data-unfold-glass]');
      expect(glass?.style.borderRadius).toBe(`${FOCAL_METRICS.glassRadius}px`);
    });
  });
}

test('le texte tronqué est le texte SERVI par le Prisme, jamais l’original', async () => {
  const served = `Récit traduit ${'la suite traduite continue '.repeat(40)}FIN-TRADUITE`;
  const message = messageOf({
    originalLanguage: 'en',
    content: `Original story ${'the original goes on and on '.repeat(40)}END-ORIGINAL`,
    translations: [
      {
        id: 't-long',
        messageId: 'm-long',
        targetLanguage: 'fr',
        translatedContent: served,
        translationModel: 'medium',
        createdAt: new Date('2026-09-26T09:03:00.000Z'),
      },
    ],
  });
  const host = await monte('script', [message]);
  const text = rowOf(host, 'm-long')?.textContent ?? '';
  expect(text).toContain(longMessageExcerpt(served).excerpt);
  await press(toggleOf(host, 'm-long'));
  expect(rowOf(host, 'm-long')?.textContent).toContain('FIN-TRADUITE');
});

test('quitter le fil replie le message déplié', async () => {
  const host = await monte('script');
  await press(toggleOf(host, 'm-long'));
  mounter.unmountAll();
  const again = await monte('script');
  expect(toggleOf(again, 'm-long')?.getAttribute('aria-expanded')).toBe('false');
  expect(host.isConnected).toBe(false);
});
