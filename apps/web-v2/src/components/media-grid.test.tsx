import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { messagesOf } from '@/lib/api/fixtures';
import { MEDIA_CONVERSATION_ID } from '@/lib/api/fixtures-media';
import {
  MEDIA_GRID_MINE_WITNESS_ID,
  MEDIA_GRID_OVERFLOW_WITNESS_ID,
  MEDIA_GRID_PAIR_WITNESS_ID,
  MEDIA_GRID_QUAD_WITNESS_ID,
  MEDIA_GRID_TRIPLE_WITNESS_ID,
  MEDIA_SOLO_VIDEO_WITNESS_ID,
} from '@/lib/api/fixtures-media-grid';
import type { Attachment } from '@/lib/api/types';
import { sizesFor } from '@/lib/api/media-url';
import { mediaGridCellSizes, mediaGridSlots, soloVideoSlot } from '@/lib/view/media-grid-layout';

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
  /**
   * #7030 (relecture adversariale, PAS jouée avant fusion) — `height` FIXE
   * était le défaut : la boîte est plafonnée à `100 %` de son porteur
   * (#7018), donc sa largeur RENDUE rétrécit dès que le porteur est plus
   * étroit que 300 px (223,4 px en Bulles, mesuré) — une `height` littérale
   * ne suit pas, chaque case shrinkée par flex-shrink se retrouve sous une
   * hauteur inchangée : `110,7 × 180` au lieu de `110,7 × 134,0`. Même motif
   * que la vidéo SEULE (#7016, ci-dessus) : `width` + `aspectRatio`, JAMAIS
   * `height`, pour que la hauteur DESCENDE avec la largeur plafonnée.
   */
  test('media-11 (2 pièces) : largeur 300, forme 300 / 180 — jamais une hauteur figée', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_PAIR_WITNESS_ID), () => {});
    const grid = el.querySelector('[data-media-grid]') as HTMLElement;
    expect(grid.style.width).toBe('300px');
    expect(grid.style.height).toBe('');
    expect(grid.style.aspectRatio).toBe('300 / 180');
  });

  test('media-12 (3 pièces) : largeur 300, forme 300 / 240 — jamais une hauteur figée', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_TRIPLE_WITNESS_ID), () => {});
    const grid = el.querySelector('[data-media-grid]') as HTMLElement;
    expect(grid.style.width).toBe('300px');
    expect(grid.style.height).toBe('');
    expect(grid.style.aspectRatio).toBe('300 / 240');
  });

  test('media-13 (4 pièces) : largeur 300, forme 300 / 240 — jamais une hauteur figée', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID), () => {});
    const grid = el.querySelector('[data-media-grid]') as HTMLElement;
    expect(grid.style.width).toBe('300px');
    expect(grid.style.height).toBe('');
    expect(grid.style.aspectRatio).toBe('300 / 240');
  });

  test('media-14 (6 pièces, 4 rendues) : largeur 300, forme 300 / 240 — jamais une hauteur figée', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_OVERFLOW_WITNESS_ID), () => {});
    const grid = el.querySelector('[data-media-grid]') as HTMLElement;
    expect(grid.style.width).toBe('300px');
    expect(grid.style.height).toBe('');
    expect(grid.style.aspectRatio).toBe('300 / 240');
  });

  /**
   * LA CASE, PAS SEULEMENT LA BOÎTE — SUR LES TROIS AGENCEMENTS (#7030,
   * seconde relecture).
   *
   * La boîte peut suivre sa forme sans que les cases suivent la LEUR. La
   * première écriture de ce témoin n'instrumentait que la paire et la case
   * GAUCHE du triplet, faute d'une hauteur de case dans `mediaGridSlots` (qui
   * porte, par contrat, la hauteur de la BOÎTE sur chaque case). Elle laissait
   * donc SANS témoin de forme le QUADRUPLE — deux rangées `1fr 1fr`, un
   * mécanisme qu'aucune des deux cases couvertes n'exerce, et le seul dont la
   * hauteur de rangée dépend désormais de la largeur servie — alors que
   * `expectNoTileClipped`, dans le gate navigateur, énonce trois lignes plus
   * haut la règle inverse : « sur les QUATRE, jamais sur le seul quadruple ».
   *
   * `mediaGridCellSizes` (la dérivation manquante) rend cette hauteur ; chaque
   * case la porte, et le gate navigateur compare le ratio RENDU à celui-là.
   */
  const expectEveryCellCarriesItsDesignSize = (witnessId: string, count: number) => {
    const el = mount(attachmentsOf(witnessId), () => {});
    const cells = mediaGridCellSizes(count);
    const carriers = Array.from(el.querySelectorAll('[data-slot-width]')) as HTMLElement[];
    expect(carriers.length).toBe(cells.length);
    carriers.forEach((carrier, i) => {
      expect(carrier.getAttribute('data-slot-width')).toBe(String(cells[i]!.width));
      expect(carrier.getAttribute('data-slot-height')).toBe(String(cells[i]!.height));
    });
  };

  test('media-11 (paire) : les DEUX cases portent leur forme rendue', () => {
    expectEveryCellCarriesItsDesignSize(MEDIA_GRID_PAIR_WITNESS_ID, 2);
  });

  test('media-12 (triplet) : les TROIS cases portent leur forme rendue, les empilées comprises', () => {
    expectEveryCellCarriesItsDesignSize(MEDIA_GRID_TRIPLE_WITNESS_ID, 3);
  });

  test('media-13 (quadruple, `1fr 1fr`) : les QUATRE cases portent leur forme rendue', () => {
    expectEveryCellCarriesItsDesignSize(MEDIA_GRID_QUAD_WITNESS_ID, 4);
  });

  /**
   * `media-14` — SIX pièces dont une MASQUÉE. La case masquée rend son
   * substitut (`MaskedAttachment`), jamais la case de grille : elle ne porte
   * donc aucune cote, et ce témoin le DIT plutôt que de le subir — c'est ce
   * qui interdit au gate navigateur d'indexer les cases par position.
   */
  test('media-14 (6 pièces, 4 rendues, 1 masquée) : seules les cases NON masquées portent leur forme', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_OVERFLOW_WITNESS_ID), () => {});
    const cells = mediaGridCellSizes(6);
    const carriers = Array.from(el.querySelectorAll('[data-slot-width]')) as HTMLElement[];
    expect(el.querySelectorAll('[data-protected-attachment]').length).toBe(1);
    expect(carriers.length).toBe(cells.length - 1);
    for (const carrier of carriers) {
      expect(carrier.getAttribute('data-slot-width')).toBe(String(cells[0]!.width));
      expect(carrier.getAttribute('data-slot-height')).toBe(String(cells[0]!.height));
    }
  });
});

