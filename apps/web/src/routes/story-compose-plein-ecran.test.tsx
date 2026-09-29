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
  /** LOT 6 : des disques de verre SÉPARÉS, SANS libellé visible ; seuls les
   * outils UTILES — sans objet sélectionné, rien à régler. */
  test('des disques de verre sans libellé, et seulement les outils utiles', () => {
    const el = mount(harness({}).deps);
    // #8516 : le Texte est une porte du couloir GAUCHE (ce qu'on pose) ; le
    // rail droit ne garde que les outils de la scène.
    const tiles = [...el.querySelectorAll('[data-story-studio-rail] [data-story-tile]')];
    expect(tiles.map((tile) => tile.getAttribute('data-story-option'))).toEqual(['add-text', 'add-page']);
    expect(tiles.every((tile) => tile.textContent === '' && tile.getAttribute('aria-label') !== null && tile.className.split(' ').includes('glass'))).toBe(true);
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
    // Pendant le fondu (#8534), l'image qui part reste DESSOUS : le sol peint la DERNIÈRE.
    expect(el.querySelector('[data-story-studio-floor] img:last-of-type')?.getAttribute('src')).toMatch(/^data:image\/bmp;base64,/);
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
    const door = (el.querySelector('label:has(input[data-door="visual"])')?.className ?? '').split(/\s+/);
    expect(tokens).toContain('glass');
    expect(door).toContain('glass');
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

  test('POST avec un média PRÊT : plus de carte en bas (lot 6), jamais la phrase', async () => {
    const el = mount(harness({}).deps, 'POST');
    selectFile(el, 'visual', image());
    // La montée se laisse aboutir : un transport encore en vol au démontage
    // répondrait après la fin du banc.
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    expect(el.querySelector('[data-story-studio-socle-card]')).toBeNull();
    expect(el.querySelector('[data-story-studio-bottom]')?.textContent).not.toContain('vingt heures');
  });
});

describe('le mode Animé (#8415)', () => {
  test('la pastille ouvre la frise : une piste par objet, rails et volets retirés sauf Temps ; la refermer rend tout', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Bonjour');
    click(el.querySelector('[data-story-edit-done]'));
    const toggle = el.querySelector('[data-story-animated]')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    click(toggle);
    await flush(() => el.querySelector('[data-story-timeline]') !== null);
    expect(el.querySelector('[data-story-animated]')?.getAttribute('aria-pressed')).toBe('true');
    expect([...el.querySelectorAll('[data-story-track]')].map((track) => track.getAttribute('data-story-track'))).toEqual(['text-1']);
    expect(el.querySelector('[data-story-studio-rail="leading"]')).toBeNull();
    // Seul « Temps » reste au rail droit (#8516, `friseRail` d'iOS).
    expect([...el.querySelectorAll('[data-story-studio-rail="trailing"] [data-story-option]')].map((tile) => tile.getAttribute('data-story-option'))).toEqual(['time']);
    expect(el.querySelector('[data-story-object-move]')).toBeNull();
    expect(el.querySelector('[data-story-publish]')).not.toBeNull();
    click(el.querySelector('[data-story-animated]'));
    expect(el.querySelector('[data-story-timeline]')).toBeNull();
    expect(el.querySelector('[data-story-studio-rail="trailing"] [data-story-option="add-page"]')).not.toBeNull();
    expect(el.querySelector('[data-story-studio-rail="leading"]')).not.toBeNull();
  });

  test('la fenêtre réglée à la frise PART dans le document, avec la durée de la scène', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Bonjour');
    click(el.querySelector('[data-story-animated]'));
    await flush(() => el.querySelector('[data-story-track="text-1"]') !== null);
    // Toucher la piste SÉLECTIONNE l'objet ; toucher la RÈGLE à mi-course place
    // la tête à 3 s ; « Entre ici » y fait entrer l'objet (maquette).
    const box = { left: 0, top: 0, width: 100, height: 14, right: 100, bottom: 14, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    const track = el.querySelector<HTMLElement>('[data-story-track="text-1"]')!;
    const ruler = el.querySelector<HTMLElement>('[data-story-timeline-ruler]')!;
    track.getBoundingClientRect = () => box;
    ruler.getBoundingClientRect = () => box;
    act(() => track.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0 })));
    click(el.querySelector('[data-story-timeline-play]'));
    act(() => ruler.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50 })));
    await flush(() => el.querySelector('[data-story-timeline-enter]') !== null);
    click(el.querySelector('[data-story-timeline-enter]'));
    expect(el.querySelector('[data-story-track="text-1"]')?.getAttribute('data-story-track-start')).toBe('3');
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    const scene = (bench.posts[0]?.storyEffects as { scenes: { timelineDuration?: number; objects: { kind: string; timing?: unknown }[] }[] }).scenes[0]!;
    expect(scene.timelineDuration).toBe(6);
    expect(scene.objects.find((object) => object.kind === 'text')?.timing).toEqual({ start: 3, end: 6 });
  });

  test('éteindre Animé est un geste qu’Annuler défait : la scène redevient animée, et « Temps » rouvre sa frise', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Bonjour');
    click(el.querySelector('[data-story-edit-done]'));
    click(el.querySelector('[data-story-animated]'));
    await flush(() => el.querySelector('[data-story-timeline]') !== null);
    click(el.querySelector('[data-story-animated]'));
    expect(el.querySelector('[data-story-animated]')?.getAttribute('aria-pressed')).toBe('false');
    click(el.querySelector('[data-story-option="undo"]'));
    expect(el.querySelector('[data-story-animated]')?.getAttribute('aria-pressed')).toBe('true');
    click(el.querySelector('[data-story-option="time"]'));
    await flush(() => el.querySelector('[data-story-timeline]') !== null);
    expect(el.querySelector('[data-story-timeline-duration]')?.textContent).toBe('6');
  });
});

