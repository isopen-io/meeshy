import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import { VIEWER_ID, flush, harness, mount, onePageSnapshot, publishButton, registerStudioBench } from '@/test-support/story-studio-bench';

/**
 * UN MÉDIA PORTE SON TEXTE ALTERNATIF, LE FOND CHOISIT SON FILTRE (#8518) —
 * miroir de `ComposerObjectEditorView+Media.swift` (« ⌾ Décrire »). L'alt se
 * saisit dans la plaque du calque et dans le Cadre du fond, et PART en
 * `mediaAlt` (`{ postMediaId → texte }`, `CreatePostSchema.mediaAlt`) — le
 * témoin lit la REQUÊTE envoyée. Le filtre du fond se choisit dans le Cadre et
 * part sur le seul objet `background`.
 */
registerStudioBench();

const click = (element: Element | null) => {
  if (element === null) throw new Error('élément absent');
  act(() => (element as HTMLElement).click());
};

const write = (field: HTMLInputElement | HTMLTextAreaElement | null, value: string) => {
  if (field === null) throw new Error('champ absent');
  act(() => {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const seeded = () => {
  const drafts = createStudioDraftStore(null);
  drafts.set(
    VIEWER_ID,
    onePageSnapshot({
      texts: [],
      background: { postMediaId: 'pm-bg', fileUrl: '2026/09/u/bg.jpg', mediaType: 'image', aspectRatio: 9 / 16 },
      overlay: { postMediaId: 'pm-ov', fileUrl: '2026/09/u/ov.jpg', mediaType: 'image', aspectRatio: 1 },
    }),
  );
  return harness({ drafts });
};

type SentObject = { readonly id: string; readonly payload: Record<string, unknown> };
const sentObjects = (post: Record<string, unknown> | undefined): readonly SentObject[] =>
  (post?.storyEffects as { scenes: { objects: SentObject[] }[] }).scenes[0]!.objects;

describe('le texte alternatif d’un média part en `mediaAlt`', () => {
  test('l’alt du calque (sa plaque) et celui du fond (le Cadre) partent, chacun sur SON média', async () => {
    const bench = seeded();
    const el = mount(bench.deps, 'STORY');
    await flush(() => el.querySelector('[data-story-object-edit="overlay"]') !== null);
    click(el.querySelector('[data-story-object-edit="overlay"]'));
    await flush(() => el.querySelector('#story-studio-alt-overlay') !== null);
    write(el.querySelector<HTMLInputElement>('#story-studio-alt-overlay'), '  Un chat roux sur un muret ');
    click(el.querySelector('[data-story-edit-done]'));

    click(el.querySelector('[data-story-option="frame"]'));
    await flush(() => el.querySelector('#story-studio-alt-visual') !== null);
    write(el.querySelector<HTMLInputElement>('#story-studio-alt-visual'), 'Une plage au lever du jour');
    click(el.querySelector('[data-story-frame-done]'));

    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    expect(bench.posts[0]?.mediaAlt).toEqual({ 'pm-ov': 'Un chat roux sur un muret', 'pm-bg': 'Une plage au lever du jour' });
  });

  test('aucun alt écrit ⇒ AUCUNE clé `mediaAlt` dans la requête', async () => {
    const bench = seeded();
    const el = mount(bench.deps, 'STORY');
    await flush(() => el.querySelector('[data-story-object-edit="overlay"]') !== null);
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    expect('mediaAlt' in (bench.posts[0] ?? {})).toBe(false);
  });

  test('le champ alt porte son libellé traduit et se distingue de la légende', async () => {
    const el = mount(seeded().deps, 'STORY');
    await flush(() => el.querySelector('[data-story-option="frame"]') !== null);
    click(el.querySelector('[data-story-option="frame"]'));
    await flush(() => el.querySelector('#story-studio-alt-visual') !== null);
    expect(el.querySelector('#story-studio-alt-visual')?.getAttribute('aria-label')).toBe('Texte alternatif');
    expect(el.querySelector('#story-studio-alt-visual')?.getAttribute('placeholder')).toBe('Décrivez ce média pour les lecteurs d’écran');
  });
});

describe('le filtre du FOND se choisit dans le Cadre', () => {
  test('choisi dans le Cadre, il part sur le fond seul, jamais sur le calque', async () => {
    const bench = seeded();
    const el = mount(bench.deps, 'STORY');
    await flush(() => el.querySelector('[data-story-option="frame"]') !== null);
    click(el.querySelector('[data-story-option="frame"]'));
    await flush(() => el.querySelector('[data-story-frame-panel] [data-story-option="filter:warm"]') !== null);
    expect(el.querySelector('[data-story-frame-panel] [data-story-option="filter:none"]')?.getAttribute('aria-pressed')).toBe('true');
    click(el.querySelector('[data-story-frame-panel] [data-story-option="filter:warm"]'));
    expect(el.querySelector('[data-story-frame-panel] [data-story-option="filter:warm"]')?.getAttribute('aria-pressed')).toBe('true');
    click(el.querySelector('[data-story-frame-done]'));
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    const objects = sentObjects(bench.posts[0]);
    expect(objects.find((object) => object.id === 'background')?.payload.filter).toBe('warm');
    expect(objects.find((object) => object.id === 'overlay')?.payload.filter).toBeUndefined();
  });
});
