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
  [...host.querySelectorAll(`[${attribute}]`)].map((node) => node.getAttribute('data-row') ?? '');

const settling = (host: HTMLElement): boolean => host.querySelector('ol[data-rows-settling]') !== null;

describe('la sortie et le retour, montés sur le chemin produit', () => {
  test('au repos : aucune rangée ne sort ni ne revient, les rangées ne glissent pas', async () => {
    const host = await mounter.mount(view(['m-1', 'm-2', 'm-3']));
    expect(rowsWith(host, 'data-leaving')).toEqual([]);
    expect(rowsWith(host, 'data-returning')).toEqual([]);
    expect(settling(host)).toBe(false);
  });

  test('une rangée qui sort reste MONTÉE, sous la classe qui joue son repli, et les suivantes glissent', async () => {
    const host = await mounter.mount(view(['m-1', 'm-2', 'm-3']));
    act(() => rowExitStore.setState({ leaving: new Set(['m-2']), returning: new Set() }));
    expect(rowsWith(host, 'data-leaving')).toEqual(['m-2']);
    expect(host.querySelector('[data-row="m-2"]')?.classList.contains('thread-row-leaving')).toBe(true);
    expect(host.querySelector('[data-row="m-2"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(settling(host)).toBe(true);
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
    [ruleOf('.thread-row-leaving', sheet), ruleOf('.thread-row-returning', sheet)].forEach((rule) => {
      expect(rule).toContain(`${ROW_EXIT_MS}ms`);
      expect(rule).toContain(ROW_EXIT_CURVE);
    });
  });

  test('la rangée qui sort quitte le flux : sa hauteur mesurée tombe, les suivantes remontent', () => {
    expect(ruleOf('.thread-row-leaving', sheet)).toContain('position: absolute');
  });

  test('les rangées glissent par leur transform pendant le repli, sur la même durée', () => {
    const rule = ruleOf('[data-rows-settling] > li', sheet);
    expect(rule).toContain('transition: transform');
    expect(rule).toContain(`${ROW_EXIT_MS}ms`);
  });

  test('seuls opacity et transform s’animent — jamais la géométrie (#11314)', () => {
    expect(new Set(keyframesOf('thread-row-leave'))).toEqual(new Set(['opacity', 'transform']));
    expect(new Set(keyframesOf('thread-row-return'))).toEqual(new Set(['opacity', 'transform']));
  });

  test('« Réduire les animations » : ni repli, ni dépliage, ni glissement dans la feuille non plus', () => {
    const reduced = sheet.slice(sheet.indexOf('@media (prefers-reduced-motion: reduce)', sheet.indexOf('@keyframes thread-row-return')));
    expect(ruleOf('.thread-row-leaving', reduced)).toContain('animation: none');
    expect(reduced).toContain('transition: none');
  });
});
