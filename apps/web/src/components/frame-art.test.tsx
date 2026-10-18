import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { parseAvatarRingDesign, type AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';
import { parseBannerFrameDesign, type BannerFrameDesign } from '@meeshy/shared/types/banner-frame-design';
import { FRAME_MOTION_CSS } from '@meeshy/shared/utils/frame-motion-svg';

import { createActMounter } from '@/test-support/act-mount';
import { createFakeIntersectionObservers } from '@/test-support/fake-intersection-observer';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AvatarRing } from './avatar-ring';
import { BannerFrame, RingArt } from './frame-art';

/**
 * LES CADRES SE PEIGNENT PAR LE COMPOSITEUR (#10935) — le contour d'avatar et le
 * cadre de bannière posent leurs mouvements en couches CSS (transform, opacity),
 * figées hors écran et quand l'application passe en arrière-plan, absentes sous
 * « Réduire les animations ». Le cadre de bannière se pose SUR la photo, découpé à
 * sa région : son centre reste transparent.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const observers = createFakeIntersectionObservers();
const mounter = createActMounter();
let nativeObserver: typeof IntersectionObserver | undefined;
let nativeMatchMedia: typeof window.matchMedia | undefined;
let nativeRect: typeof Element.prototype.getBoundingClientRect | undefined;

const ring = (over: Record<string, unknown> = {}): AvatarRingDesign =>
  parseAvatarRingDesign({
    key: 'etoile',
    stroke: { style: 'solid', width: 0.04, colors: ['#B8954F', '#FFD98A'] },
    ornament: { paths: [{ d: 'M50 2 L52 6 L48 6 Z', color: 1, opacity: 1, group: 'etoiles' }] },
    motion: [{ kind: 'twinkle', targets: ['etoiles'], duration: 3 }],
    ...over,
  })!;

const frame = (over: Record<string, unknown> = {}): BannerFrameDesign =>
  parseBannerFrameDesign({
    key: 'haussmannien',
    viewBox: [0, 0, 300, 100],
    palette: ['#DCD2C0', '#B8954F'],
    border: { width: 9.6, color: 0, opacity: 1 },
    reach: { corner: 14 },
    pieces: [{ anchor: 'start', paths: [{ d: 'M2 2 h10 v10 h-10 Z', color: 1, opacity: 1, group: 'rosaces' }] }],
    motion: [{ kind: 'pulse', targets: ['rosaces'], duration: 2 }],
    ...over,
  })!;

const setReducedMotion = (reduced: boolean): void => {
  window.matchMedia = ((query: string) => ({ matches: reduced && query.includes('reduced-motion'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
};

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  nativeObserver = globalThis.IntersectionObserver;
  nativeMatchMedia = window.matchMedia;
  nativeRect = Element.prototype.getBoundingClientRect;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

beforeEach(() => {
  observers.reset();
  globalThis.IntersectionObserver = observers.FakeIntersectionObserver as unknown as typeof IntersectionObserver;
  setReducedMotion(false);
  Element.prototype.getBoundingClientRect = function rect() {
    return { x: 0, y: 0, top: 0, left: 0, right: 360, bottom: 120, width: 360, height: 120, toJSON: () => ({}) } as DOMRect;
  };
});

afterEach(() => {
  mounter.unmountAll();
  if (nativeObserver !== undefined) globalThis.IntersectionObserver = nativeObserver;
  if (nativeMatchMedia !== undefined) window.matchMedia = nativeMatchMedia;
  if (nativeRect !== undefined) Element.prototype.getBoundingClientRect = nativeRect;
  delete document.documentElement.dataset.appHidden;
});

const emit = async (ratio: number): Promise<void> => {
  await act(async () => {
    observers.emitAll(ratio);
  });
};

describe('le contour d’avatar animé', () => {
  test('ses mouvements sont des couches composées, et la feuille de style est posée une seule fois', async () => {
    const host = await mounter.mount(
      <div>
        <AvatarRing ring={ring()} size={84}>
          <i data-avatar />
        </AvatarRing>
        <AvatarRing ring={ring()} size={84}>
          <i data-avatar />
        </AvatarRing>
      </div>,
    );
    expect(host.querySelectorAll('[data-avatar-ring] .fm')).toHaveLength(2);
    const sheets = [...document.head.querySelectorAll('style[data-frame-motion]')];
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.textContent).toBe(FRAME_MOTION_CSS);
  });

  test('hors écran, ses couches se figent ; de retour, elles reprennent', async () => {
    const host = await mounter.mount(<RingArt ring={ring()} size={100} />);
    const art = host.querySelector('[data-frame-art]')!;
    await emit(0);
    expect(art.hasAttribute('data-frame-paused')).toBe(true);
    await emit(1);
    expect(art.hasAttribute('data-frame-paused')).toBe(false);
  });

  test('l’application en arrière-plan fige toutes les couches', async () => {
    await mounter.mount(<RingArt ring={ring()} size={100} />);
    const hidden = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(document.documentElement.dataset.appHidden).toBe('');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(document.documentElement.dataset.appHidden).toBeUndefined();
    if (hidden !== undefined) Object.defineProperty(document, 'visibilityState', hidden);
  });

  test('sous « Réduire les animations », le contour fixe, complet, sans couche', async () => {
    setReducedMotion(true);
    const host = await mounter.mount(<RingArt ring={ring()} size={100} />);
    expect(host.querySelector('.fm')).toBeNull();
    expect(host.innerHTML).toContain('M50 2 L52 6');
  });

  test('un contour sans mouvement reste le rendu d’avant', () => {
    const html = renderToStaticMarkup(<RingArt ring={ring({ motion: undefined })} size={100} />);
    expect(html).not.toContain('class="fm"');
    expect(html).toContain('M50 2 L52 6');
  });
});

describe('le cadre de bannière', () => {
  test('se pose sur la bannière à sa taille mesurée, découpé à sa région', async () => {
    const host = await mounter.mount(<BannerFrame frame={frame()} />);
    const root = host.querySelector('[data-banner-frame="haussmannien"]')!;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    const art = root.querySelector('[data-banner-frame-art]')!;
    expect(art.getAttribute('style')).toContain("clip-path:path('M0 0H360V120H0Z");
    expect(art.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 300 100');
    expect(art.querySelectorAll('.fm')).toHaveLength(1);
  });

  test('hors écran, ses couches se figent', async () => {
    const host = await mounter.mount(<BannerFrame frame={frame()} />);
    await emit(0);
    expect(host.querySelector('[data-banner-frame]')!.hasAttribute('data-frame-paused')).toBe(true);
  });

  test('sous « Réduire les animations », le cadre fixe', async () => {
    setReducedMotion(true);
    const host = await mounter.mount(<BannerFrame frame={frame()} />);
    expect(host.querySelector('.fm')).toBeNull();
    expect(host.querySelector('[data-banner-frame-art]')).not.toBeNull();
  });
});
