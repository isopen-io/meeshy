import { readFileSync } from 'node:fs';

import type { Virtualizer } from '@tanstack/react-virtual';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ROW_EXIT_CURVE, ROW_EXIT_MS, rowExitStore } from '@/lib/view/row-exit-motion';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadModes } from './thread-modes';

/**
 * #12634 — UN MESSAGE MASQUÉ « POUR MOI » SORT DU FIL EN SE REPLIANT, monté sur
 * le CHEMIN PRODUIT (`ThreadModes`) : la rangée qui sort reste peinte, sous la
 * classe qui joue son repli ; celle qui revient se déplie ; et pendant ce temps
 * les rangées suivantes GLISSENT vers leur nouvelle place au lieu d'y sauter.
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

const RESTING = { leaving: new Set<string>(), returning: new Set<string>() };

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  rowExitStore.setState(RESTING);
});

const messageOf = (id: string): Message => {
  const createdAt = new Date(Date.now() - 3_600_000);
  return {
    id,
    conversationId: 'c-exit',
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
  } as unknown as Message;
};

const virtualizerOf = (count: number): Virtualizer<HTMLElement, Element> =>
  ({
    getTotalSize: () => count * 88,
    getVirtualItems: () =>
      Array.from({ length: count }, (_unused, index) => ({ index, start: index * 88, end: (index + 1) * 88, size: 88, key: index, lane: 0 })),
    measureElement: () => {},
  }) as unknown as Virtualizer<HTMLElement, Element>;

const VIEWER = { id: 'u-viewer', username: 'viewer', displayName: 'Vous' } as unknown as Viewer;
const SCENE = { elected: null, noteProgrammaticScroll: () => {} } as unknown as ThreadScene;

const view = (ids: readonly string[]) => {
  const placed: readonly PlacedMessage[] = ids.map((id) => ({ message: messageOf(id), head: true, tail: true, opensDay: null }));
  return (
    <ThreadModes
      mode="bubbles"
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

const rowsWith = (host: HTMLElement, attribute: string): readonly string[] =>
  [...host.querySelectorAll(`[${attribute}]`)].map((node) => node.getAttribute('data-row') ?? node.querySelector('[data-row]')?.getAttribute('data-row') ?? '');

const itemOf = (host: HTMLElement, id: string): HTMLElement | null => host.querySelector<HTMLElement>(`[data-row="${id}"]`)?.closest('li') ?? null;

const settling = (host: HTMLElement): boolean => host.querySelector('ol[data-rows-settling]') !== null;

describe('la sortie et le retour, montés sur le chemin produit', () => {
  test('au repos : aucune rangée ne sort ni ne revient, les rangées ne glissent pas', async () => {
    const host = await mounter.mount(view(['m-1', 'm-2', 'm-3']));
    expect(rowsWith(host, 'data-leaving')).toEqual([]);
    expect(rowsWith(host, 'data-returning')).toEqual([]);
    expect(settling(host)).toBe(false);
  });

  test('une rangée qui sort reste MONTÉE : son <li> entier se replie, sans plus compter dans la hauteur du fil', async () => {
    const host = await mounter.mount(view(['m-1', 'm-2', 'm-3']));
    act(() => rowExitStore.setState({ leaving: new Set(['m-2']), returning: new Set() }));
    expect(rowsWith(host, 'data-leaving')).toEqual(['m-2']);
    const item = itemOf(host, 'm-2');
    expect(item?.classList.contains('thread-row-leaving')).toBe(true);
    expect(item?.style.height).toBe('0px');
    expect(item?.style.transform).toBe('translateY(88px)');
    expect(settling(host)).toBe(true);
  });

  test('une rangée qui sort n’est plus ni lue ni atteinte : cachée aux lecteurs d’écran ET hors du clavier', async () => {
    const host = await mounter.mount(view(['m-1', 'm-2', 'm-3']));
    act(() => rowExitStore.setState({ leaving: new Set(['m-2']), returning: new Set() }));
    const item = itemOf(host, 'm-2');
    expect(item?.getAttribute('aria-hidden')).toBe('true');
    expect(item?.hasAttribute('inert') || (item as (HTMLElement & { inert?: boolean }) | null)?.inert === true).toBe(true);
    expect(host.querySelector('[data-row="m-2"]')?.hasAttribute('tabindex')).toBe(false);
    expect(itemOf(host, 'm-1')?.hasAttribute('data-leaving')).toBe(false);
  });

  test('les autres rangées gardent leur place et leur hauteur', async () => {
    const host = await mounter.mount(view(['m-1', 'm-2', 'm-3']));
    act(() => rowExitStore.setState({ leaving: new Set(['m-2']), returning: new Set() }));
    expect(itemOf(host, 'm-3')?.style.height).toBe('');
    expect(itemOf(host, 'm-3')?.getAttribute('aria-hidden')).toBeNull();
  });

  test('une sélection : toutes les rangées visées sortent ensemble', async () => {
    const host = await mounter.mount(view(['m-1', 'm-2', 'm-3']));
    act(() => rowExitStore.setState({ leaving: new Set(['m-1', 'm-3']), returning: new Set() }));
    expect(rowsWith(host, 'data-leaving')).toEqual(['m-1', 'm-3']);
  });

  test('une rangée rendue revient à sa place et s’y déplie', async () => {
    const host = await mounter.mount(view(['m-1', 'm-3']));
    act(() => rowExitStore.setState({ leaving: new Set(), returning: new Set(['m-2']) }));
    await mounter.rerender(host, view(['m-1', 'm-2', 'm-3']));
    expect(rowsWith(host, 'data-returning')).toEqual(['m-2']);
    expect(host.querySelector('[data-row="m-2"]')?.classList.contains('thread-row-returning')).toBe(true);
    expect(settling(host)).toBe(true);
  });
});

/**
 * LES VOISINES GLISSENT DEPUIS LÀ OÙ ELLES ÉTAIENT PEINTES (`row-settle-flip.ts`).
 * La mesure réelle (rabat du défilement compris) est au navigateur
 * (`scripts/check-thread-row-exit.mjs`) ; ici, le câblage : la rangée déplacée
 * reçoit une animation qui part de son ancienne place et rejoint la nouvelle.
 */
