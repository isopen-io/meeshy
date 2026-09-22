import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { scriptedGateway } from '@/test-support/scripted-transport';
import { messagesOf } from '@/lib/api/fixtures';
import { POST_SCENE_CLIP_A, POST_SCENE_TEXT, POST_SCENES_MIXED } from '@/lib/api/fixtures-feed';
import { MEDIA_CONVERSATION_ID } from '@/lib/api/fixtures-media';
import {
  MEDIA_GRID_OVERFLOW_WITNESS_ID,
  MEDIA_GRID_QUAD_WITNESS_ID,
  MEDIA_GRID_TRIPLE_WITNESS_ID,
} from '@/lib/api/fixtures-media-grid';
import type { Attachment } from '@/lib/api/types';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { composeSceneGalleryLot } from '@/lib/feed/gallery-lot';

import type { MediaCarrier } from '@/lib/view/media';

import MediaViewer from './media-viewer';

/**
 * P0 — LA VISIONNEUSE PLEIN ÉCRAN (#6169, #6221) : le POC livrait
 * l'implémentation (commit 018573b22e) sans les témoins de COMPORTEMENT que
 * la spécification exige — ouverture au bon index, pellicule qui marque
 * l'index courant, fermeture Échap/retour matériel, piège à focus, et la
 * pièce MASQUÉE qui reste masquée même une fois DANS la visionneuse (une
 * question distincte de celle tranchée pour `MediaGrid` : ici `items` est le
 * tableau `visual` ENTIER, la pièce masquée occupant sa position — D-41 —
 * et restant atteignable par une flèche/la pellicule depuis une page voisine).
 */

const attachmentsOf = (messageId: string): readonly Attachment[] => {
  const message = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === messageId);
  if (!message) throw new Error(`témoin introuvable : ${messageId}`);
  return message.attachments ?? [];
};

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  // Le moteur de scène est chargé À LA DEMANDE (`lazy`, `viewer-scene-page.tsx`)
  // — pré-chauffé ici pour que le PREMIER témoin de la nature scène ne paie
  // pas seul la compilation (même motif que `feed-scene-surface.test.tsx`).
  await import('./scene-player');
  // La page VIDÉO ACTIVE déclenche un `toggle()` (donc `element.play()`) DÈS
  // le montage (`ViewerVideoPage`, effet `isActive`) — jamais après un clic,
  // à la différence de `VideoTile`. Impossible de stubber l'ÉLÉMENT après
  // coup (l'effet tourne dans le MÊME `act()` que le premier rendu) : on
  // stubbe le PROTOTYPE, une fois, pour tout ce fichier.
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  };
  HTMLMediaElement.prototype.load = function load(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('emptied'));
  };
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
  document.body.removeAttribute('id');
});

/** La page COURANTE (`distance === 0`, `translateX(0%)`) — DISTINCTE des pages voisines préchargées, qui portent aussi `data-full-pixels="true"`. */
function currentPage(body: HTMLElement): HTMLElement {
  const pages = Array.from(body.querySelectorAll<HTMLElement>('[data-viewer-page]'));
  const found = pages.find((p) => p.style.transform === 'translateX(0%)');
  if (found === undefined) throw new Error('page courante introuvable');
  return found;
}

function mount(params: {
  readonly items: readonly Attachment[];
  readonly startIndex: number;
  readonly onClose: () => void;
  readonly carrier?: MediaCarrier;
  readonly isMine?: boolean;
  readonly deps?: ReturnType<typeof scriptedGateway>['deps'];
}): HTMLElement {
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <MediaViewer
        items={params.items}
        startIndex={params.startIndex}
        onClose={params.onClose}
        languages={['fr']}
        fallbackLanguage="fr"
        {...(params.carrier !== undefined ? { carrier: params.carrier } : {})}
        {...(params.isMine !== undefined ? { isMine: params.isMine } : {})}
        {...(params.deps !== undefined ? { deps: params.deps } : {})}
      />,
    );
  });
  // `createPortal(..., document.body)` : le dialogue vit HORS `container`.
  return document.body;
}

