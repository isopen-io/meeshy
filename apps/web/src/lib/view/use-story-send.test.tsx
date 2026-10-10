import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { closeSendSheet, openSendSheet, sendSheetStore } from '@/lib/send/send-sheet-store';
import type { StoryPlaybackStory } from '@/lib/stories/playback';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useStorySend, type StorySend } from './use-story-send';

/**
 * #8884 — « ENVOYER » DU RAIL D'UNE STORY : le transfert que la loi du rail
 * déclare (`showsForward`) avait un bouton et aucun gestionnaire, donc aucun
 * bouton. Il ouvre la feuille d'envoi COMMUNE avec la story regardée, et la
 * lecture attend pendant que la feuille est là.
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

const story = (id: string): StoryPlaybackStory => ({ id, createdAt: '2026-09-30T10:00:00.000Z', content: 'Coucher de soleil' });

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const press = async (run: (() => void) | undefined) =>
  act(async () => {
    run?.();
    await settle();
  });

let mounted: { readonly root: Root; readonly container: HTMLElement } | undefined;

afterEach(() => {
  act(() => {
    closeSendSheet();
    mounted?.root.unmount();
  });
  mounted?.container.remove();
  mounted = undefined;
});

function mountHook(initial: StoryPlaybackStory | undefined): { readonly send: () => StorySend; readonly render: (next: StoryPlaybackStory | undefined) => void } {
  const seen: StorySend[] = [];
  function Harness({ current }: { readonly current: StoryPlaybackStory | undefined }) {
    seen.push(useStorySend(current));
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { root, container };
  const render = (next: StoryPlaybackStory | undefined) => act(() => root.render(<Harness current={next} />));
  render(initial);
  return { send: () => seen[seen.length - 1] as StorySend, render };
}

describe('useStorySend', () => {
  test('« Envoyer » ouvre la feuille d’envoi avec CETTE story, publiée en STORY', async () => {
    const probe = mountHook(story('st-1'));
    await press(probe.send().handlers.forward);
    expect(sendSheetStore.getState().request?.payload).toMatchObject({ kind: 'publication', postId: 'st-1', postType: 'STORY' });
    expect(sendSheetStore.getState().request?.intent).toBe('share');
  });

  test('le geste suit la story affichée : sur la suivante, c’est la suivante qui part', async () => {
    const probe = mountHook(story('st-1'));
    probe.render(story('st-2'));
    await press(probe.send().handlers.forward);
    expect(sendSheetStore.getState().request?.payload).toMatchObject({ postId: 'st-2' });
  });

  test('sans story, pas de geste : un bouton sans effet n’est pas rendu (loi 4)', async () => {
    const probe = mountHook(undefined);
    expect(probe.send().handlers.forward).toBeUndefined();
  });

  test('`sheetOpen` dit si la feuille est là — la lecture de la story attend sous elle', async () => {
    const probe = mountHook(story('st-1'));
    expect(probe.send().sheetOpen).toBe(false);
    await press(probe.send().handlers.forward);
    expect(probe.send().sheetOpen).toBe(true);
    act(() => closeSendSheet());
    expect(probe.send().sheetOpen).toBe(false);
  });

  test('une feuille ouverte ailleurs compte aussi : la story ne repart pas sous elle', async () => {
    const probe = mountHook(story('st-1'));
    act(() => openSendSheet({ intent: 'share', payload: { kind: 'text', text: 'x' } }));
    expect(probe.send().sheetOpen).toBe(true);
  });
});
