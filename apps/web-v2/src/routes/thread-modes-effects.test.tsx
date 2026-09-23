import type { Virtualizer } from '@tanstack/react-virtual';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS as F } from '@meeshy/shared/types/message-effect-flags';
import { ConversationReadingModeSchema, type ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadModes } from './thread-modes';

/**
 * LES EFFETS S'EXÉCUTENT, ILS NE SE COMPTENT PLUS (#7596) — décision porteur
 * 2026-09-23 : « inutile de comptabiliser les effets dans les messages, juste
 * les effectuer/exécuter ».
 *
 * Le témoin passe par `ThreadModes`, le nœud qui enveloppe TOUTES les peaux :
 * un mode ajouté demain qui ne monterait pas l'hôte des effets rougirait ici
 * (la table est exhaustive au type, motif `thread-modes-protection-chrome`).
 *
 * happy-dom ne calcule aucune intersection ni aucune animation : un FAUX
 * `IntersectionObserver` pose l'entrée à l'écran à la main, et
 * `Element.prototype.animate` est bouchonné pour ENREGISTRER ce qui est joué.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const observerSlot = globalThis as unknown as { IntersectionObserver: unknown };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

type Played = { readonly target: Element; readonly keyframes: readonly Keyframe[]; cancelled: boolean };
let played: Played[] = [];
let observers: { callback: IntersectionObserverCallback; observed: Element[]; disconnected: boolean }[] = [];
let reduceMotion = false;
let nativeIO: unknown;
let nativeAnimate: unknown;
let nativeMatchMedia: unknown;

class FakeIntersectionObserver {
  private readonly record: { callback: IntersectionObserverCallback; observed: Element[]; disconnected: boolean };
  constructor(callback: IntersectionObserverCallback) {
    this.record = { callback, observed: [], disconnected: false };
    observers.push(this.record);
  }
  observe(el: Element) {
    this.record.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.record.disconnected = true;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const setOnScreen = (visible: boolean) =>
  act(() => {
    for (const record of observers.filter((r) => !r.disconnected)) {
      record.callback(
        record.observed.map(
          (target) => ({ target, isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }) as IntersectionObserverEntry,
        ),
        record as unknown as IntersectionObserver,
      );
    }
  });

beforeEach(() => {
  played = [];
  observers = [];
  reduceMotion = false;
  nativeIO = observerSlot.IntersectionObserver;
  observerSlot.IntersectionObserver = FakeIntersectionObserver;
  const proto = (globalThis as unknown as { Element: { prototype: Record<string, unknown> } }).Element.prototype;
  nativeAnimate = proto.animate;
  proto.animate = function animate(this: Element, keyframes: Keyframe[]) {
    const entry: Played = { target: this, keyframes, cancelled: false };
    played.push(entry);
    return {
      cancel: () => {
        entry.cancelled = true;
      },
      finished: new Promise(() => {}),
      onfinish: null,
    } as unknown as Animation;
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
  observerSlot.IntersectionObserver = nativeIO;
  (globalThis as unknown as { Element: { prototype: Record<string, unknown> } }).Element.prototype.animate = nativeAnimate;
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = nativeMatchMedia;
});

const messageOf = (partial: Partial<Message>): Message =>
  ({
    id: 'm-effet',
    conversationId: 'c-effets',
    senderId: 'u-bruno',
    content: 'Joyeux anniversaire !',
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
    createdAt: new Date('2026-09-23T09:02:00.000Z'),
    updatedAt: new Date('2026-09-23T09:02:00.000Z'),
    timestamp: new Date('2026-09-23T09:02:00.000Z'),
    translations: [],
    sender: {
      id: 'p-u-bruno',
      conversationId: 'c-effets',
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

const monte = (mode: ConversationReadingMode, messages: readonly Message[]) =>
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

const MODE_CONTRACT = {
  focal: { rendersRows: true },
  script: { rendersRows: true },
  bubbles: { rendersRows: true },
  river: { rendersRows: true },
  summary: { rendersRows: false },
} as const satisfies Record<ConversationReadingMode, { readonly rendersRows: boolean }>;

test('la table des modes couvre TOUTE l’énumération partagée', () => {
  for (const mode of ConversationReadingModeSchema.options) expect(Object.keys(MODE_CONTRACT)).toContain(mode);
});

const hasTransform = (entry: Played) => entry.keyframes.some((frame) => frame.transform !== undefined);

for (const mode of ConversationReadingModeSchema.options.filter((m) => MODE_CONTRACT[m].rendersRows)) {
  describe(`mode ${mode}`, () => {
    test('aucun badge ne compte les effets, et le libellé accessible ne les énumère pas', async () => {
      const host = await monte(mode, [messageOf({ effectFlags: F.CONFETTI | F.SHAKE | F.SPARKLE })]);
      expect(host.querySelector('[data-badge="effects"]') === null).toBe(true);
      const label = host.querySelector('[data-row="m-effet"]')?.getAttribute('aria-label') ?? '';
      expect(label).not.toMatch(/effet|confetti|secousse|scintillant/i);
    });

    test('hors écran, rien ne joue ; à l’entrée à l’écran, l’effet S’EXÉCUTE', async () => {
      const host = await monte(mode, [messageOf({ effectFlags: F.SHAKE | F.CONFETTI })]);
      const effects = host.querySelector('[data-effects-host]');
      expect(effects !== null).toBe(true);
      expect(effects?.getAttribute('data-effects-playing') ?? '').toBe('');
      expect(played).toHaveLength(0);

      await setOnScreen(true);

      expect(effects?.getAttribute('data-effects-playing') ?? '').toContain('shake');
      expect(effects?.getAttribute('data-effects-playing') ?? '').toContain('confetti');
      expect(played.some(hasTransform)).toBe(true);
      expect(host.querySelector('[data-effect-particles="confetti"]') !== null).toBe(true);
    });

    test('une particule s’ARRÊTE dès que la bulle sort de l’écran', async () => {
      const host = await monte(mode, [messageOf({ effectFlags: F.SPARKLE | F.PULSE })]);
      await setOnScreen(true);
      expect(host.querySelector('[data-effect-particles="sparkle"]') !== null).toBe(true);
      const pulse = played.find(hasTransform);
      expect(pulse !== undefined).toBe(true);

      await setOnScreen(false);

      expect(host.querySelector('[data-effect-particles]') === null).toBe(true);
      expect(pulse?.cancelled).toBe(true);
      expect(host.querySelector('[data-effects-host]')?.getAttribute('data-effects-playing') ?? '').toBe('');
    });

    test('revenir à l’écran REJOUE l’apparition (horloge d’affichage, comme iOS)', async () => {
      await monte(mode, [messageOf({ effectFlags: F.ZOOM })]);
      await setOnScreen(true);
      await setOnScreen(false);
      await setOnScreen(true);
      expect(played.filter(hasTransform)).toHaveLength(2);
    });

    test('réduire les animations : aucun mouvement, un simple éclat d’opacité', async () => {
      reduceMotion = true;
      const host = await monte(mode, [messageOf({ effectFlags: F.SHAKE | F.CONFETTI | F.PULSE | F.SPARKLE })]);
      await setOnScreen(true);

      expect(played.some(hasTransform)).toBe(false);
      expect(played.some((entry) => entry.keyframes.some((frame) => frame.opacity !== undefined))).toBe(true);
      expect(host.querySelector('[data-effect-particles]') === null).toBe(true);
    });

    test('un message SANS effet ne monte aucun hôte d’effets', async () => {
      const host = await monte(mode, [messageOf({ effectFlags: F.BLURRED })]);
      expect(host.querySelector('[data-effects-host]') === null).toBe(true);
    });
  });
}