describe('MediaViewer — ouverture au bon index, la pellicule le marque (critère 1)', () => {
  test('startIndex=2 (media-13, 4 images) ⇒ data-viewer-index="2", filmstrip aria-current sur la 3ᵉ vignette', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 2, onClose: () => {} });

    const dialog = body.querySelector('[data-media-viewer]')!;
    expect(dialog.getAttribute('data-viewer-index')).toBe('2');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const filmstripItems = Array.from(body.querySelectorAll('[data-filmstrip-item]'));
    expect(filmstripItems.length).toBe(4);
    expect(filmstripItems[2]!.getAttribute('aria-current')).toBe('true');
    expect(filmstripItems[0]!.getAttribute('aria-current') === null).toBe(true);
  });

  test('clic sur la pellicule à l’index 0 déplace la page ET l’aria-current', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 2, onClose: () => {} });
    const filmstripItems = Array.from(body.querySelectorAll('[data-filmstrip-item]'));

    act(() => {
      filmstripItems[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(body.querySelector('[data-media-viewer]')!.getAttribute('data-viewer-index')).toBe('0');
    const after = Array.from(body.querySelectorAll('[data-filmstrip-item]'));
    expect(after[0]!.getAttribute('aria-current')).toBe('true');
  });

  test('une seule pièce ⇒ AUCUNE pellicule (`+Geometry.swift:88-102`)', () => {
    const items = [attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID)[0]!];
    const body = mount({ items, startIndex: 0, onClose: () => {} });
    expect(body.querySelector('[data-filmstrip]') === null).toBe(true);
  });

  /**
   * #6345 — défiler la pellicule À LA MAIN choisissait sa propre tête de
   * lecture (l'effet `scrollLeft = filmstripScrollOffset`) mais n'avait AUCUN
   * effet retour sur le média affiché : `onScroll` n'existait pas. Miroir
   * `ConversationMediaFilmstrip` iOS 17+ (`modernStrip`,
   * `scrollPosition(id:anchor:)`).
   */
  test('défiler la pellicule à la main (scrollLeft=179) amène l’index 3 sous la tête de lecture, et la scène le montre', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 0, onClose: () => {} });
    const track = body.querySelector('[data-filmstrip]') as HTMLElement;

    act(() => {
      track.scrollLeft = 179; // filmstripIndexAtPlayhead(179, 4) === 3 (media-stage.test.ts)
      track.dispatchEvent(new Event('scroll', { bubbles: false }));
    });

    expect(body.querySelector('[data-media-viewer]')!.getAttribute('data-viewer-index')).toBe('3');
    const filmstripItems = Array.from(body.querySelectorAll('[data-filmstrip-item]'));
    expect(filmstripItems[3]!.getAttribute('aria-current')).toBe('true');
  });

  test('un défilement qui reste sous le média COURANT ne bouge rien (pas de sélection à vide)', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 2, onClose: () => {} });
    const track = body.querySelector('[data-filmstrip]') as HTMLElement;

    act(() => {
      track.scrollLeft = 118; // filmstripIndexAtPlayhead(118, 4) === 2, identique à startIndex
      track.dispatchEvent(new Event('scroll', { bubbles: false }));
    });

    expect(body.querySelector('[data-media-viewer]')!.getAttribute('data-viewer-index')).toBe('2');
  });

  /**
   * #6345 — `FILMSTRIP_RESERVED_HEIGHT` (80, border-box) était calculée et
   * testée dans `media-stage.ts` mais n'avait aucun consommateur : le plateau
   * ne réservait que 70px (padding asymétrique). Miroir
   * `.frame(height: FilmstripMetrics.reservedHeight)` côté iOS.
   */
  test('la bande réserve 80px en border-box (FILMSTRIP_RESERVED_HEIGHT, miroir iOS)', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 0, onClose: () => {} });
    const track = body.querySelector('[data-filmstrip]') as HTMLElement;

    expect(track.style.height).toBe('80px');
    expect(track.classList.contains('box-border')).toBe(true);
  });
});

describe('MediaViewer — fermeture (critère « Escape/retour ferme »)', () => {
  test('Escape ⇒ onClose()', () => {
    let closed = 0;
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 0, onClose: () => (closed += 1) });
    const dialog = body.querySelector('[data-media-viewer]')!;

    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    expect(closed).toBe(1);
  });

  test('popstate (retour matériel) ⇒ onClose() — useBackDismiss', () => {
    let closed = 0;
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    mount({ items, startIndex: 0, onClose: () => (closed += 1) });

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(closed).toBe(1);
  });

  test('ArrowRight/ArrowLeft paginent sans fermer', () => {
    let closed = 0;
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 1, onClose: () => (closed += 1) });
    const dialog = body.querySelector('[data-media-viewer]')!;

    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });
    expect(body.querySelector('[data-media-viewer]')!.getAttribute('data-viewer-index')).toBe('2');

    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
    });
    expect(body.querySelector('[data-media-viewer]')!.getAttribute('data-viewer-index')).toBe('1');
    expect(closed).toBe(0);
  });
});

describe('MediaViewer — le piège à focus (`focus-trap.ts`)', () => {
  test('Tab depuis le dernier focalisable revient au premier', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 0, onClose: () => {} });
    const dialog = body.querySelector('[data-media-viewer]')!;
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')).filter(
      (el) => !el.hasAttribute('disabled'),
    );
    expect(focusables.length).toBeGreaterThan(1);
    const last = focusables[focusables.length - 1]!;
    last.focus();
    expect(document.activeElement).toBe(last);

    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
    });
    expect(document.activeElement).toBe(focusables[0]);
  });

  test('#root est INERT pendant l’ouverture, relâché à la fermeture', () => {
    let closed = 0;
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    mount({ items, startIndex: 0, onClose: () => (closed += 1) });
    const rootEl = document.getElementById('root')!;
    expect(rootEl.hasAttribute('inert')).toBe(true);

    act(() => {
      root.unmount();
    });
    expect(rootEl.hasAttribute('inert')).toBe(false);
  });
});

