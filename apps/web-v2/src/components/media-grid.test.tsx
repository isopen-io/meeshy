import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { messagesOf } from '@/lib/api/fixtures';
import { MEDIA_CONVERSATION_ID } from '@/lib/api/fixtures-media';
import {
  MEDIA_GRID_OVERFLOW_WITNESS_ID,
  MEDIA_GRID_PAIR_WITNESS_ID,
  MEDIA_GRID_QUAD_WITNESS_ID,
  MEDIA_GRID_TRIPLE_WITNESS_ID,
} from '@/lib/api/fixtures-media-grid';
import type { Attachment } from '@/lib/api/types';
import { sizesFor } from '@/lib/api/media-url';
import { mediaGridSlots } from '@/lib/view/media-grid-layout';

import { MediaGrid } from './media-grid';

/**
 * P0 — LA GRILLE 2/3/4+ (#6169, #6221) : le POC livrait l'implémentation
 * (commit 018573b22e) sans les témoins de COMPORTEMENT que la spécification
 * exige — ce fichier les écrit contre l'API PUBLIQUE de `MediaGrid`
 * (`items`, `onOpen`), jamais son détail interne.
 */

const attachmentsOf = (messageId: string): readonly Attachment[] => {
  const message = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === messageId);
  if (!message) throw new Error(`témoin introuvable : ${messageId}`);
  return message.attachments ?? [];
};

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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function mount(items: readonly Attachment[], onOpen: (index: number) => void): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<MediaGrid items={items} frame="box" languages={['fr']} fallbackLanguage="fr" onOpen={onOpen} />);
  });
  return container;
}

describe('MediaGrid — le compte de tuiles (#6169, critère 1)', () => {
  test('2 pièces (media-11) ⇒ 2 [data-media-tile], data-media-grid présent', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_PAIR_WITNESS_ID), () => {});
    expect(el.querySelectorAll('[data-media-tile]').length).toBe(2);
    expect(el.querySelector('[data-media-grid]') !== null).toBe(true);
  });

  test('3 pièces (media-12 : 2 images + 1 vidéo) ⇒ 3 [data-media-tile]', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_TRIPLE_WITNESS_ID), () => {});
    expect(el.querySelectorAll('[data-media-tile]').length).toBe(3);
  });

  test('4 pièces (media-13) ⇒ 4 [data-media-tile], aucun badge +N', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID), () => {});
    expect(el.querySelectorAll('[data-media-tile]').length).toBe(4);
    expect(el.querySelector('[data-overflow]') === null).toBe(true);
  });

  test('6 pièces (media-14) ⇒ 4 tuiles rendues, badge "+2" (6 − 4) sur la dernière', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_OVERFLOW_WITNESS_ID), () => {});
    expect(el.querySelectorAll('[data-media-tile]').length).toBe(4);
    const badge = el.querySelector('[data-overflow]')!;
    expect(badge !== null).toBe(true);
    expect(badge.getAttribute('data-overflow')).toBe('2');
    expect(badge.textContent).toBe('+2');
  });
});

describe('MediaGrid — tap sur la tuile k ⇒ onOpen(k) (critère 1)', () => {
  test('media-13 (4 pièces) : chaque tuile ouvre SON index, pas un autre', () => {
    const opened: number[] = [];
    const el = mount(attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID), (index) => opened.push(index));
    const tiles = Array.from(el.querySelectorAll('[data-media-tile]'));
    expect(tiles.length).toBe(4);

    act(() => {
      tiles[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(opened).toEqual([2]);

    act(() => {
      tiles[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(opened).toEqual([2, 0]);
  });

  test('media-14 (6 pièces, overflow) : la 4ᵉ tuile (voile +2) ouvre l’index 3', () => {
    const opened: number[] = [];
    const el = mount(attachmentsOf(MEDIA_GRID_OVERFLOW_WITNESS_ID), (index) => opened.push(index));
    const badge = el.querySelector('[data-overflow]')!;
    act(() => {
      badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(opened).toEqual([3]);
  });
});

describe('MediaGrid — la pièce MASQUÉE (isBlurred) occupe sa case sans rien exposer (#6189, critère 1)', () => {
  test('media-14, index 2 (3ᵉ pièce) : aucune <img>, aucun <button>, la marque protégée est posée', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_OVERFLOW_WITNESS_ID), () => {});
    const tiles = Array.from(el.querySelectorAll('[data-media-tile]'));
    const maskedTile = tiles[2]!;
    expect(maskedTile.tagName).not.toBe('BUTTON');
    expect(maskedTile.getAttribute('data-protected-attachment')).toBe('hidden');
    expect(maskedTile.querySelector('img') === null).toBe(true);
  });

  test('CONTRE-ÉPREUVE : les trois autres tuiles de media-14 restent des <button> avec <img>', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_OVERFLOW_WITNESS_ID), () => {});
    const tiles = Array.from(el.querySelectorAll('[data-media-tile]'));
    [0, 1, 3].forEach((i) => {
      expect(tiles[i]!.tagName).toBe('BUTTON');
      expect(tiles[i]!.querySelector('img') !== null).toBe(true);
    });
  });
});

describe('MediaGrid — la vidéo en grille rend un <video> réel, jamais null (#6193 puis #6221)', () => {
  test('media-12 (2 images + 1 vidéo) : le <video> est présent avec son poster', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_TRIPLE_WITNESS_ID), () => {});
    const video = el.querySelector('video');
    expect(video !== null).toBe(true);
    expect(video!.getAttribute('poster') !== null).toBe(true);
  });
});