/**
 * #7016 — LA VIDÉO SEULE PORTE ENFIN SES COTES.
 *
 * La branche SOLO rendait `VideoTile` SANS conteneur dimensionné, alors que sa
 * racine est `size-full` avec tous ses enfants `absolute inset-0` : un
 * `height: 100 %` contre un parent en hauteur `auto` se résout en `auto` →
 * contenu → **ZÉRO**. Mesuré au navigateur avant ce lot, dans les deux peaux :
 * `{focal: 246 × 0, bulles: 119 × 0}`.
 *
 * La loi qui dimensionne cette tuile — `soloVideoSlot` — existait, était
 * testée (`media-grid-layout.test.ts`) et gardée par le gate de cotes
 * (`curve-media-grid.mjs`), et n'avait AUCUN site d'appel : le motif « une loi
 * qui calcule une valeur que personne ne lit ». Ce témoin est sa PROJECTION —
 * il compare le style posé à ce que la loi rend, jamais à un littéral recopié
 * (qui divergerait en silence le jour où la loi change).
 *
 * `aspectRatio` plutôt que `height` : la boîte est plafonnée à `100 %` de son
 * porteur (#7018), donc sa largeur RENDUE dépend de la peau. Le couple
 * `width` + `aspectRatio` fait descendre la hauteur AVEC la largeur ; un
 * `height` figé, lui, déformerait la vidéo dès que le porteur est plus étroit
 * que 300 px — ce qui est le cas NOMINAL de la bulle (253,4 px à 390 px).
 */