/**
 * LA BARRE DE LECTURE DANS LA VISIONNEUSE (#6359) — miroir
 * `transportCorridor` et `cadreCenterPlayPause`
 * (`ConversationMediaGalleryView+Transport.swift`) : la barre vit dans le
 * COULOIR BAS, le play/pause au centre du média. `media-12` = [image, image,
 * vidéo de 7 000 ms].
 */
describe('MediaViewer — la barre de lecture d’une vidéo (#6359)', () => {
  const tripleVideoIndex = (): { readonly items: readonly Attachment[]; readonly videoIndex: number } => {
    const items = attachmentsOf(MEDIA_GRID_TRIPLE_WITNESS_ID);
    return { items, videoIndex: items.findIndex((a) => a.mimeType.startsWith('video/')) };
  };

  const corridor = (body: HTMLElement): HTMLElement => body.querySelector<HTMLElement>('[data-viewer-transport-slot]')!;

  /**
   * La barre est un chunk À LA DEMANDE (`lazy`) : on attend que son module
   * soit résolu et que `Suspense` ait rendu, exactement comme la page le fait
   * en production — jamais un `setTimeout` au jugé.
   */
  async function mountVideo(): Promise<{ readonly body: HTMLElement; readonly videoIndex: number }> {
    const { items, videoIndex } = tripleVideoIndex();
    const body = mount({ items, startIndex: videoIndex, onClose: () => {} });
    await act(async () => {
      await import('./media-transport');
    });
    return { body, videoIndex };
  }

  async function loadActiveVideo(body: HTMLElement, seconds: number): Promise<HTMLVideoElement> {
    const video = currentPage(body).querySelector('video')!;
    await act(async () => {
      Object.defineProperty(video, 'duration', { value: seconds, configurable: true });
      Object.defineProperty(video, 'currentTime', { value: 0, configurable: true, writable: true });
      video.dispatchEvent(new Event('loadedmetadata'));
    });
    return video;
  }

  test('avant ses métadonnées, le couloir bas montre la durée de la PIÈCE, sans piste', async () => {
    const { body } = await mountVideo();

    expect(corridor(body).querySelector('[role="slider"]')).toBeNull();
    expect(corridor(body).textContent).toContain('0:07');
  });

  test('une fois la durée connue, la piste vit dans le couloir bas, jamais sur le média', async () => {
    const { body } = await mountVideo();
    await loadActiveVideo(body, 7);

    expect(corridor(body).querySelector('[role="slider"]')).not.toBeNull();
    expect(currentPage(body).querySelector('[role="slider"]')).toBeNull();
  });

  test('les flèches du curseur parcourent la vidéo et ne changent pas de page', async () => {
    const { body, videoIndex } = await mountVideo();
    const video = await loadActiveVideo(body, 60);

    await act(async () => {
      corridor(body).querySelector('[role="slider"]')!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
    });
    await act(async () => {
      corridor(body).querySelector('[role="slider"]')!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });

    expect(body.querySelector('[data-media-viewer]')!.getAttribute('data-viewer-index')).toBe(String(videoIndex));
    expect(video.currentTime).toBe(10);
  });

  test('le play/pause au centre met en pause puis relance, sans basculer le plateau', async () => {
    const { body } = await mountVideo();
    const topCorridor = body.querySelector<HTMLElement>('[data-media-viewer] > div')!;

    const pause = currentPage(body).querySelector<HTMLButtonElement>('button[aria-label="Pause"]');
    expect(pause).not.toBeNull();

    await act(async () => {
      pause!.click();
    });
    const play = currentPage(body).querySelector<HTMLButtonElement>('button[aria-label="Lire la vidéo"]');
    expect(play).not.toBeNull();
    expect(topCorridor.style.opacity).toBe('1');

    await act(async () => {
      play!.click();
    });
    expect(currentPage(body).querySelector('button[aria-label="Pause"]')).not.toBeNull();
  });

  test('toucher le muet ou « ⋯ » agit sur la vidéo sans basculer le plateau en plein cadre', async () => {
    const { body } = await mountVideo();
    const video = await loadActiveVideo(body, 60);
    const topCorridor = body.querySelector<HTMLElement>('[data-media-viewer] > div')!;
    const buttonIn = (label: string): HTMLButtonElement =>
      Array.from(corridor(body).querySelectorAll<HTMLButtonElement>('button')).find((b) => b.getAttribute('aria-label') === label)!;

    // L'opacité se lit APRÈS CHAQUE geste : deux bascules du plateau
    // s'annulent, et une lecture unique en fin de test resterait verte
    // précisément quand chaque clic remonte jusqu'à la scène.
    await act(async () => {
      buttonIn('Couper le son').click();
    });
    expect(video.muted).toBe(true);
    expect(topCorridor.style.opacity).toBe('1');

    await act(async () => {
      buttonIn("Plus d'options").click();
    });
    expect(corridor(body).querySelector('[role="menu"]')).not.toBeNull();
    expect(topCorridor.style.opacity).toBe('1');
  });

  test('Espace sur un bouton de la barre l’active, sans remonter au raccourci lecture/pause de la visionneuse', async () => {
    const { body } = await mountVideo();
    await loadActiveVideo(body, 60);
    const mute = Array.from(corridor(body).querySelectorAll<HTMLButtonElement>('button')).find((b) => b.getAttribute('aria-label') === 'Couper le son')!;
    expect(currentPage(body).querySelector('button[aria-label="Pause"]')).not.toBeNull();

    await act(async () => {
      mute.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
    });

    expect(currentPage(body).querySelector('button[aria-label="Pause"]')).not.toBeNull();
  });

  test('CONTRE-ÉPREUVE : une page IMAGE n’a ni barre, ni play/pause, ni ligne de progression décorative', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 0, onClose: () => {} });

    expect(body.querySelector('[data-media-transport]')).toBeNull();
    expect(body.querySelector('.media-viewer-progress-track')).toBeNull();
    expect(currentPage(body).querySelector('button')).toBeNull();
  });
});