describe('MediaGrid — témoin de RANG, PAS le rang 1 (leçon 261) : media-13, prisme [\'de\',\'fr\']', () => {
  test('les QUATRE cases servent l’allemand, aucune ne retombe sur l’anglais d’origine', () => {
    const html = renderToStaticMarkup(
      <MediaGrid items={attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID)} frame="box" languages={['de', 'fr']} fallbackLanguage="en" onOpen={() => {}} />,
    );
    for (let n = 1; n <= 4; n += 1) {
      expect(html).toContain(`Aufnahme ${n} vom Yachthafen`);
      expect(html).not.toContain(`Marina shot ${n}`);
    }
    expect(html).toMatch(/lang="de"/);
  });
});

describe('MediaGrid — `sizes` porté par chaque case, dérivé de `mediaGridSlots` (D4 §1.4.4)', () => {
  test('media-11 (2 pièces) : chaque <img> porte sizes="<largeur-de-case>px"', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_PAIR_WITNESS_ID), () => {});
    const slots = mediaGridSlots(2);
    const imgs = Array.from(el.querySelectorAll('img'));
    expect(imgs.length).toBe(2);
    imgs.forEach((img, i) => {
      expect(img.getAttribute('sizes')).toBe(sizesFor(slots[i]!.width));
    });
  });
});

/**
 * `GridCellImage` — l'ÉCHEC de décodage d'une case de grille (#6882).
 *
 * Avant ce lot, seule `ImageTile` (la case SOLO) masquait l'`<img>` en échec
 * pour révéler un glyphe de repli (#5805, `attachment-blocks.test.tsx`) ;
 * `GridCellImage`, montée pour TOUTE grille 2/3/4+, n'avait aucune prise sur
 * `onError` — un message à plusieurs pièces dont une manque au stockage
 * (staging, #6882 : trois pièces jointes référencées en base mais absentes
 * du stockage) rendait l'icône « image brisée » native du navigateur au
 * lieu du glyphe de repli. Ce témoin verrouille la parité.
 */
describe('MediaGrid — l’image en ÉCHEC de décodage dans une case de grille (#6882)', () => {
  test('onError masque l’<img> de la case en échec et découvre son glyphe de repli, sans toucher aux cases saines', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_PAIR_WITNESS_ID), () => {});
    const tiles = Array.from(el.querySelectorAll('[data-media-tile]'));
    expect(tiles.length).toBe(2);
    const [failingTile, healthyTile] = tiles as [HTMLElement, HTMLElement];
    const failingImg = failingTile.querySelector('img')!;
    const healthyImg = healthyTile.querySelector('img')!;

    expect(failingImg.hidden).toBe(false);
    expect(failingTile.querySelector('svg') !== null).toBe(true);

    act(() => {
      failingImg.dispatchEvent(new Event('error'));
    });

    expect(failingImg.hidden).toBe(true);
    expect(failingTile.querySelector('svg') !== null).toBe(true);
    // La tuile reste ouvrable — perdre le fichier n'éteint pas l'accès à la visionneuse.
    expect(failingTile.tagName).toBe('BUTTON');
    expect(failingTile.getAttribute('aria-label')).not.toBeNull();

    // Contre-épreuve : la case saine, à côté, n'a pas bougé.
    expect(healthyImg.hidden).toBe(false);
  });
});

/**
 * U4 (#6169) — LA BOÎTE PORTE SES COTES DÉRIVÉES, AU STYLE (ce que G1 mesure
 * au pixel dans un vrai navigateur, ici au `style` posé par `mediaGridSlots`
 * — un témoin unitaire qui rougirait AVANT tout gate DOM si l'arithmétique
 * dérivait).
 */
describe('MediaGrid — la boîte porte ses cotes dérivées (U4, #6169)', () => {
  test('media-11 (2 pièces) : 300 × 180', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_PAIR_WITNESS_ID), () => {});
    const grid = el.querySelector('[data-media-grid]') as HTMLElement;
    expect(grid.style.width).toBe('300px');
    expect(grid.style.height).toBe('180px');
  });

  test('media-12 (3 pièces) : 300 × 240', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_TRIPLE_WITNESS_ID), () => {});
    const grid = el.querySelector('[data-media-grid]') as HTMLElement;
    expect(grid.style.width).toBe('300px');
    expect(grid.style.height).toBe('240px');
  });

  test('media-13 (4 pièces) : 300 × 240', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID), () => {});
    const grid = el.querySelector('[data-media-grid]') as HTMLElement;
    expect(grid.style.width).toBe('300px');
    expect(grid.style.height).toBe('240px');
  });

  test('media-14 (6 pièces, 4 rendues) : 300 × 240', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_OVERFLOW_WITNESS_ID), () => {});
    const grid = el.querySelector('[data-media-grid]') as HTMLElement;
    expect(grid.style.width).toBe('300px');
    expect(grid.style.height).toBe('240px');
  });
});
