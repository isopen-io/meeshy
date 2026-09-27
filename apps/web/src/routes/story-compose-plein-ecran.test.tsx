import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import { VIEWER_ID, flush, harness, image, mount, onePageSnapshot, publishButton, registerStudioBench, selectFile, typeText } from '@/test-support/story-studio-bench';

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

describe('le sol du COMPOSITE (#8425)', () => {
  /** Un « canvas » qui rend une scène rouge uni : le hash qui en sort est
   * celui du RENDU, pas celui d'un média. */
  const redCanvas = () => {
    let pixels = new Uint8ClampedArray(0);
    return {
      fillStyle: '',
      filter: 'none',
      fillRect: () => undefined,
      drawImage: () => undefined,
      save: () => undefined,
      restore: () => undefined,
      translate: () => undefined,
      rotate: () => undefined,
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        pixels = new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 0 || i % 4 === 3 ? 255 : 0));
        return { data: pixels } as ImageData;
      },
    } as unknown as CanvasRenderingContext2D;
  };

  test('dès que le rendu réduit est haché, le sol le peint à la place de l’image de fond', async () => {
    const drafts = createStudioDraftStore(null);
    drafts.set(VIEWER_ID, onePageSnapshot({ texts: [], background: { postMediaId: 'pm-1', fileUrl: '2026/09/u/f.jpg', mediaType: 'image', aspectRatio: 4 / 3 } }));
    const bench = harness({ drafts });
    const el = mount({ ...bench.deps, composite: { createCanvas: redCanvas, loadImage: async () => ({}) as CanvasImageSource } });
    await flush(() => el.querySelector('[data-story-studio-floor="hash"]') !== null);
    expect(el.querySelector('[data-story-studio-floor] img')?.getAttribute('src')).toMatch(/^data:image\/bmp;base64,/);
  });

  test('sans canvas (rendu impossible), le repli : l’image de fond elle-même', async () => {
    const drafts = createStudioDraftStore(null);
    drafts.set(VIEWER_ID, onePageSnapshot({ texts: [], background: { postMediaId: 'pm-1', fileUrl: '2026/09/u/f.jpg', mediaType: 'image', aspectRatio: 4 / 3 } }));
    const el = mount({ ...harness({ drafts }).deps, composite: { createCanvas: () => null, loadImage: async () => null } });
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await flush();
    expect(el.querySelector('[data-story-studio-floor]')?.getAttribute('data-story-studio-floor')).toBe('media');
  });
});

describe('le panneau Cadre (#8414)', () => {
  test('la tuile Cadre n’existe qu’avec un média de fond', () => {
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-story-option="frame"]')).toBeNull();
    selectFile(el, 'visual', image());
    expect(el.querySelector('[data-story-option="frame"]')).not.toBeNull();
  });

  test('le panneau est du MÊME verre que la barre, les rails et le socle — pas un aplat opaque', async () => {
    const el = mount(harness({}).deps);
    selectFile(el, 'visual', image());
    click(el.querySelector('[data-story-option="frame"]'));
    await flush(() => el.querySelector('[data-story-frame-panel]') !== null);
    const tokens = (el.querySelector('[data-story-frame-panel]')?.className ?? '').split(/\s+/);
    const rail = (el.querySelector('[data-story-studio-rail="leading"]')?.className ?? '').split(/\s+/);
    expect(tokens).toContain('glass');
    expect(rail).toContain('glass');
    expect(tokens).not.toContain('glass-prominent');
  });

  test('Remplir couvre le cadre ; les fonds ne s’offrent qu’à un média ajusté', async () => {
    const el = mount(harness({}).deps);
    selectFile(el, 'visual', image());
    click(el.querySelector('[data-story-option="frame"]'));
    await flush(() => el.querySelector('[data-story-frame-panel]') !== null);
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
    await flush(() => el.querySelector('[data-story-frame-panel]') !== null);
    click(el.querySelector('[data-story-frame-option="sand"]'));
    expect(el.querySelector('[data-scene-stage] [data-scene-letterbox]')?.getAttribute('data-scene-backdrop')).toBe('sand');
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    const effects = bench.posts[0]?.storyEffects as { scenes: { objects: { id: string; payload: { transform?: unknown } }[] }[] };
    const background = effects.scenes[0]?.objects.find((object) => object.id === 'background');
    expect(background?.payload.transform).toEqual({ videoFitMode: 'fit', backdrop: 'sand' });
  });
});

/** « Une story reste visible vingt heures. » ne se dit que d'une STORY : sous
 * un post ou un réel, la phrase était FAUSSE (retour de revue #8425). Et le
 * socle ne garde pas une carte vide quand il n'a rien à dire. */
describe('le message du socle suit le format', () => {
  test('STORY : la durée de vie se dit', () => {
    const el = mount(harness({}).deps, 'STORY');
    expect(el.querySelector('[data-story-studio-bottom]')?.textContent).toContain('vingt heures');
  });

  test('POST vide : ni la phrase, ni carte vide au-dessus de Publier', () => {
    const el = mount(harness({}).deps, 'POST');
    expect(el.querySelector('[data-story-studio-bottom]')?.textContent).not.toContain('vingt heures');
    expect(el.querySelector('[data-story-studio-socle-card]')).toBeNull();
  });

  test('REEL vide : sa propre raison de refus, jamais la phrase de la story', () => {
    const el = mount(harness({}).deps, 'REEL');
    const socle = el.querySelector('[data-story-studio-bottom]')?.textContent ?? '';
    expect(socle).not.toContain('vingt heures');
    expect(el.querySelector('[data-publish-refusal="reel-without-qualifying-media"]')).not.toBeNull();
  });

  test('POST avec un média : la carte revient pour le média, toujours sans la phrase', async () => {
    const el = mount(harness({}).deps, 'POST');
    selectFile(el, 'visual', image());
    // La montée se laisse aboutir : un transport encore en vol au démontage
    // répondrait après la fin du banc.
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    expect(el.querySelector('[data-story-studio-socle-card]')).not.toBeNull();
    expect(el.querySelector('[data-story-studio-bottom]')?.textContent).not.toContain('vingt heures');
  });
});