describe('MediaViewer — le double tap latéral, ±10 s comme iOS (#6369)', () => {
  function stageWithRect(body: HTMLElement, width: number): HTMLElement {
    const stage = currentPage(body).firstElementChild as HTMLElement;
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width, height: 600, right: width, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
    return stage;
  }

  async function mountActiveVideo(duration: number, position = 60): Promise<{ readonly body: HTMLElement; readonly video: HTMLVideoElement }> {
    const items = attachmentsOf(MEDIA_GRID_TRIPLE_WITNESS_ID);
    const videoIndex = items.findIndex((a) => a.mimeType.startsWith('video/'));
    const body = mount({ items, startIndex: videoIndex, onClose: () => {} });
    const video = currentPage(body).querySelector('video')!;
    await act(async () => {
      Object.defineProperty(video, 'duration', { value: duration, configurable: true });
      Object.defineProperty(video, 'currentTime', { value: position, configurable: true, writable: true });
      video.dispatchEvent(new Event('loadedmetadata'));
      // `lateralSeek` lit `playback.position` — le hook ne le connaît QUE via
      // `timeupdate` (`use-media-playback.ts`, `emitPosition`) : poser
      // `currentTime` sans l'émettre laisserait la position à zéro.
      video.dispatchEvent(new Event('timeupdate'));
    });
    return { body, video };
  }

  const doubleClickAt = (stage: HTMLElement, clientX: number): void => {
    stage.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX, clientY: 300 }));
  };

  test('un double tap au tiers GAUCHE recule la lecture de 10 s', async () => {
    const { body, video } = await mountActiveVideo(180);
    const stage = stageWithRect(body, 300);

    await act(async () => {
      doubleClickAt(stage, 40);
    });

    expect(video.currentTime).toBe(50);
  });

  test('un double tap au tiers DROIT avance la lecture de 10 s', async () => {
    const { body, video } = await mountActiveVideo(180);
    const stage = stageWithRect(body, 300);

    await act(async () => {
      doubleClickAt(stage, 260);
    });

    expect(video.currentTime).toBe(70);
  });

  test('un double tap au CENTRE ne déplace pas la lecture — aucun double tap n’y est armé, le tap simple garde son effet immédiat', async () => {
    const { body, video } = await mountActiveVideo(180);
    const stage = stageWithRect(body, 300);

    await act(async () => {
      doubleClickAt(stage, 150);
    });

    expect(video.currentTime).toBe(60);
  });

  test('le saut RESTE borné aux extrémités de la piste', async () => {
    const { body, video } = await mountActiveVideo(65, 4);
    const stage = stageWithRect(body, 300);

    await act(async () => {
      doubleClickAt(stage, 40);
    });

    expect(video.currentTime).toBe(0);
  });

  test('CONTRE-ÉPREUVE : un double tap latéral sur une page IMAGE ne bouge rien — sans durée, aucune zone ne se réclame, le zoom garde le geste', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 0, onClose: () => {} });
    const img = currentPage(body).querySelector('img')!;

    act(() => {
      img.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 20 }));
    });

    expect(img.style.transform).toBe('scale(2.5)');
  });
});

describe('MediaViewer — la vidéo rend un <video> réel avec poster, jamais null', () => {
  test('media-12 : la page active sur l’index vidéo porte un <video poster>', () => {
    const items = attachmentsOf(MEDIA_GRID_TRIPLE_WITNESS_ID); // [image, image, vidéo]
    const videoIndex = items.findIndex((a) => a.mimeType.startsWith('video/'));
    expect(videoIndex).toBeGreaterThanOrEqual(0);
    const body = mount({ items, startIndex: videoIndex, onClose: () => {} });

    const video = body.querySelector('[data-viewer-page] video');
    expect(video !== null).toBe(true);
    expect(video!.getAttribute('poster') !== null).toBe(true);
  });
});