describe('MediaGrid — la vidéo SEULE porte les cotes de soloVideoSlot (#7016)', () => {
  test('media-15 : la tuile est dimensionnée — jamais une hauteur nulle', () => {
    const el = mount(attachmentsOf(MEDIA_SOLO_VIDEO_WITNESS_ID), () => {});
    const tile = el.querySelector('[data-media-tile]') as HTMLElement;
    const slot = soloVideoSlot(160 / 90);
    expect(slot.width).toBe(300);
    expect(slot.height).toBe(168.75);
    expect(tile.style.width).toBe(`${slot.width}px`);
    expect(tile.style.aspectRatio).toBe(`${slot.width} / ${slot.height}`);
    expect(tile.style.maxWidth).toBe('100%');
  });

  test('media-15 : le <video> est monté sous cette boîte, avec son poster', () => {
    const el = mount(attachmentsOf(MEDIA_SOLO_VIDEO_WITNESS_ID), () => {});
    const tile = el.querySelector('[data-media-tile]') as HTMLElement;
    const video = tile.querySelector('video');
    expect(video !== null).toBe(true);
    expect(video!.getAttribute('poster') !== null).toBe(true);
  });

  test('CONTRE-ÉPREUVE : en GRILLE la vidéo ne se dimensionne PAS elle-même — la case la dimensionne (media-12)', () => {
    const el = mount(attachmentsOf(MEDIA_GRID_TRIPLE_WITNESS_ID), () => {});
    const videoTile = el.querySelector('video')!.closest('[data-media-tile]') as HTMLElement;
    expect(videoTile.style.width).toBe('');
    expect(videoTile.style.aspectRatio).toBe('');
  });
});

/**
 * #7018 — LA BOÎTE DE GRILLE NE SORT PLUS DE SON PORTEUR.
 *
 * `ImageTile` porte `max-w-full` depuis toujours ; la boîte de `MediaGrid`, à
 * largeur FIXE de 300 px, ne le portait pas. Dans une bulle dont la largeur
 * utile est 253,4 px (390 px de viewport, `max-w-[70%]` + gouttière de 50 px),
 * elle débordait de 46,6 px — vers la gouttière sur un message REÇU (invisible),
 * HORS DE L'ÉCRAN sur un message DE MOI (`justify-end`), rendant tout le fil
 * défilable horizontalement (`scrollWidth` 437 pour `clientWidth` 390, mesuré).
 */
describe('MediaGrid — la boîte ne déborde jamais de son porteur (#7018)', () => {
  const grilles: readonly (readonly [string, string])[] = [
    ['media-11 (2 pièces)', MEDIA_GRID_PAIR_WITNESS_ID],
    ['media-12 (3 pièces)', MEDIA_GRID_TRIPLE_WITNESS_ID],
    ['media-13 (4 pièces)', MEDIA_GRID_QUAD_WITNESS_ID],
    ['media-14 (6 pièces)', MEDIA_GRID_OVERFLOW_WITNESS_ID],
    ['media-16 (2 pièces, DE MOI)', MEDIA_GRID_MINE_WITNESS_ID],
  ];

  grilles.forEach(([label, id]) => {
    test(`${label} : la boîte est plafonnée à 100 % de son porteur`, () => {
      const el = mount(attachmentsOf(id), () => {});
      const grid = el.querySelector('[data-media-grid]') as HTMLElement;
      expect(grid.style.width).toBe('300px');
      expect(grid.style.maxWidth).toBe('100%');
    });
  });
});
