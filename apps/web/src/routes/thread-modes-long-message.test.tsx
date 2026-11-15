import type { Virtualizer } from '@tanstack/react-virtual';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { longMessageExcerpt } from '@meeshy/shared/utils/long-message';
import { FOCAL_METRICS, focalExpandEasingCss } from '@meeshy/shared/utils/focal-metrics';
import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadModes } from './thread-modes';

/**
 * UN MESSAGE LONG SE DÉPLIE SUR PLACE (#8147, #16464) — l'extrait n'en montre
 * qu'un quart, coupé au mot, suivi de « … Lire la suite ». Directive porteur
 * 2026-11-06 : toucher affiche le message ENTIER, rendu comme un message
 * ordinaire du mode courant — ni verre, ni loupe, ni voisins atténués —, et
 * il le reste : aucun « Réduire », plusieurs dépliés ensemble, repliés
 * seulement à la réouverture du fil. Dans TOUS les modes qui rendent des
 * rangées, d'où le passage par `ThreadModes`, le nœud des deux peaux.
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

type Played = {
  readonly target: Element;
  readonly keyframes: readonly Keyframe[];
  readonly options: KeyframeAnimationOptions | number | undefined;
};
let played: Played[] = [];
let reduceMotion = false;
let nativeAnimate: unknown;
let nativeMatchMedia: unknown;

beforeEach(() => {
  played = [];
  reduceMotion = false;
  const proto = (globalThis as unknown as { Element: { prototype: Record<string, unknown> } }).Element.prototype;
  nativeAnimate = proto.animate;
  proto.animate = function animate(this: Element, keyframes: Keyframe[], options?: KeyframeAnimationOptions | number) {
    played.push({ target: this, keyframes, options });
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

    test('toucher « Lire la suite » déplie EN PLACE, comme un message ordinaire : ni verre, ni loupe, ni voisin atténué', async () => {
      const host = await monte(mode);
      await press(toggleOf(host, 'm-long'));

      expect(rowOf(host, 'm-long')?.textContent).toContain('FIN-DU-MESSAGE');
      expect(host.querySelector('[data-unfold-stage], [data-unfold-glass], [data-unfolded]')).toBeNull();
      expect(rowOf(host, 'm-long')?.querySelector<HTMLElement>('[data-long-message]')?.style.transform ?? '').toBe('');
    });

    test('aucun contrôle ne replie : le bouton s’en va, et aucun « Réduire » n’apparaît', async () => {
      const host = await monte(mode);
      await press(toggleOf(host, 'm-long'));

      expect(toggleOf(host, 'm-long')).toBeNull();
      expect(rowOf(host, 'm-long')?.textContent).not.toContain('Réduire');
      expect(rowOf(host, 'm-long')?.textContent).toContain('FIN-DU-MESSAGE');
    });

    test('déplier deux messages : les deux restent dépliés', async () => {
      const host = await monte(mode);
      await press(toggleOf(host, 'm-long'));
      await press(toggleOf(host, 'm-long-2'));

      expect(rowOf(host, 'm-long')?.textContent).toContain('FIN-DU-MESSAGE');
      expect(rowOf(host, 'm-long-2')?.textContent).toContain('QUEUE-DU-SECOND');
    });

    test('le dépliage se joue en opacity, jamais en hauteur (#11314), au tempo partagé avec iOS (#8232) ; sous Réduire le mouvement, rien ne bouge', async () => {
      const host = await monte(mode);
      await press(toggleOf(host, 'm-long'));
      const fades = played.filter((entry) => entry.keyframes.some((frame) => frame.opacity !== undefined));
      expect(fades).toHaveLength(1);
      expect(fades[0]?.options).toEqual({ duration: FOCAL_METRICS.expandDurationMs, easing: focalExpandEasingCss() });
      expect(played.some((entry) => entry.keyframes.some((frame) => frame.height !== undefined))).toBe(false);

      played = [];
      reduceMotion = true;
      await press(toggleOf(host, 'm-long-2'));
      expect(played).toHaveLength(0);
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

test('le haut du message déplié reste en place : la mesure qui suit le dépliage n’est pas compensée par le virtualiseur', async () => {
  const virtualizer = virtualizerOf(THREAD.length);
  const host = await mounter.mount(
    <ThreadModes
      mode="script"
      viewer={VIEWER}
      placed={THREAD.map(placeOf)}
      virtualizer={virtualizer}
      scene={SCENE}
      readerLanguages={['fr']}
      group={false}
      highlightedId={null}
      expiredIds={new Set()}
      jumpToMessage={() => {}}
      typists={[]}
    />,
  );
  const straddling = { key: 'm-long', index: 0, start: 4400, end: 4488, size: 88, lane: 0 };
  const instance = { scrollOffset: 4500, scrollAdjustments: 0 } as unknown as Virtualizer<HTMLElement, Element>;
  const compensates = () => virtualizer.shouldAdjustScrollPositionOnItemSizeChange?.(straddling, 600, instance);
  await press(toggleOf(host, 'm-long'));
  expect(compensates()).toBe(false);
  expect(compensates()).toBe(true);
});

test('rouvrir le fil (une nouvelle instance) rend le message replié', async () => {
  const host = await monte('script');
  await press(toggleOf(host, 'm-long'));
  mounter.unmountAll();
  const again = await monte('script');
  expect(toggleOf(again, 'm-long')?.getAttribute('aria-expanded')).toBe('false');
  expect(host.isConnected).toBe(false);
});