/**
 * LA PIÈCE MASQUÉE, ATTEINTE DEPUIS LA VISIONNEUSE (#6189, cycle 125 —
 * « une protection de contenu se mesure sur tout ce que la charge
 * TRANSPORTE »). `MediaGrid` ne pose aucun bouton sur cette case (témoin
 * `media-grid.test.tsx`), mais `items` porte la pièce à SA position (D-41) :
 * une flèche ou un tap sur la pellicule depuis une page VOISINE l'atteint
 * quand même. Défaut mesuré AVANT ce lot : ni `ViewerImagePage/VideoPage` ni
 * `MediaFilmstrip` ne consultaient `maskedAttachment` — la case active
 * rendait le vrai `<img>` (l'URL en clair), et la vignette de la pellicule
 * aussi.
 */
describe('MediaViewer — la pièce MASQUÉE reste masquée dans la visionneuse (#6189)', () => {
  test('naviguer sur l’index masqué (media-14, index 2) : aucune <img> de la pièce, la marque protégée est posée', () => {
    const items = attachmentsOf(MEDIA_GRID_OVERFLOW_WITNESS_ID);
    expect(items[2]!.isBlurred).toBe(true);
    const body = mount({ items, startIndex: 1, onClose: () => {} });
    const dialog = body.querySelector('[data-media-viewer]')!;

    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });

    expect(body.querySelector('[data-media-viewer]')!.getAttribute('data-viewer-index')).toBe('2');
    const activePage = currentPage(body);
    expect(activePage.querySelector('img') === null).toBe(true);
    expect(activePage.querySelector('[data-protected-attachment="hidden"]') !== null).toBe(true);
  });

  test('la vignette de la pellicule pour cet index NE PORTE AUCUNE <img> (la vignette est une fuite de contenu, cycle 125)', () => {
    const items = attachmentsOf(MEDIA_GRID_OVERFLOW_WITNESS_ID);
    const body = mount({ items, startIndex: 0, onClose: () => {} });
    const filmstripItems = Array.from(body.querySelectorAll('[data-filmstrip-item]'));
    expect(filmstripItems.length).toBe(items.length);
    const maskedThumb = filmstripItems[2]!;
    expect(maskedThumb.querySelector('img') === null).toBe(true);
    expect(maskedThumb.getAttribute('data-protected-attachment')).toBe('hidden');
  });

  test('CONTRE-ÉPREUVE : une pièce CLAIRE voisine (index 1) rend bien son <img> dans la page ET la pellicule', () => {
    const items = attachmentsOf(MEDIA_GRID_OVERFLOW_WITNESS_ID);
    const body = mount({ items, startIndex: 1, onClose: () => {} });
    const activePage = currentPage(body);
    expect(activePage.querySelector('img') !== null).toBe(true);
    const filmstripItems = Array.from(body.querySelectorAll('[data-filmstrip-item]'));
    expect(filmstripItems[1]!.querySelector('img') !== null).toBe(true);
  });
});

/**
 * U2 (#6169) — LE PIED PORTE L'AUTEUR, LA DATE, LES COTES ET LA LÉGENDE — le
 * SEUL consommateur de `MediaCarrier` (`CarrierFooter`, `media-viewer.tsx`).
 * `carrier` ABSENT ⇒ AUCUN pied (loi 4 : un carrier vide ne doit rien
 * afficher qui ressemble à un auteur inventé).
 */
describe('MediaViewer — le pied porte le carrier, absent sans lui (#6169)', () => {
  const carrier: MediaCarrier = {
    sender: { displayName: 'Kwame Mensah', avatarUrl: null },
    sentAt: '2026-09-13T10:13:00.000Z',
    caption: { text: 'Aufnahme vom Yachthafen', language: 'de', translated: true },
  };

  test('avec carrier : auteur, <time datetime>, 640 × 427, 1 Ko, légende avec lang="de"', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 0, onClose: () => {}, carrier });

    const footer = body.querySelector('[data-viewer-footer]');
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain('Kwame Mensah');
    const time = footer!.querySelector('time[datetime]');
    expect(time).not.toBeNull();
    expect(time!.getAttribute('datetime')).toBe('2026-09-13T10:13:00.000Z');
    expect(footer!.textContent).toContain('640 × 427');
    expect(footer!.textContent).toContain('1 Ko');

    const caption = body.querySelector('[data-viewer-caption]');
    expect(caption).not.toBeNull();
    expect(caption!.getAttribute('lang')).toBe('de');
    expect(caption!.textContent).toBe('Aufnahme vom Yachthafen');
  });

  test('SANS carrier : aucun [data-viewer-footer] (loi 4, jamais un auteur inventé)', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 0, onClose: () => {} });
    expect(body.querySelector('[data-viewer-footer]')).toBeNull();
  });
});

/**
 * LA NATURE « SCÈNE » (#6902, § B de la spécification `scenes-plein-ecran`) —
 * la MÊME visionneuse, une page de PLUS : `scenes.get(id)` fait peindre
 * `ViewerScenePage` (le moteur `ScenePlayer`) plutôt que le repli
 * image/vidéo, quel que soit le `mimeType` synthétique de la pièce
 * (`composeSceneGalleryLot`, `lib/feed/gallery-lot.ts`).
 */
