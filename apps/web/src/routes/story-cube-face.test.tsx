import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { attachmentSrc } from '@/lib/api/media-url';
import { groupForPlayback, type StoryPlaybackStory } from '@/lib/stories/playback';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StoryCubeFace, storyCubeNeighbours, type StoryCubeNeighbour } from './story-cube-face';
import { authorLabel } from './story-identity';

/**
 * LA FACE VOISINE DU CUBE (#11198) — elle montre l'auteur où l'on ENTRERA :
 * son nom (le même que l'en-tête), sa photo, la vignette de sa story d'entrée
 * quand le plateau en sert une.
 */
const NOW = new Date('2026-09-13T12:00:00.000Z').getTime();

const story = (params: Partial<StoryPlaybackStory> & { readonly id: string; readonly authorId: string; readonly name: string }): StoryPlaybackStory => ({
  id: params.id,
  author: { id: params.authorId, displayName: params.name },
  content: 'un contenu',
  createdAt: params.createdAt ?? '2026-09-13T09:00:00.000Z',
  ...(params.isViewedByMe === undefined ? {} : { isViewedByMe: params.isViewedByMe }),
  ...(params.media === undefined ? {} : { media: params.media }),
  ...(params.storyEffects === undefined ? {} : { storyEffects: params.storyEffects }),
});

const groups = groupForPlayback(
  [
    story({ id: 'a1', authorId: 'a', name: 'Awa', createdAt: '2026-09-13T11:00:00.000Z' }),
    story({ id: 'b1', authorId: 'b', name: 'Bilal', createdAt: '2026-09-13T08:00:00.000Z', isViewedByMe: true, media: [{ id: 'm', fileUrl: 'https://cdn.test/b1.jpg', mimeType: 'image/jpeg' }] }),
    story({ id: 'b2', authorId: 'b', name: 'Bilal', createdAt: '2026-09-13T10:00:00.000Z', media: [{ id: 'v', fileUrl: 'https://cdn.test/b2.mp4', thumbnailUrl: 'https://cdn.test/b2-thumb.jpg', mimeType: 'video/mp4' }] }),
    story({ id: 'c1', authorId: 'c', name: 'Chloé', createdAt: '2026-09-13T09:30:00.000Z', isViewedByMe: true, media: [{ id: 'w', fileUrl: 'https://cdn.test/c1.mp4', mimeType: 'video/mp4' }] }),
  ],
  { viewerId: undefined },
);

describe('storyCubeNeighbours — les auteurs voisins, à leur entrée', () => {
  test('le suivant et le précédent, nommés comme l’en-tête, à leur première story non vue', () => {
    expect(groups.map((g) => g.authorId)).toEqual(['a', 'b', 'c']);
    const { next, previous } = storyCubeNeighbours({ groups, position: { groupIndex: 1, storyIndex: 1 }, now: NOW });
    expect(previous?.storyId).toBe('a1');
    expect(previous?.name).toBe(authorLabel(groups[0]!));
    expect(next?.storyId).toBe('c1');
    expect(next?.name).toBe('Chloé');
    expect(next?.initials).not.toBe('');
  });

  test('la vignette : celle que le plateau sert, sinon l’image même ; jamais une vidéo', () => {
    const fromA = storyCubeNeighbours({ groups, position: { groupIndex: 0, storyIndex: 0 }, now: NOW }).next;
    expect(fromA?.storyId).toBe('b2');
    expect(fromA?.thumbnail).toBe(attachmentSrc('https://cdn.test/b2-thumb.jpg'));
    const fromB = storyCubeNeighbours({ groups, position: { groupIndex: 1, storyIndex: 0 }, now: NOW }).next;
    expect(fromB?.thumbnail).toBe('');
  });

  test('sans position, ou au bord de la liste, aucun voisin', () => {
    expect(storyCubeNeighbours({ groups, position: null, now: NOW })).toEqual({ next: null, previous: null });
    expect(storyCubeNeighbours({ groups, position: { groupIndex: 2, storyIndex: 0 }, now: NOW }).next).toBeNull();
    expect(storyCubeNeighbours({ groups, position: { groupIndex: 0, storyIndex: 0 }, now: NOW }).previous).toBeNull();
  });
});

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('StoryCubeFace — la face voisine', () => {
  const neighbour: StoryCubeNeighbour = {
    storyId: 'b2',
    name: 'Bilal',
    initials: 'B',
    avatarSrc: undefined,
    presenceKey: undefined,
    ringRef: null,
    thumbnail: 'https://cdn.test/b2-thumb.jpg',
    background: 'var(--color-ios-brand)',
  };

  test('masquée au repos, muette pour le lecteur d’écran, elle porte le nom de l’auteur et sa vignette', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<StoryCubeFace side="right" neighbour={neighbour} faceRef={() => undefined} />));
    const face = container.querySelector<HTMLElement>('[data-story-cube-face="right"]');
    expect(face?.getAttribute('aria-hidden')).toBe('true');
    expect(face?.style.visibility).toBe('hidden');
    expect(face?.textContent).toContain('Bilal');
    expect(face?.querySelector('img[src="https://cdn.test/b2-thumb.jpg"]')).not.toBeNull();
  });

  test('sans voisin, rien n’est monté', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<StoryCubeFace side="left" neighbour={null} faceRef={() => undefined} />));
    expect(container.querySelector('[data-story-cube-face]')).toBeNull();
  });
});