/** LOT 6 (directive porteur 2026-09-27 soir) — la sélection silencieuse, le
 * menu d'objet, l'édition en plaque, le sol teinté, le socle qui se retire. */
describe('lot 6 — la scène se touche sans s’entourer', () => {
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

  /** Pose une boîte peinte sur l'objet `id` et touche le calque des gestes. */
  const tapObject = (el: HTMLElement, id: string, kind: 'tap' | 'context' = 'tap') => {
    const painted = el.querySelector<HTMLElement>(`[data-scene-object-id="${id}"]`)!;
    painted.getBoundingClientRect = () => rect(10, 10, 100, 40);
    const layer = el.querySelector<HTMLElement>('[data-story-stage-gestures]')!;
    layer.setPointerCapture = () => undefined;
    if (kind === 'context') {
      act(() => layer.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 30 })));
      return;
    }
    act(() => layer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 50, clientY: 30 })));
    act(() => layer.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 50, clientY: 30 })));
  };

  test('toucher un objet le SÉLECTIONNE sans contour ni poignée ; double-tap ouvre sa plaque d’édition', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Un');
    click(el.querySelector('[data-story-option="add-text"]'));
    typeText(el, 'Deux');
    await flush(() => el.querySelectorAll('[data-scene-object-id="text-1"]').length === 1);
    tapObject(el, 'text-1');
    expect(el.querySelector<HTMLTextAreaElement>('#story-studio-text')?.dataset.storyTextTarget).toBe('text-1');
    expect(el.querySelector('[data-story-object-frame], [data-story-object-move], [data-story-object-grip]')).toBeNull();
    expect(el.querySelector('[data-story-edit-plaque]')).toBeNull();
    tapObject(el, 'text-1');
    await flush(() => el.querySelector('[data-story-edit-plaque] [data-story-object-editor="text-1"]') !== null);
    click(el.querySelector('[data-story-edit-done]'));
    expect(el.querySelector('[data-story-edit-plaque]')).toBeNull();
  });

  test('le clic droit (appui long au doigt) ouvre le menu : Dupliquer pose une copie', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Un');
    await flush(() => el.querySelector('[data-scene-object-id="text-1"]') !== null);
    tapObject(el, 'text-1', 'context');
    await flush(() => document.querySelector('[data-story-object-menu]') !== null);
    const actions = [...document.querySelectorAll('[data-story-object-menu] [data-story-object-action]')].map((a) => a.getAttribute('data-story-object-action'));
    expect(actions).toEqual(['duplicate', 'edit', 'remove']);
    click(document.querySelector('[data-story-object-action="duplicate"]'));
    expect(document.querySelector('[data-story-object-menu]')).toBeNull();
    await flush(() => el.querySelectorAll('[data-scene-text]').length === 2);
    expect(el.querySelectorAll('[data-scene-text]')).toHaveLength(2);
  });

  /** #8654 (jumelle de #8652) — un outil ouvert prend toute la place : en-tête,
   * rails et leurs (+), socle cèdent ; restent ses réglages et son (X). */
  test('un outil ouvert efface en-tête, rails et socle ; son (X) rend exactement le chrome d’avant', async () => {
    const el = mount(harness({}).deps);
    selectFile(el, 'visual', image());
    await flush(() => el.querySelector('[data-story-option="frame"]') !== null);
    const row = () => el.querySelector('[data-story-socle-row]')?.className ?? '';
    const chrome = () =>
      ['[data-story-studio-top]', '[data-story-studio-rail="leading"]', '[data-story-studio-rail="trailing"]'].map((selector) => el.querySelector(selector)?.getAttribute('data-studio-chrome'));
    expect(chrome()).toEqual(['shown', 'shown', 'shown']);
    expect(row()).not.toContain('hidden');

    click(el.querySelector('[data-story-option="frame"]'));
    await flush(() => el.querySelector('[data-story-frame-panel]') !== null);
    expect(chrome()).toEqual(['hidden', 'hidden', 'hidden']);
    expect(el.querySelector('[data-story-studio-top]')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('[data-story-studio-rail="leading"]')?.hasAttribute('inert')).toBe(true);
    expect(row().split(' ')).toContain('hidden');
    const close = el.querySelector('[data-story-frame-panel] [data-story-tool-close]');
    expect(close?.getAttribute('aria-label')).toBe('Fermer l’outil');

    click(close);
    await flush(() => el.querySelector('[data-story-frame-panel]') === null);
    expect(chrome()).toEqual(['shown', 'shown', 'shown']);
    expect(row().split(' ')).not.toContain('hidden');
  });

  test('l’édition d’un texte est un outil : le chrome cède aussi', async () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Un');
    await flush(() => el.querySelector('[data-scene-object-id="text-1"]') !== null);
    click(el.querySelector('[data-story-object-edit="text-1"]'));
    await flush(() => el.querySelector('[data-story-edit-plaque]') !== null);
    expect(el.querySelector('[data-story-studio-top]')?.getAttribute('data-studio-chrome')).toBe('hidden');
    expect(el.querySelector('[data-story-studio-rail="leading"]')?.getAttribute('data-studio-chrome')).toBe('hidden');
    click(el.querySelector('[data-story-edit-done]'));
    await flush(() => el.querySelector('[data-story-edit-plaque]') === null);
    expect(el.querySelector('[data-story-studio-top]')?.getAttribute('data-studio-chrome')).toBe('shown');
  });

  test('le Cadre « sable » teinte AUSSI le sol autour de la carte', async () => {
    const el = mount(harness({}).deps);
    selectFile(el, 'visual', image());
    click(el.querySelector('[data-story-option="frame"]'));
    await flush(() => el.querySelector('[data-story-frame-option="sand"]') !== null);
    click(el.querySelector('[data-story-frame-option="sand"]'));
    const floor = el.querySelector<HTMLElement>('[data-story-studio-floor="tint"]');
    expect(floor?.style.backgroundColor).toBe('#FDE68A');
  });
});