describe('MediaViewer — la nature « scène » (#6902)', () => {
  async function mountScenes(params: { readonly startIndex: number; readonly onClose?: () => void }): Promise<HTMLElement> {
    const model = resolveFeedCardModel(POST_SCENES_MIXED, { preferredLanguages: ['fr', 'en'], now: new Date('2026-09-17T12:00:00.000Z') });
    const lot = composeSceneGalleryLot(model);
    if (lot === undefined) throw new Error('lot attendu');

    container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <MediaViewer
          items={lot.items}
          scenes={lot.scenes}
          startIndex={params.startIndex}
          onClose={params.onClose ?? (() => {})}
          languages={['fr']}
          fallbackLanguage="fr"
          carrier={{ sender: { displayName: 'Omar', avatarUrl: null }, sentAt: model.createdAt, caption: null }}
        />,
      );
    });
    return document.body;
  }

  test('la carte `scenes` fait peindre une page SCÈNE — le dialogue porte `data-scene-fullscreen`, l’index courant est celui touché', async () => {
    const body = await mountScenes({ startIndex: 1 });
    const dialog = body.querySelector('[data-media-viewer]')!;
    expect(dialog.hasAttribute('data-scene-fullscreen')).toBe(true);
    expect(dialog.getAttribute('data-viewer-index')).toBe('1');
    expect(currentPage(body).querySelector('[data-scene-viewer-page]')).not.toBeNull();
  });

  test('une page SCÈNE porte une pièce SYNTHÉTIQUE et n’a ni <img>/<video> réel, ni marque « protégée »', async () => {
    const body = await mountScenes({ startIndex: 0 });
    const page = currentPage(body);
    expect(page.querySelector('[data-protected-attachment]')).toBeNull();
    expect(page.querySelector('[data-scene-viewer-page]')).not.toBeNull();
  });

  test('le pied N’AFFICHE JAMAIS de cotes/poids sur une page scène (miroir iOS : « une scène n’a ni format, ni dimensions, ni poids »)', async () => {
    const body = await mountScenes({ startIndex: 0 });
    const footer = body.querySelector('[data-viewer-footer]')!;
    expect(footer).not.toBeNull();
    expect(footer.textContent).toContain('Omar');
    expect(footer.textContent).not.toContain('Ko');
  });

  test('un post à scène SANS AUCUN média (texte seul) s’ouvre aussi — la scène décide, pas le média', async () => {
    const model = resolveFeedCardModel(POST_SCENE_TEXT, { preferredLanguages: ['fr', 'en'], now: new Date() });
    const lot = composeSceneGalleryLot(model);
    if (lot === undefined) throw new Error('lot attendu');
    expect(lot.items.length).toBe(1);

    container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <MediaViewer
          items={lot.items}
          scenes={lot.scenes}
          startIndex={0}
          onClose={() => {}}
          languages={['fr', 'en']}
          fallbackLanguage="fr"
        />,
      );
    });
    const dialog = document.body.querySelector('[data-media-viewer]')!;
    expect(dialog.hasAttribute('data-scene-fullscreen')).toBe(true);
    expect(currentPage(document.body).querySelector('[data-scene-viewer-page]')).not.toBeNull();
  });

  test('Escape ferme la couche scène — même mécanisme que la visionneuse de médias', async () => {
    let closed = 0;
    const body = await mountScenes({ startIndex: 0, onClose: () => (closed += 1) });
    const dialog = body.querySelector('[data-media-viewer]')!;
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    expect(closed).toBe(1);
  });
});

/**
 * CE QUE LA REVUE-CORRECTION DE #6902 A AJOUTÉ — la page scène ne s'ANCRE
 * plus au viewport par `position: fixed` (le plateau reçoit un `transform`
 * pendant un glissement, et la boîte rétrécissait de 390 × 693 à 371 × 660 au
 * premier pixel de doigt), elle NOMME sa page pour un lecteur d'écran, elle
 * s'ouvre MUETTE avec un bouton pour ouvrir le son, et un appui long l'entre
 * EN PAUSE.
 */