describe('le glissement des voisines, câblé sur le chemin produit', () => {
  const recordAnimations = () => {
    const played: { readonly row: string; readonly from: string; readonly to: string }[] = [];
    const proto = HTMLElement.prototype as unknown as { animate?: unknown };
    const saved = Object.getOwnPropertyDescriptor(proto, 'animate');
    proto.animate = function animate(this: HTMLElement, keyframes: readonly Keyframe[]) {
      played.push({
        row: this.querySelector('[data-row]')?.getAttribute('data-row') ?? '',
        from: String(keyframes[0]?.transform),
        to: String(keyframes[1]?.transform),
      });
      return { cancel: () => {}, playState: 'running' };
    };
    const restore = () => {
      if (saved === undefined) delete proto.animate;
      else Object.defineProperty(proto, 'animate', saved);
    };
    return { played, restore };
  };

  test('une rangée rendue pousse la suivante : celle-ci repart de son ancienne place', async () => {
    const animations = recordAnimations();
    try {
      const host = await mounter.mount(view(['m-1', 'm-3']));
      act(() => rowExitStore.setState({ leaving: new Set(), returning: new Set(['m-2']) }));
      await mounter.rerender(host, view(['m-1', 'm-2', 'm-3']));
      expect(animations.played).toEqual([{ row: 'm-3', from: 'translateY(88px)', to: 'translateY(176px)' }]);
    } finally {
      animations.restore();
    }
  });

  test('hors sortie et retour, une rangée qui change de place ne glisse pas (arrivée, page préfixée)', async () => {
    const animations = recordAnimations();
    try {
      const host = await mounter.mount(view(['m-1', 'm-3']));
      await mounter.rerender(host, view(['m-1', 'm-2', 'm-3']));
      expect(animations.played).toEqual([]);
    } finally {
      animations.restore();
    }
  });
});

describe('la feuille qui joue la sortie et le retour', () => {
  const sheet = readFileSync(new URL('../styles/thread-scene.css', import.meta.url).pathname, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const ruleOf = (selector: string, css: string): string => {
    const start = css.indexOf(`${selector} {`);
    return start === -1 ? '' : css.slice(start, css.indexOf('}', start));
  };
  const keyframesOf = (name: string): readonly string[] => {
    const start = sheet.indexOf(`@keyframes ${name}`);
    const body = start === -1 ? '' : sheet.slice(start, sheet.indexOf('\n}\n', start));
    return [...new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1] ?? ''))];
  };

  test('la sortie et le retour durent ROW_EXIT_MS, sur la courbe partagée', () => {
    [ruleOf('.thread-row-leaving', sheet), ruleOf(".thread-row-leaving > [role='article']", sheet), ruleOf('.thread-row-returning', sheet)].forEach(
      (rule) => {
        expect(rule).toContain(`${ROW_EXIT_MS}ms`);
        expect(rule).toContain(ROW_EXIT_CURVE);
      },
    );
  });

  test('le glissement des voisines ne se déclare plus dans la feuille : il se MESURE à l’écran (row-settle-flip.ts)', () => {
    expect(sheet).not.toContain('[data-rows-settling] > li');
  });

  test('seuls opacity et transform s’animent — jamais la géométrie (#11314)', () => {
    expect(new Set(keyframesOf('thread-row-leave'))).toEqual(new Set(['opacity']));
    expect(new Set(keyframesOf('thread-row-shrink'))).toEqual(new Set(['transform']));
    expect(new Set(keyframesOf('thread-row-return'))).toEqual(new Set(['opacity', 'transform']));
  });

  test('« Réduire les animations » : ni repli, ni dépliage dans la feuille non plus', () => {
    const reduced = sheet.slice(sheet.indexOf('@media (prefers-reduced-motion: reduce)', sheet.indexOf('@keyframes thread-row-return')));
    expect(reduced.slice(0, reduced.indexOf('}'))).toContain('animation: none');
    expect(ruleOf('.thread-row-returning', reduced)).toContain('animation: none');
  });
});
