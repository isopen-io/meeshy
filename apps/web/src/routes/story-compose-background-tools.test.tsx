import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import type { StudioMediaKind } from '@/lib/stories/story-document';
import { VIEWER_ID, flush, harness, mount, onePageSnapshot, publishButton, registerStudioBench } from '@/test-support/story-studio-bench';

/**
 * **ÉDITER LE FOND PASSE PAR LES OUTILS DE DROITE** (#8849, jumelle web de
 * #8847 — directive porteur 2026-09-30) : « Modifier le fond » n'ouvre plus
 * l'ancien panneau Cadre ; le rail droit porte les outils du fond, chacun
 * ouvre SES contrôles sous la scène à la place de ce qui s'y trouvait, et
 * audience, Publier, en-tête, scènes et portes cèdent jusqu'au `(x)`.
 */

registerStudioBench();

const click = (element: Element | null) => {
  if (element === null) throw new Error('élément absent');
  act(() => (element as HTMLElement).click());
};

const trailing = (el: ParentNode) =>
  [...el.querySelectorAll('[data-story-studio-rail="trailing"] [data-story-trailing-options] [data-story-option]')].map((tile) => tile.getAttribute('data-story-option'));

function seeded(background: StudioMediaKind) {
  const drafts = createStudioDraftStore(null);
  drafts.set(
    VIEWER_ID,
    onePageSnapshot({
      texts: [],
      background: { postMediaId: 'pm-bg', fileUrl: `2026/09/u/bg.${background === 'video' ? 'mp4' : 'jpg'}`, mediaType: background, aspectRatio: 9 / 16, durationMs: 8000 },
    }),
  );
  return harness({ drafts });
}

const chrome = (el: ParentNode) =>
  ['[data-story-studio-top]', '[data-story-studio-rail="leading"]', '[data-story-trailing-options]'].map((selector) => el.querySelector(selector)?.getAttribute('data-studio-chrome') ?? 'absent');
const socleHidden = (el: ParentNode) => (el.querySelector('[data-story-socle-row]')?.className ?? '').split(' ').includes('hidden');

async function editBackground(el: HTMLElement) {
  await flush(() => el.querySelector('[data-story-background-menu]') !== null);
  click(el.querySelector('[data-story-background-menu]'));
  await flush(() => document.querySelector('[data-story-object-action="edit"]') !== null);
  click(document.querySelector('[data-story-object-action="edit"]'));
  await flush(() => el.querySelector('[data-story-option="background:frame"]') !== null);
}

describe('« Modifier le fond » ouvre les outils de droite, jamais l’ancien éditeur', () => {
  test('le rail porte les outils du fond, ses gestes et le (x) ; aucun panneau ne s’ouvre', async () => {
    const el = mount(seeded('image').deps, 'POST');
    await editBackground(el);
    expect(trailing(el)).toEqual(['background:frame', 'background:filter', 'background:describe', 'object:retake', 'object:forward', 'object:remove', 'background:exit']);
    expect(el.querySelector('[data-story-background-tool]')).toBeNull();
    expect(el.querySelector('[data-story-frame-panel]')).toBeNull();
  });

  test('un fond vidéo n’offre ni le filtre ni « Reprendre une photo » (un réel)', async () => {
    const el = mount(seeded('video').deps, 'REEL');
    await editBackground(el);
    expect(trailing(el)).toEqual(['background:frame', 'background:describe', 'object:forward', 'object:remove', 'background:exit']);
  });

  test('tant que l’outil est ouvert, en-tête, portes, audience et Publier cèdent ; le (x) les rend', async () => {
    const el = mount(seeded('image').deps, 'POST');
    await flush(() => el.querySelector('[data-story-background-menu]') !== null);
    expect(chrome(el)).toEqual(['shown', 'shown', 'shown']);
    expect(socleHidden(el)).toBe(false);
    await editBackground(el);
    expect(chrome(el)).toEqual(['hidden', 'hidden', 'shown']);
    expect(socleHidden(el)).toBe(true);
    expect(el.querySelector('[data-story-trailing-foot] [data-story-option="undo"]')?.closest('[inert]') ?? null).toBeNull();
    click(el.querySelector('[data-story-option="background:exit"]'));
    await flush(() => el.querySelector('[data-story-option="background:frame"]') === null);
    expect(chrome(el)).toEqual(['shown', 'shown', 'shown']);
    expect(socleHidden(el)).toBe(false);
  });
});

describe('un outil du fond ouvre SES contrôles sous la scène, à la place de ce qui y était', () => {
  test('Filtre, puis Décrire : un seul jeu de contrôles à la fois ; retoucher l’outil ouvert le range', async () => {
    const el = mount(seeded('image').deps, 'POST');
    await editBackground(el);
    click(el.querySelector('[data-story-option="background:filter"]'));
    await flush(() => el.querySelector('[data-story-background-tool="filter"]') !== null);
    expect(el.querySelector('[data-story-option="background:filter"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelectorAll('[data-story-background-tool]')).toHaveLength(1);

    click(el.querySelector('[data-story-option="background:describe"]'));
    await flush(() => el.querySelector('[data-story-background-tool="describe"]') !== null);
    expect(el.querySelectorAll('[data-story-background-tool]')).toHaveLength(1);

    click(el.querySelector('[data-story-option="background:describe"]'));
    await flush(() => el.querySelector('[data-story-background-tool]') === null);
    expect(trailing(el)).toContain('background:exit');
  });

  test('le filtre choisi part sur le fond', async () => {
    const bench = seeded('image');
    const el = mount(bench.deps, 'POST');
    await editBackground(el);
    click(el.querySelector('[data-story-option="background:filter"]'));
    await flush(() => el.querySelector('[data-story-background-tool="filter"] [data-story-option="filter:warm"]') !== null);
    click(el.querySelector('[data-story-background-tool="filter"] [data-story-option="filter:warm"]'));
    click(el.querySelector('[data-story-option="background:exit"]'));
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    const effects = bench.posts[0]?.storyEffects as { scenes: { objects: { id: string; payload: { filter?: unknown } }[] }[] };
    expect(effects.scenes[0]?.objects.find((object) => object.id === 'background')?.payload.filter).toBe('warm');
  });

  test('pendant l’outil, l’invite à écrire (et sa barre de mentions) quitte la scène', async () => {
    const el = mount(seeded('image').deps, 'POST');
    await flush(() => el.querySelector('#story-studio-text') !== null);
    await editBackground(el);
    expect(el.querySelector('#story-studio-text')).toBeNull();
  });

  test('retirer le fond depuis le rail rend la scène : l’outil ne survit pas à son fond', async () => {
    const el = mount(seeded('image').deps, 'POST');
    await editBackground(el);
    click(el.querySelector('[data-story-option="object:remove"]'));
    await flush(() => el.querySelector('[data-story-option="background:exit"]') === null);
    expect(chrome(el)[0]).toBe('shown');
  });

  test('la tuile Cadre ouvre les outils du fond, le Cadre déjà déplié', async () => {
    const el = mount(seeded('image').deps, 'POST');
    await flush(() => el.querySelector('[data-story-option="frame"]') !== null);
    click(el.querySelector('[data-story-option="frame"]'));
    await flush(() => el.querySelector('[data-story-background-tool="frame"]') !== null);
    expect(el.querySelector('[data-story-option="background:frame"]')?.getAttribute('aria-pressed')).toBe('true');
  });
});