describe('MediaViewer — la page scène : cadrage, nom, son et pause (revue-correction #6902)', () => {
  async function mount(post: typeof POST_SCENES_MIXED, startIndex = 0): Promise<HTMLElement> {
    const model = resolveFeedCardModel(post, { preferredLanguages: ['fr', 'en'], now: new Date('2026-09-17T12:00:00.000Z') });
    const lot = composeSceneGalleryLot(model);
    if (lot === undefined) throw new Error('lot attendu');
    container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <MediaViewer
          items={lot.items}
          scenes={lot.scenes}
          startIndex={startIndex}
          onClose={() => {}}
          languages={['fr']}
          fallbackLanguage="fr"
          carrier={{ sender: { displayName: 'Omar', avatarUrl: null }, sentAt: model.createdAt, caption: null }}
        />,
      );
    });
    return document.body;
  }

  test("aucune page de la couche ne porte `position: fixed` — le plateau est TRANSFORMÉ pendant un glissement, un descendant fixe s'y réancrerait", async () => {
    const body = await mount(POST_SCENES_MIXED, 1);
    const pages = [...body.querySelectorAll<HTMLElement>('[data-viewer-page]')];
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) expect(page.style.position).not.toBe('fixed');
  });

  test('la page scène NOMME son contenu : « Scène partagée par … » à défaut de légende', async () => {
    const body = await mount(POST_SCENE_TEXT);
    const page = currentPage(body).querySelector('[data-scene-viewer-page]')!;
    expect(page.getAttribute('role')).toBe('group');
    expect(page.getAttribute('aria-label')).toContain('Omar');
  });

  test('le dialogue dit « Scène », jamais « Média », sur un lot de scènes', async () => {
    const body = await mount(POST_SCENES_MIXED, 1);
    expect(body.querySelector('[data-media-viewer]')!.getAttribute('aria-label')).toBe('Scène 2 sur 3');
  });

  test("une scène SONORE s'ouvre MUETTE et son bouton OUVRE le son — jamais un son qui surprend", async () => {
    const body = await mount(POST_SCENE_CLIP_A);
    const sound = () => currentPage(body).querySelector<HTMLButtonElement>('[data-scene-viewer-sound]');
    expect(sound()!.getAttribute('data-scene-viewer-sound')).toBe('muted');
    expect(sound()!.getAttribute('aria-label')).toBe('Réactiver le son');
    // L'EFFET, pas l'étiquette du bouton : `ScenePlayer` ne pose sa pastille
    // `data-scene-sound="muted"` que sur le muet RÉSOLU (`hostMute`) d'un
    // document SONORE qui joue — c'est donc elle qui prouve que le muet de
    // l'hôte atteint bien le moteur.
    expect(currentPage(body).querySelector('[data-scene-sound="muted"]')).not.toBeNull();
    await act(async () => {
      sound()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(sound()!.getAttribute('data-scene-viewer-sound')).toBe('on');
    expect(sound()!.getAttribute('aria-label')).toBe('Couper le son');
    expect(currentPage(body).querySelector('[data-scene-sound="muted"]')).toBeNull();
  });

  test("une scène SANS son ne pose AUCUN bouton de son (loi 4 : un contrôle sans effet n'existe pas)", async () => {
    const body = await mount(POST_SCENE_TEXT);
    expect(currentPage(body).querySelector('[data-scene-viewer-sound]')).toBeNull();
  });

  test("une scène qui BOUGE porte lecture/pause, dont le libellé SUIT l'état ; une scène FIXE n'en porte pas", async () => {
    const moving = await mount(POST_SCENE_CLIP_A);
    const button = () => currentPage(moving).querySelector<HTMLButtonElement>('[data-scene-viewer-playpause]');
    expect(button()!.getAttribute('data-scene-viewer-playpause')).toBe('playing');
    expect(button()!.getAttribute('aria-label')).toBe('Tout mettre en pause');
    await act(async () => {
      button()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(button()!.getAttribute('data-scene-viewer-playpause')).toBe('paused');
    expect(button()!.getAttribute('aria-label')).toBe('Tout reprendre');
  });

  test('une scène FIXE ne porte ni lecture/pause ni son', async () => {
    const body = await mount(POST_SCENES_MIXED, 0);
    expect(currentPage(body).querySelector('[data-scene-viewer-playpause]')).toBeNull();
  });

  test("la barre d'ESPACE atteint la lecture d'une scène active, comme elle atteint une vidéo", async () => {
    const body = await mount(POST_SCENE_CLIP_A);
    const dialog = body.querySelector('[data-media-viewer]')!;
    const button = () => currentPage(body).querySelector<HTMLButtonElement>('[data-scene-viewer-playpause]');
    expect(button()!.getAttribute('data-scene-viewer-playpause')).toBe('playing');
    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
    });
    expect(button()!.getAttribute('data-scene-viewer-playpause')).toBe('paused');
  });
});

/**
 * EN PLEIN CADRE, UN CHROME INVISIBLE RESTAIT CLIQUABLE (#7040).
 *
 * Les deux couloirs de la visionneuse s'effacent en plein cadre — `opacity:
 * isFull ? 0 : 1` — et portent `zIndex: 10`, donc ils restent AU-DESSUS de la
 * page. Aucun des deux ne coupait ses événements de pointeur : un appui en haut
 * à gauche FERMAIT la visionneuse au lieu de repasser en mode carte, et la
 * pellicule du couloir bas restait, elle aussi, sensible sous un doigt qui ne
 * voit rien.
 *
 * `opacity: 0` cache aux YEUX, jamais au DOIGT. C'est la forme la plus banale
 * d'un contrôle inerte à l'envers : le contrôle n'est pas mort, il est
 * INVISIBLE ET VIVANT — ce qui est pire, puisque l'utilisateur ne peut ni le
 * voir ni prévoir son effet.
 *
 * Le couloir BAS n'était pas dans le signalement : il a été trouvé en posant au
 * correctif la question que le dépôt pose aux siens — « qu'est-ce qui part À
 * CÔTÉ de ce que je viens de garder ? ». Même fichier, même littéral, même
 * défaut, et une pellicule de vignettes cliquables en prime.
 */
