import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createMediaCoordinator, type MediaCoordinator } from '@/lib/view/media-coordinator';
import { useMediaPlayback } from '@/lib/view/use-media-playback';

import { MediaTransport } from './media-transport';

/**
 * LA BARRE DE LECTURE DE LA VISIONNEUSE (#6359) — miroir de
 * `VideoTransportControls(controls: [.scrubber, .mute, .speed, .pip],
 * placement: .corridor)` (`ConversationMediaGalleryView+Transport.swift`).
 * L'élément `<video>` et le hook sont RÉELS ; seuls les faits que happy-dom
 * ne produit pas (durée, position, géométrie de la piste, image dans
 * l'image) sont posés à la main.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const pipDocument = () => document as Document & { pictureInPictureEnabled?: boolean; exitPictureInPicture?: () => Promise<void> };

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
  Object.defineProperty(pipDocument(), 'pictureInPictureEnabled', { value: false, configurable: true });
});

function Harness({
  durationMs,
  onParentKey,
  coordinator,
}: {
  readonly durationMs: number | undefined;
  readonly onParentKey: () => void;
  readonly coordinator: MediaCoordinator;
}) {
  const playback = useMediaPlayback({ attachmentId: 'video-1', coordinator, tracksTime: true });
  return (
    <div onKeyDown={onParentKey}>
      <video ref={playback.bind} />
      <MediaTransport playback={playback} durationMs={durationMs} language="fr" />
    </div>
  );
}

function mount(params: { readonly durationMs?: number; readonly onParentKey?: () => void } = {}): {
  readonly body: HTMLDivElement;
  readonly video: HTMLVideoElement;
} {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // UN coordinateur par montage, STABLE d'un rendu à l'autre — comme le
  // singleton de l'application. En créer un à chaque rendu changerait
  // l'identité de `bind`, et React détacherait puis rattacherait l'élément.
  const coordinator = createMediaCoordinator();
  act(() => {
    root.render(<Harness durationMs={params.durationMs} onParentKey={params.onParentKey ?? (() => {})} coordinator={coordinator} />);
  });
  return { body: container, video: container.querySelector('video')! };
}

async function loadMetadata(video: HTMLVideoElement, seconds: number): Promise<void> {
  await act(async () => {
    Object.defineProperty(video, 'duration', { value: seconds, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 0, configurable: true, writable: true });
    video.dispatchEvent(new Event('loadedmetadata'));
  });
}

const slider = (body: HTMLElement): HTMLElement | null => body.querySelector('[role="slider"]');
const button = (body: HTMLElement, label: string): HTMLButtonElement | null =>
  Array.from(body.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.getAttribute('aria-label') === label) ?? null;

function trackAt(body: HTMLElement, left: number, width: number): HTMLElement {
  const track = slider(body)!;
  track.getBoundingClientRect = () => ({ left, width, top: 0, height: 32, right: left + width, bottom: 32, x: left, y: 0, toJSON: () => ({}) });
  return track;
}

function pointer(type: string, clientX: number): PointerEvent {
  return new PointerEvent(type, { bubbles: true, clientX, pointerId: 1 });
}

describe('MediaTransport — avant la première image', () => {
  test('sans durée connue de l’élément, seule la durée de la PIÈCE s’affiche : aucune barre sans effet', () => {
    const { body } = mount({ durationMs: 7_000 });
    expect(slider(body)).toBeNull();
    expect(body.textContent).toContain('0:07');
  });
});

describe('MediaTransport — le curseur de lecture', () => {
  test('une fois la durée connue, un curseur accessible dit sa position et sa durée', async () => {
    const { body, video } = mount({ durationMs: 65_000 });
    await loadMetadata(video, 65);

    const track = slider(body)!;
    expect(track.getAttribute('aria-label')).toBe('Position de lecture');
    expect(track.getAttribute('aria-valuemin')).toBe('0');
    expect(track.getAttribute('aria-valuemax')).toBe('65');
    expect(track.getAttribute('aria-valuenow')).toBe('0');
    expect(track.getAttribute('aria-valuetext')).toBe('0:00 sur 1:05');
  });

  test('le temps écoulé et la durée suivent la lecture', async () => {
    const { body, video } = mount({ durationMs: 65_000 });
    await loadMetadata(video, 65);

    await act(async () => {
      video.currentTime = 12.3;
      video.dispatchEvent(new Event('timeupdate'));
    });

    expect(body.textContent).toContain('0:12 / 1:05');
  });

  test('la vidéo avance PENDANT le geste, pas au relâcher', async () => {
    const { body, video } = mount({ durationMs: 60_000 });
    await loadMetadata(video, 60);
    const track = trackAt(body, 100, 100);

    await act(async () => {
      track.dispatchEvent(pointer('pointerdown', 150));
    });
    expect(video.currentTime).toBe(30);

    await act(async () => {
      track.dispatchEvent(pointer('pointermove', 175));
    });
    expect(video.currentTime).toBe(45);

    await act(async () => {
      track.dispatchEvent(pointer('pointerup', 175));
    });
    expect(video.currentTime).toBe(45);
  });

  test('un survol sans doigt posé ne déplace rien', async () => {
    const { body, video } = mount({ durationMs: 60_000 });
    await loadMetadata(video, 60);
    const track = trackAt(body, 100, 100);

    await act(async () => {
      track.dispatchEvent(pointer('pointermove', 190));
    });

    expect(video.currentTime).toBe(0);
  });

  test('au clavier, flèche droite avance de 10 s — et la visionneuse ne change pas de page', async () => {
    let parentKeys = 0;
    const { body, video } = mount({ durationMs: 60_000, onParentKey: () => (parentKeys += 1) });
    await loadMetadata(video, 60);

    await act(async () => {
      slider(body)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(video.currentTime).toBe(10);
    expect(parentKeys).toBe(0);
  });
});

describe('MediaTransport — le muet', () => {
  test('couper puis réactiver le son agit sur l’élément et le dit', async () => {
    const { body, video } = mount({ durationMs: 60_000 });
    await loadMetadata(video, 60);

    await act(async () => {
      button(body, 'Couper le son')!.click();
    });
    expect(video.muted).toBe(true);
    const unmute = button(body, 'Réactiver le son')!;
    expect(unmute.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      unmute.click();
    });
    expect(video.muted).toBe(false);
  });
});

describe('MediaTransport — le menu vitesse et image dans l’image', () => {
  test('choisir 1,5× règle la vitesse de l’élément et referme le menu', async () => {
    const { body, video } = mount({ durationMs: 60_000 });
    await loadMetadata(video, 60);
    const more = button(body, "Plus d'options")!;
    expect(more.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      more.click();
    });
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const items = Array.from(body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    expect(items.map((i) => i.textContent)).toEqual(['1×', '1,25×', '1,5×', '1,75×', '2×']);
    expect(items[0]!.getAttribute('aria-checked')).toBe('true');

    await act(async () => {
      items[2]!.click();
    });

    expect(video.playbackRate).toBe(1.5);
    expect(body.querySelector('[role="menu"]')).toBeNull();
  });

  test('un navigateur qui offre l’image dans l’image la propose, et la demande au navigateur', async () => {
    Object.defineProperty(pipDocument(), 'pictureInPictureEnabled', { value: true, configurable: true });
    const { body, video } = mount({ durationMs: 60_000 });
    let requests = 0;
    video.requestPictureInPicture = () => {
      requests += 1;
      return Promise.resolve({} as PictureInPictureWindow);
    };
    await loadMetadata(video, 60);

    await act(async () => {
      button(body, "Plus d'options")!.click();
    });
    const pip = Array.from(body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((i) => i.textContent === "Image dans l'image");

    await act(async () => {
      pip!.click();
    });

    expect(requests).toBe(1);
  });

  test('Échap referme le menu — pas la visionneuse — et rend le focus au bouton « ⋯ »', async () => {
    let parentKeys = 0;
    const { body, video } = mount({ durationMs: 60_000, onParentKey: () => (parentKeys += 1) });
    await loadMetadata(video, 60);
    const more = button(body, "Plus d'options")!;

    await act(async () => {
      more.click();
    });
    const firstItem = body.querySelector<HTMLElement>('[role="menuitemradio"]')!;

    await act(async () => {
      firstItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(body.querySelector('[role="menu"]')).toBeNull();
    expect(parentKeys).toBe(0);
    expect(document.activeElement).toBe(button(body, "Plus d'options"));
  });

  test('sans image dans l’image, le menu ne propose que la vitesse', async () => {
    const { body, video } = mount({ durationMs: 60_000 });
    await loadMetadata(video, 60);

    await act(async () => {
      button(body, "Plus d'options")!.click();
    });

    expect(body.querySelectorAll('[role="menuitem"]').length).toBe(0);
  });
});
