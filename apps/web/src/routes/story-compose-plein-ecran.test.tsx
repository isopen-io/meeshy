import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { flush, harness, image, mount, publishButton, registerStudioBench, selectFile, typeText } from '@/test-support/story-studio-bench';

/**
 * LE COMPOSER PLEIN ÉCRAN, PARITÉ iOS (#8413) ET LE PANNEAU CADRE (#8414) —
 * au DOM : la colonne barre / scène / socle, le menu ⋯ et son Aperçu, le
 * texte du post, les tuiles libellées (dont Annuler / Rétablir), le sol et le
 * Cadre relu par le moteur. La géométrie mesurée (la carte ENTRE la barre et
 * le socle) est gardée au navigateur par `check-story-studio.mjs`.
 */

registerStudioBench();

const click = (element: Element | null) => {
  if (element === null) throw new Error('élément absent');
  act(() => (element as HTMLElement).click());
};

describe('la scène se cadre ENTRE la barre haute et le socle', () => {
  test('la carte vit dans la zone de la scène ; ni la barre ni le socle n’y sont', () => {
    const el = mount(harness({}).deps);
    const plateau = el.querySelector('[data-story-studio-plateau]');
    expect(plateau?.querySelector('[data-scene-stage]')).not.toBeNull();
    expect(plateau?.querySelector('[data-story-studio-top]')).toBeNull();
    expect(plateau?.querySelector('[data-story-studio-bottom]')).toBeNull();
    const top = el.querySelector('[data-story-studio-top]')!;
    const bottom = el.querySelector('[data-story-studio-bottom]')!;
    expect(top.compareDocumentPosition(plateau!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(plateau!.compareDocumentPosition(bottom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('le menu ⋯ de la barre haute porte l’Aperçu', () => {
  test('sans rien à aperçevoir ni scène à retirer, aucun ⋯ (loi 4)', () => {
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-story-studio-more]')).toBeNull();
  });

  test('⋯ › Aperçu ouvre la scène dans le moteur, en mode lecture', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Bonjour');
    click(el.querySelector('[data-story-studio-more]'));
    click(el.querySelector('[data-story-menu-item="preview"]'));
    await flush(() => document.querySelector('[data-story-studio-preview] [data-scene-player]') !== null);
    expect(document.querySelector('[data-story-studio-preview] [data-scene-text]')?.textContent).toBe('Bonjour');
  });

  test('à deux scènes, ⋯ › Supprimer cette scène retire la scène courante', () => {
    const el = mount(harness({}).deps);
    click(el.querySelector('[data-story-option="add-page"]'));
    expect(el.querySelector('[data-scene-stage]')?.getAttribute('data-story-studio-current-page')).toBe('page-2');
    click(el.querySelector('[data-story-studio-more]'));
    click(el.querySelector('[data-story-menu-item="remove-page"]'));
    expect(el.querySelector('[data-scene-stage]')?.getAttribute('data-story-studio-current-page')).toBe('page-1');
  });
});

describe('le texte du POST, au socle, à côté de Publier', () => {
  test('une story n’a pas de corps : aucun bouton', () => {
    const el = mount(harness({}).deps, 'STORY');
    expect(el.querySelector('[data-story-post-text]')).toBeNull();
  });

  test('un post : le bouton ouvre l’édition du corps, qui PART en `content`', async () => {
    const bench = harness({});
    const el = mount(bench.deps, 'POST');
    typeText(el, 'Sur la scène');
    click(el.querySelector('[data-story-post-text]'));
    await flush(() => document.querySelector('#story-studio-post-text') !== null);
    const field = document.querySelector<HTMLTextAreaElement>('#story-studio-post-text')!;
    act(() => {
      field.value = 'Le corps du post';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(document.querySelector('[data-story-post-text-done]'));
    expect(el.querySelector('[data-story-post-text]')?.getAttribute('data-story-post-text')).toBe('written');
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    expect(bench.posts[0]?.content).toBe('Le corps du post');
    expect(bench.posts[0]?.type).toBe('POST');
  });
});

describe('le rail droit : des TUILES libellées, et l’historique', () => {
  test('chaque tuile porte son libellé visible', () => {
    const el = mount(harness({}).deps);
    const labels = [...el.querySelectorAll('[data-story-studio-rail="trailing"] [data-story-tile]')].map((tile) => tile.textContent);
    expect(labels).toEqual(['Scène', 'Texte', 'Réglages']);
  });

  test('Annuler n’existe qu’après un geste, défait la frappe ; Rétablir la rend', () => {
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-story-option="undo"]')).toBeNull();
    typeText(el, 'Bonjour');
    click(el.querySelector('[data-story-option="undo"]'));
    expect(el.querySelector<HTMLTextAreaElement>('#story-studio-text')?.value).toBe('');
    expect(el.querySelector('[data-story-option="undo"]')).toBeNull();
    click(el.querySelector('[data-story-option="redo"]'));
    expect(el.querySelector<HTMLTextAreaElement>('#story-studio-text')?.value).toBe('Bonjour');
  });

  test('un fond retiré puis rendu par Annuler remonte, et Publier repart', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    selectFile(el, 'visual', image());
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    click(el.querySelector('button[aria-label="Retirer le fond"]'));
    expect(el.querySelector('[data-scene-player]')).toBeNull();
    click(el.querySelector('[data-story-option="undo"]'));
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    expect(el.querySelector('[data-scene-player]')).not.toBeNull();
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    expect(bench.posts).toHaveLength(1);
  });
});

describe('le sol de la scène', () => {
  test('sans média, aucun sol : la surface du thème', () => {
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-story-studio-floor]')).toBeNull();
  });

  test('un fond image posé peint le sol de l’image elle-même, floutée', () => {
    const el = mount(harness({}).deps);
    selectFile(el, 'visual', image());
    const floor = el.querySelector('[data-story-studio-floor] img') as HTMLImageElement | null;
    expect(floor?.getAttribute('src')?.startsWith('blob:')).toBe(true);
    expect(floor?.style.filter).toContain('blur');
  });
});

describe('le panneau Cadre (#8414)', () => {
  test('la tuile Cadre n’existe qu’avec un média de fond', () => {
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-story-option="frame"]')).toBeNull();
    selectFile(el, 'visual', image());
    expect(el.querySelector('[data-story-option="frame"]')).not.toBeNull();
  });

  test('Remplir couvre le cadre ; les fonds ne s’offrent qu’à un média ajusté', () => {
    const el = mount(harness({}).deps);
    selectFile(el, 'visual', image());
    click(el.querySelector('[data-story-option="frame"]'));
    expect(el.querySelectorAll('[data-story-frame-panel] [data-story-frame-option]')).toHaveLength(7);
    click(el.querySelector('[data-story-frame-option="fill"]'));
    expect(el.querySelector('[data-scene-stage] img:not([data-scene-letterbox])')?.className).toContain('object-cover');
    expect(el.querySelectorAll('[data-story-frame-panel] [data-story-frame-option]')).toHaveLength(2);
  });

  test('un fond Sable se peint dans les bandes de l’aperçu ET part dans le document publié', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    selectFile(el, 'visual', image());
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    click(el.querySelector('[data-story-option="frame"]'));
    click(el.querySelector('[data-story-frame-option="sand"]'));
    expect(el.querySelector('[data-scene-stage] [data-scene-letterbox]')?.getAttribute('data-scene-backdrop')).toBe('sand');
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    const effects = bench.posts[0]?.storyEffects as { scenes: { objects: { id: string; payload: { transform?: unknown } }[] }[] };
    const background = effects.scenes[0]?.objects.find((object) => object.id === 'background');
    expect(background?.payload.transform).toEqual({ videoFitMode: 'fit', backdrop: 'sand' });
  });
});