describe('les deux couloirs de la visionneuse : invisibles ⇒ intouchables', () => {
  const chromes = (body: HTMLElement): readonly HTMLElement[] =>
    Array.from(body.querySelectorAll<HTMLElement>('[data-media-viewer] .media-viewer-chrome'));

  const enterFull = (body: HTMLElement): void => {
    act(() => {
      body.querySelector('.media-viewer-track-frame')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  test('en mode CARTE, les deux couloirs sont visibles et touchables', () => {
    const body = mount({ items: attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID), startIndex: 0, onClose: () => {} });

    expect(chromes(body).length).toBe(2);
    expect(chromes(body).map((c) => c.style.opacity)).toEqual(['1', '1']);
    expect(chromes(body).every((c) => c.style.pointerEvents !== 'none')).toBe(true);
  });

  test('un tap entre en plein cadre : les DEUX couloirs deviennent invisibles ET intouchables, jamais l’un sans l’autre', () => {
    const body = mount({ items: attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID), startIndex: 0, onClose: () => {} });

    enterFull(body);

    expect(chromes(body).map((c) => c.style.opacity)).toEqual(['0', '0']);
    expect(chromes(body).map((c) => c.style.pointerEvents)).toEqual(['none', 'none']);
  });

  test('le couloir qui porte « Fermer » est bien celui qui devient intouchable — sinon un tap en haut à gauche fermerait', () => {
    const body = mount({ items: attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID), startIndex: 0, onClose: () => {} });

    enterFull(body);

    const close = body.querySelector<HTMLElement>('[data-media-viewer] .media-viewer-close')!;
    const couloir = close.closest<HTMLElement>('.media-viewer-chrome')!;
    expect(couloir.style.pointerEvents).toBe('none');
  });

  test('le couloir BAS aussi — sa pellicule de vignettes ne se choisit pas à l’aveugle', () => {
    const body = mount({ items: attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID), startIndex: 0, onClose: () => {} });

    enterFull(body);

    const vignette = body.querySelector<HTMLElement>('[data-filmstrip-item]')!;
    expect(vignette.closest<HTMLElement>('.media-viewer-chrome')!.style.pointerEvents).toBe('none');
  });

  test('repasser en mode carte les REND touchables — l’effacement n’est pas une porte à sens unique', () => {
    const body = mount({ items: attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID), startIndex: 0, onClose: () => {} });

    enterFull(body);
    enterFull(body);

    expect(chromes(body).map((c) => c.style.opacity)).toEqual(['1', '1']);
    expect(chromes(body).every((c) => c.style.pointerEvents !== 'none')).toBe(true);
  });
});

/**
 * OUVRIR UNE IMAGE ÉMET (#7363, W6) — la page active rapporte "viewed" à
 * l'ouverture (`useAttachmentOpenReport`, patron `DocumentViewerView.
 * onAppear`), jamais pour sa propre pièce.
 */
describe('MediaViewer — ouvrir une image REÇUE rapporte, jamais la sienne (#7363, W6)', () => {
  test('la page ACTIVE (isMine=false, défaut) rapporte "viewed" pour SON attachment', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const opened = items[0]!;
    const { calls, deps } = scriptedGateway({ [`POST /api/v1/attachments/${opened.id}/status`]: { ok: true, data: {} } });

    mount({ items, startIndex: 0, onClose: () => {}, deps });

    expect(calls()).toHaveLength(1);
    expect(calls()[0]?.path).toBe(`/api/v1/attachments/${opened.id}/status`);
    expect(calls()[0]?.body).toEqual({ action: 'viewed', playPositionMs: 0, durationMs: 0, complete: true });
  });

  test('SA PROPRE image (isMine=true) ⇒ aucun rapport', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const opened = items[0]!;
    const { calls, deps } = scriptedGateway({ [`POST /api/v1/attachments/${opened.id}/status`]: { ok: true, data: {} } });

    mount({ items, startIndex: 0, onClose: () => {}, isMine: true, deps });

    expect(calls()).toHaveLength(0);
  });

  test('changer de page (pellicule) rapporte pour la NOUVELLE page active', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const second = items[1]!;
    const { calls, deps } = scriptedGateway({ [`POST /api/v1/attachments/${second.id}/status`]: { ok: true, data: {} } });

    const body = mount({ items, startIndex: 1, onClose: () => {}, deps });

    expect(calls()).toHaveLength(1);
    expect(calls()[0]?.path).toBe(`/api/v1/attachments/${second.id}/status`);
    // La pellicule marque bien la seconde vignette comme active (contrôle).
    const filmstripItems = Array.from(body.querySelectorAll('[data-filmstrip-item]'));
    expect(filmstripItems[1]!.getAttribute('aria-current')).toBe('true');
  });
});
