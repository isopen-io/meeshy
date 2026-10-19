import { describe, expect, it } from 'vitest';
import {
  BANNER_FRAME_LIMITS,
  BannerFramePackContractSchema,
  bannerFrameDrawableRegion,
  parseBannerFrameDesign,
  parseBannerFramePackContract,
} from '../banner-frame-design';

/** Le cadre de bannière haussmannien de la planche, réduit à une pièce de chaque sorte. */
const frame = (over: Record<string, unknown> = {}) => ({
  key: 'haussmannien',
  viewBox: [0, 0, 300, 100],
  palette: ['#DCD2C0', '#A99B83', '#22262B', '#B8954F'],
  border: {
    width: 9.6,
    color: 0,
    opacity: 1,
    filets: [
      { inset: 0.6, width: 0.6, color: 1, opacity: 1 },
      { inset: 7.6, width: 0.5, color: 2, opacity: 1 },
      { inset: 9.4, width: 0.45, color: 3, opacity: 1 },
    ],
  },
  reach: { corner: 14, cartouche: { width: 40, depth: 16, edge: 'top' } },
  pieces: [
    { anchor: 'start', paths: [{ d: 'M2 2 h10 v10 h-10 Z', color: 3, opacity: 1, group: 'rosaces' }] },
    { anchor: 'end', paths: [{ d: 'M288 2 h10 v10 h-10 Z', color: 3, opacity: 1, group: 'rosaces' }] },
    { anchor: 'center', paths: [{ d: 'M140 0 L150 14 L160 0 Z', color: 3, opacity: 1, fillRule: 'evenodd' }] },
  ],
  friezes: [{ module: 4.8, from: 16, to: 16, fit: 'repeat', paths: [{ d: 'M16.5 2.2 h2.6 v3.2 h-2.6 Z', color: 1, opacity: 1 }] }],
  ...over,
});

describe('un cadre de bannière se pose SUR la photo (#10932)', () => {
  it('lit le cadre de la planche', () => {
    const parsed = parseBannerFrameDesign(frame());
    expect(parsed?.key).toBe('haussmannien');
    expect(parsed?.pieces).toHaveLength(3);
    expect(parsed?.friezes?.[0]?.fit).toBe('repeat');
  });

  it('une bordure seule, sans ornement, est un cadre', () => {
    expect(parseBannerFrameDesign(frame({ pieces: undefined, friezes: undefined }))).not.toBeNull();
  });

  it.each([
    ['une bordure plus épaisse que 9,6', { border: { width: 12, color: 0, opacity: 1 } }],
    ['des coins qui entrent au-delà de 20', { reach: { corner: 24 } }],
    ['un cartouche plus profond que 20', { reach: { corner: 14, cartouche: { width: 40, depth: 30, edge: 'top' } } }],
    ['un cartouche qui couvre le portrait', { reach: { corner: 14, cartouche: { width: 200, depth: 16, edge: 'top' } } }],
    ['un autre viewBox', { viewBox: [0, 0, 1000, 330] }],
    ['un filet hors de la bordure', { border: { width: 9.6, color: 0, opacity: 1, filets: [{ inset: 30, width: 0.5, color: 1, opacity: 1 }] } }],
    ['une couleur hors palette', { border: { width: 9.6, color: 6, opacity: 1 } }],
    ['une couleur qui n’est pas un hexadécimal', { palette: ['red'] }],
    ['un dégradé désigné absent', { border: { width: 9.6, color: 0, gradient: 0, opacity: 1 } }],
    ['un chemin qui n’est pas un chemin', { pieces: [{ anchor: 'start', paths: [{ d: '<script>', color: 0, opacity: 1 }] }] }],
    ['un ancrage inconnu', { pieces: [{ anchor: 'middle', paths: [{ d: 'M0 0 Z', color: 0, opacity: 1 }] }] }],
    ['une frise qui ne tient pas dans 300', { friezes: [{ module: 10, from: 200, to: 200, fit: 'repeat', paths: [{ d: 'M0 0 Z', color: 0, opacity: 1 }] }] }],
    ['un module nul', { friezes: [{ module: 0, from: 16, to: 16, fit: 'justify', paths: [{ d: 'M0 0 Z', color: 0, opacity: 1 }] }] }],
  ])('refuse %s', (_name, over) => {
    expect(parseBannerFrameDesign(frame(over))).toBeNull();
  });

  it('conserve la limite de 48 chemins, frises comprises', () => {
    const paths = (count: number) => Array.from({ length: count }, () => ({ d: 'M0 0 Z', color: 0, opacity: 1 }));
    expect(parseBannerFrameDesign(frame({ pieces: [{ anchor: 'start', paths: paths(40) }], friezes: [{ module: 4, from: 16, to: 16, fit: 'repeat', paths: paths(8) }] }))).not.toBeNull();
    expect(parseBannerFrameDesign(frame({ pieces: [{ anchor: 'start', paths: paths(41) }], friezes: [{ module: 4, from: 16, to: 16, fit: 'repeat', paths: paths(8) }] }))).toBeNull();
    expect(BANNER_FRAME_LIMITS.maxPaths).toBe(48);
  });

  it('porte des mouvements tolérants et une couche Lottie facultative', () => {
    const parsed = parseBannerFrameDesign(frame({ motion: [{ kind: 'twinkle', targets: ['rosaces'], duration: 3.4, stagger: 0.8 }, { kind: 'nova', targets: ['x'], duration: 1 }] }));
    expect(parsed?.motion).toEqual([{ kind: 'twinkle', targets: ['rosaces'], duration: 3.4, stagger: 0.8 }]);
  });
});