/** LOT 7 (retour porteur 2026-09-28, miroir de la PR iOS #8492) — le post se
 * rédige au format ARMÉ, dans un cadre de verre ; le filtre d'un média posé
 * ne touche que lui. */
describe('lot 7 — le post se rédige au format armé, dans un cadre de verre', () => {
  test('une story armée « Post » par le chevron offre « Rédiger le post »', async () => {
    const el = mount(harness({}).deps, 'STORY');
    typeText(el, 'Bonjour');
    expect(el.querySelector('[data-story-post-text]')).toBeNull();
    click(el.querySelector('[data-publish-kind-toggle]'));
    await flush(() => document.querySelector('[data-publish-kind-choice="POST"]') !== null);
    click(document.querySelector('[data-publish-kind-choice="POST"]'));
    expect(el.querySelector('[data-story-post-text]')).not.toBeNull();
  });

  test('le contenu du post s’écrit dans un cadre de VERRE posé au bas, jamais une feuille opaque', async () => {
    const el = mount(harness({}).deps, 'POST');
    typeText(el, 'Sur la scène');
    click(el.querySelector('[data-story-post-text]'));
    await flush(() => el.querySelector('[data-story-post-text-frame]') !== null);
    const frame = el.querySelector('[data-story-post-text-frame]')!;
    expect(frame.closest('[data-story-studio-bottom]')).not.toBeNull();
    expect(frame.className.split(' ')).toContain('glass');
    expect(frame.querySelector('#story-studio-post-text')).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    click(el.querySelector('[data-story-post-text-done]'));
    expect(el.querySelector('[data-story-post-text-frame]')).toBeNull();
  });
});

describe('lot 7 — le filtre d’un média posé ne s’applique qu’à lui', () => {
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

  test('l’éditeur du calque offre ses filtres ; le choisi part sur le calque seul, jamais sur le fond', async () => {
    const bench = seeded();
    const el = mount(bench.deps, 'STORY');
    await flush(() => el.querySelector('[data-story-object-edit="overlay"]') !== null);
    click(el.querySelector('[data-story-object-edit="overlay"]'));
    await flush(() => el.querySelector('[data-story-option="filter:bw"]') !== null);
    expect(el.querySelector('[data-story-option="filter:none"]')?.getAttribute('aria-pressed')).toBe('true');
    click(el.querySelector('[data-story-option="filter:bw"]'));
    expect(el.querySelector('[data-story-option="filter:bw"]')?.getAttribute('aria-pressed')).toBe('true');
    await flush(() => (el.querySelector<HTMLElement>('[data-scene-object-id="overlay"] > span')?.style.filter ?? '') !== '');
    click(publishButton(el));
    await flush(() => bench.posts.length === 1);
    const objects = (bench.posts[0]?.storyEffects as { scenes: { objects: { id: string; payload: Record<string, unknown> }[] }[] }).scenes[0]!.objects;
    expect(objects.find((object) => object.id === 'overlay')?.payload.filter).toBe('bw');
    expect(objects.find((object) => object.id === 'background')?.payload.filter).toBeUndefined();
  });

  test('l’éditeur d’une IMAGE n’offre pas « Rogner » (elle n’a pas de durée)', async () => {
    const el = mount(seeded().deps, 'STORY');
    await flush(() => el.querySelector('[data-story-object-edit="overlay"]') !== null);
    click(el.querySelector('[data-story-object-edit="overlay"]'));
    await flush(() => el.querySelector('[data-story-overlay-editor]') !== null);
    expect(el.querySelector('[data-story-option^="trim"]')).toBeNull();
  });
});
