import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { LensSectionFold } from '@/components/lens-sticker';
import { FOLDED_SECTIONS_STORAGE_KEY } from '@/lib/lens/section-folds';
import type { LensSection } from '@/lib/lens/sections';

import { useSectionFolds } from './use-section-folds';

/**
 * LE PLIAGE CÂBLÉ (#10103) — ce que la liste reçoit pour chaque section :
 * replier une section par date s'écrit sur l'appareil et survit au
 * démontage ; replier une catégorie appelle la préférence serveur et ne
 * touche pas l'appareil ; la recherche suspend le pliage sans rien oublier ;
 * seul le dépliage qu'un geste vient de provoquer s'anime.
 */
const today: LensSection = { id: 'lentille.today', conversations: [] };
const older: LensSection = { id: 'lentille.older', conversations: [] };
const travail = (isExpanded: boolean): LensSection => ({
  id: 'category:cat-travail',
  conversations: [],
  category: { id: 'cat-travail', name: 'Travail', isExpanded },
});

type Probe = { foldOf: (section: LensSection, unreadCounts: readonly number[]) => LensSectionFold | undefined };

describe('useSectionFolds', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  let container: HTMLDivElement;
  let root: Root;
  let probe: Probe;
  let categoryCalls: { id: string; isExpanded: boolean }[];

  function Harness({ searching }: { readonly searching: boolean }) {
    probe = useSectionFolds({
      searching,
      onCategoryToggle: (id, isExpanded) => {
        categoryCalls.push({ id, isExpanded });
      },
    });
    return null;
  }

  const mount = (searching = false) => {
    act(() => {
      root.render(<Harness searching={searching} />);
    });
  };

  beforeAll(() => {
    ensureHappyDomRegistered({ url: 'http://localhost/chats' });
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });
  beforeEach(() => {
    window.localStorage.clear();
    categoryCalls = [];
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test('une section par date se replie, se mémorise sur l’appareil, et revient repliée au remontage', () => {
    mount();
    expect(probe.foldOf(today, [])?.folded).toBe(false);
    act(() => probe.foldOf(today, [])?.onToggle());
    expect(probe.foldOf(today, [3, 2])).toMatchObject({ folded: true, unread: 5 });
    expect(JSON.parse(window.localStorage.getItem(FOLDED_SECTIONS_STORAGE_KEY) ?? '[]')).toEqual(['lentille.today']);

    act(() => root.unmount());
    root = createRoot(container);
    mount();
    expect(probe.foldOf(today, [])?.folded).toBe(true);
    expect(probe.foldOf(older, [])?.folded).toBe(false);
  });

  test('une catégorie suit sa préférence serveur : le geste l’appelle, l’appareil n’écrit rien', () => {
    mount();
    expect(probe.foldOf(travail(true), [])?.folded).toBe(false);
    act(() => probe.foldOf(travail(true), [])?.onToggle());
    expect(categoryCalls).toEqual([{ id: 'cat-travail', isExpanded: false }]);
    expect(window.localStorage.getItem(FOLDED_SECTIONS_STORAGE_KEY)).toBeNull();
    expect(probe.foldOf(travail(false), [1])).toMatchObject({ folded: true, unread: 1 });
    act(() => probe.foldOf(travail(false), [])?.onToggle());
    expect(categoryCalls.at(-1)).toEqual({ id: 'cat-travail', isExpanded: true });
  });

  test('seul le dépliage qu’un geste vient de provoquer s’anime', () => {
    window.localStorage.setItem(FOLDED_SECTIONS_STORAGE_KEY, JSON.stringify(['lentille.older']));
    mount();
    expect(probe.foldOf(today, [])?.animate).toBe(false);
    act(() => probe.foldOf(older, [])?.onToggle());
    expect(probe.foldOf(older, [])).toMatchObject({ folded: false, animate: true });
    expect(probe.foldOf(today, [])?.animate).toBe(false);
    act(() => probe.foldOf(older, [])?.onToggle());
    expect(probe.foldOf(older, [])?.animate).toBe(false);
  });

  test('pendant une recherche, aucune section ne se replie — et la mémoire reste intacte', () => {
    window.localStorage.setItem(FOLDED_SECTIONS_STORAGE_KEY, JSON.stringify(['lentille.today']));
    mount(true);
    expect(probe.foldOf(today, [4])).toBeUndefined();
    expect(probe.foldOf(travail(false), [])).toBeUndefined();
    mount(false);
    expect(probe.foldOf(today, [4])).toMatchObject({ folded: true, unread: 4 });
  });
});