describe('le centre reste transparent, à toutes les largeurs', () => {
  it('au gabarit 300 × 100, le trou laisse voir la photo entière hors bordure', () => {
    const region = bannerFrameDrawableRegion(parseBannerFrameDesign(frame())!, 300);
    expect(region.outer).toEqual({ x: 0, y: 0, width: 300, height: 100 });
    expect(region.hole).toEqual({ x: 9.6, y: 9.6, width: 280.8, height: 80.8 });
  });

  it('seuls les coins et le cartouche central entrent dans le trou, au plus de 20', () => {
    const region = bannerFrameDrawableRegion(parseBannerFrameDesign(frame())!, 600);
    expect(region.reserved).toEqual([
      { x: 0, y: 0, width: 14, height: 14 },
      { x: 586, y: 0, width: 14, height: 14 },
      { x: 0, y: 86, width: 14, height: 14 },
      { x: 586, y: 86, width: 14, height: 14 },
      { x: 280, y: 0, width: 40, height: 16 },
    ]);
    region.reserved.forEach((box) => expect(Math.min(box.y + box.height, 100 - box.y)).toBeLessThanOrEqual(BANNER_FRAME_LIMITS.maxReach));
  });

  it('un cartouche sur les deux bords se réserve en haut et en bas', () => {
    const region = bannerFrameDrawableRegion(parseBannerFrameDesign(frame({ reach: { corner: 16, cartouche: { width: 30, depth: 12, edge: 'both' } } }))!, 300);
    expect(region.reserved.slice(4)).toEqual([
      { x: 135, y: 0, width: 30, height: 12 },
      { x: 135, y: 88, width: 30, height: 12 },
    ]);
  });
});

describe('le contrat d’un pack de cadres de bannière', () => {
  it('lit un pack et refuse deux cadres de même clé ou un autre domaine', () => {
    expect(parseBannerFramePackContract({ domain: 'banner-frame', frames: [frame()] })?.frames).toHaveLength(1);
    expect(BannerFramePackContractSchema.safeParse({ domain: 'banner-frame', frames: [frame(), frame()] }).success).toBe(false);
    expect(parseBannerFramePackContract({ domain: 'banner', frames: [frame()] })).toBeNull();
    expect(parseBannerFramePackContract({ domain: 'banner-frame', frames: [] })).toBeNull();
  });
});
