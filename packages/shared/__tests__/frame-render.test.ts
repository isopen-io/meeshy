import { describe, expect, it } from 'vitest';
import { parseAvatarRingDesign, type AvatarRingDesign } from '../types/avatar-ring-design';
import { parseBannerFrameDesign, type BannerFrameDesign } from '../types/banner-frame-design';
import { avatarRingMarkup, avatarRingSvg } from '../utils/appearance-svg';
import { bannerFrameClipPath, bannerFrameElements, bannerFrameMarkup, bannerFrameSvg } from '../utils/banner-frame-svg';
import { FRAME_MOTION_CSS, frameMotionLayers, pathBounds } from '../utils/frame-motion-svg';

/** Le nombre d'enroulements d'un chemin fait de segments droits (M, H, V, Z absolus) autour d'un point. */
const winding = (d: string, px: number, py: number): number => {
  const tokens = d.match(/[MHVZ]|-?\d*\.?\d+/g) ?? [];
  const polygons: [number, number][][] = [];
  let current: [number, number][] = [];
  let [x, y] = [0, 0];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token === 'M') {
      x = Number(tokens[++index]);
      y = Number(tokens[++index]);
      current = [[x, y]];
      polygons.push(current);
    } else if (token === 'H') {
      x = Number(tokens[++index]);
      current.push([x, y]);
    } else if (token === 'V') {
      y = Number(tokens[++index]);
      current.push([x, y]);
    }
  }
  return polygons.reduce((total, polygon) => {
    return (
      total +
      polygon.reduce((sum, [x1, y1], i) => {
        const [x2, y2] = polygon[(i + 1) % polygon.length]!;
        const cross = (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1);
        if (y1 <= py && y2 > py && cross > 0) return sum + 1;
        if (y1 > py && y2 <= py && cross < 0) return sum - 1;
        return sum;
      }, 0)
    );
  }, 0);
};

const frame = (over: Record<string, unknown> = {}): BannerFrameDesign =>
  parseBannerFrameDesign({
    key: 'haussmannien',
    viewBox: [0, 0, 300, 100],
    palette: ['#DCD2C0', '#A99B83', '#22262B', '#B8954F'],
    border: { width: 9.6, color: 0, opacity: 1, filets: [{ inset: 7.6, width: 0.5, color: 2, opacity: 1 }] },
    reach: { corner: 14, cartouche: { width: 40, depth: 16, edge: 'top' } },
    pieces: [
      { anchor: 'start', paths: [{ d: 'M2 2 h10 v10 h-10 Z', color: 3, opacity: 1, group: 'rosaces' }] },
      { anchor: 'end', paths: [{ d: 'M288 2 h10 v10 h-10 Z', color: 3, opacity: 1, group: 'rosaces' }] },
      { anchor: 'center', paths: [{ d: 'M140 0 L150 14 L160 0 Z', color: 3, opacity: 1 }] },
    ],
    friezes: [{ module: 4, from: 16, to: 16, fit: 'repeat', paths: [{ d: 'M16.5 2.2 h2.6 v3.2 h-2.6 Z', color: 1, opacity: 1 }] }],
    ...over,
  })!;

const ring = (over: Record<string, unknown> = {}): AvatarRingDesign =>
  parseAvatarRingDesign({
    key: 'etoile',
    stroke: { style: 'solid', width: 0.04, colors: ['#B8954F', '#FFD98A'] },
    ornament: {
      paths: [
        { d: 'M50 2 L52 6 L48 6 Z', color: 1, opacity: 1, group: 'etoiles' },
        { d: 'M50 94 L52 98 L48 98 Z', color: 1, opacity: 1, group: 'etoiles' },
        { d: 'M2 50 L6 52 L6 48 Z', color: 0, opacity: 1 },
      ],
    },
    ...over,
  })!;

describe('les bornes d’un chemin (origines des mouvements)', () => {
  it('lit les commandes absolues et relatives, courbes comprises', () => {
    expect(pathBounds('M2 2 h10 v10 h-10 Z')).toEqual({ minX: 2, minY: 2, maxX: 12, maxY: 12 });
    expect(pathBounds('M10 10 C 20 0 30 0 40 10 l-5 5')).toEqual({ minX: 10, minY: 0, maxX: 40, maxY: 15 });
    expect(pathBounds('M1.5.5 L3 4')).toEqual({ minX: 1.5, minY: 0.5, maxX: 3, maxY: 4 });
  });

  it('un chemin sans point n’a pas de bornes', () => {
    expect(pathBounds('Z')).toBeNull();
  });

  it('un arc compte par son point d’arrivée, un chemin tronqué s’arrête au dernier point lu', () => {
    expect(pathBounds('M0 0 A5 5 0 0 1 10 10')).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(pathBounds('M0 0 a5 5 0 0 1 4 -6')).toEqual({ minX: 0, minY: -6, maxX: 4, maxY: 0 });
    expect(pathBounds('M2 3 L8')).toEqual({ minX: 2, minY: 3, maxX: 2, maxY: 3 });
  });
});

describe('les mouvements d’un cadre se rendent sur transform et opacity seuls (#10935)', () => {
  it('la feuille de style ne porte que transform et opacity, s’arrête en mouvement réduit et en pause', () => {
    const animated = [...FRAME_MOTION_CSS.matchAll(/@keyframes[^{]+\{((?:[^{}]*\{[^}]*\})*)\}/g)].map((match) => match[1]!);
    expect(animated.length).toBeGreaterThanOrEqual(5);
    animated.forEach((body) => [...body.matchAll(/\{([^}]*)\}/g)].forEach((step) => expect(step[1]).toMatch(/^(transform|opacity):[^;]+$/)));
    expect(FRAME_MOTION_CSS).toContain('@media (prefers-reduced-motion: reduce)');
    expect(FRAME_MOTION_CSS).toContain('[data-frame-paused]');
    expect(FRAME_MOTION_CSS).toContain('[data-app-hidden]');
  });

  it('décale les cibles successives et regroupe celles qui bougent ensemble', () => {
    const elements = [{ group: 'a', bounds: { minX: 0, minY: 0, maxX: 2, maxY: 2 } }, { group: 'a', bounds: { minX: 10, minY: 0, maxX: 12, maxY: 2 } }, { bounds: null }];
    const staggered = frameMotionLayers({ elements, motions: [{ kind: 'twinkle', targets: ['a'], duration: 3.4, stagger: 0.8 }], center: { x: 50, y: 50 } });
    expect(staggered.layers.map((layer) => layer.elements)).toEqual([[0], [1]]);
    expect(staggered.layers.map((layer) => layer.chain[0]!.delay)).toEqual([0, 0.8]);
    const together = frameMotionLayers({ elements, motions: [{ kind: 'rotate', targets: ['a'], duration: 12 }], center: { x: 50, y: 50 } });
    expect(together.layers.map((layer) => layer.elements)).toEqual([[0, 1]]);
    expect(together.layers[0]!.chain[0]!.origin).toEqual({ x: 50, y: 50 });
    expect(together.animated).toEqual(new Set([0, 1]));
  });

  it('une pulsation s’ancre au centre de sa cible, une inclinaison à son bord haut', () => {
    const elements = [{ group: 'a', bounds: { minX: 10, minY: 20, maxX: 30, maxY: 40 } }];
    const pulse = frameMotionLayers({ elements, motions: [{ kind: 'pulse', targets: ['a'], duration: 2 }], center: { x: 50, y: 50 } });
    expect(pulse.layers[0]!.chain[0]!.origin).toEqual({ x: 20, y: 30 });
    const skew = frameMotionLayers({ elements, motions: [{ kind: 'skew', targets: ['a'], duration: 2 }], center: { x: 50, y: 50 } });
    expect(skew.layers[0]!.chain[0]!.origin).toEqual({ x: 20, y: 20 });
  });

  it('un reflet glisse sur sa cible sans la sortir de la couche fixe', () => {
    const elements = [{ group: 'bande', bounds: { minX: 0, minY: 0, maxX: 300, maxY: 10 } }];
    const plan = frameMotionLayers({ elements, motions: [{ kind: 'sweep', targets: ['bande'], duration: 6.5 }], center: { x: 150, y: 50 } });
    expect(plan.layers).toEqual([]);
    expect(plan.animated.size).toBe(0);
    expect(plan.sweeps.map((sweep) => sweep.elements)).toEqual([[0]]);
  });

  it('une rotation alternée balance de −a à +a, une rotation partielle inversée ralentit à ses bornes', () => {
    const elements = [{ group: 'a', bounds: { minX: 10, minY: 20, maxX: 30, maxY: 40 } }];
    const swing = frameMotionLayers({ elements, motions: [{ kind: 'rotate', targets: ['a'], duration: 4, direction: 'alternate', amplitude: 12, origin: 'bottom' }], center: { x: 50, y: 50 } });
    expect(swing.layers[0]!.chain[0]).toMatchObject({ direction: 'alternate', timing: 'ease-in-out', origin: { x: 20, y: 40 }, vars: { '--fm-from': '-12deg', '--fm-to': '12deg' } });
    const partial = frameMotionLayers({ elements, motions: [{ kind: 'rotate', targets: ['a'], duration: 4, direction: 'reverse', amplitude: 90 }], center: { x: 50, y: 50 } });
    expect(partial.layers[0]!.chain[0]).toMatchObject({ direction: 'reverse', timing: 'ease-in-out', vars: { '--fm-from': '0deg', '--fm-to': '90deg' } });
    const fullTurn = frameMotionLayers({ elements, motions: [{ kind: 'rotate', targets: ['a'], duration: 4 }], center: { x: 50, y: 50 } });
    expect(fullTurn.layers[0]!.chain[0]).toMatchObject({ direction: 'normal', timing: 'linear' });
  });

  it('une inclinaison inversée part dans l’autre sens, une cible sans bornes tourne autour du cadre', () => {
    const skew = frameMotionLayers({ elements: [{ group: 'a', bounds: null }], motions: [{ kind: 'skew', targets: ['a'], duration: 2, direction: 'reverse', amplitude: 4 }], center: { x: 50, y: 50 } });
    expect(skew.layers[0]!.chain[0]).toMatchObject({ direction: 'alternate-reverse', origin: { x: 50, y: 50 }, vars: { '--fm-from': '-4deg', '--fm-to': '4deg' } });
  });

  it('un mouvement sans cible n’anime rien, deux mouvements sur une cible s’emboîtent', () => {
    const elements = [{ group: 'a', bounds: { minX: 0, minY: 0, maxX: 2, maxY: 2 } }];
    expect(frameMotionLayers({ elements, motions: [{ kind: 'pulse', targets: ['absent'], duration: 2 }], center: { x: 50, y: 50 } })).toEqual({ layers: [], sweeps: [], animated: new Set() });
    const nested = frameMotionLayers({ elements, motions: [{ kind: 'pulse', targets: ['a'], duration: 2 }, { kind: 'twinkle', targets: ['a'], duration: 3 }], center: { x: 50, y: 50 } });
    expect(nested.layers).toHaveLength(1);
    expect(nested.layers[0]!.chain.map((step) => step.kind)).toEqual(['pulse', 'twinkle']);
  });
});

describe('le contour d’avatar animé (#10935)', () => {
  it('un contour sans trait de base (`none`) ne peint que son ornement (#10936)', () => {
    const bare = ring({ stroke: { style: 'none', width: 0.02, colors: ['#B8954F', '#FFD98A'] } });
    const svg = avatarRingSvg({ ring: bare, size: 64 });
    expect(svg).not.toContain('<circle');
    expect(svg).toContain('<path');
  });

  it('sans mouvement, ou fixe, le balisage est le rendu de référence à l’octet', () => {
    expect(avatarRingMarkup({ ring: ring(), size: 64, animated: true })).toBe(avatarRingSvg({ ring: ring(), size: 64 }));
    const moving = ring({ motion: [{ kind: 'twinkle', targets: ['etoiles'], duration: 3 }] });
    expect(avatarRingMarkup({ ring: moving, size: 64, animated: false })).toBe(avatarRingSvg({ ring: moving, size: 64 }));
  });

  it('les chemins animés quittent la couche fixe pour une couche que le GPU compose', () => {
    const moving = ring({ motion: [{ kind: 'rotate', targets: ['etoiles'], duration: 12 }] });
    const markup = avatarRingMarkup({ ring: moving, size: 64, animated: true });
    const [base, ...layers] = markup.split('<span');
    expect(base).not.toContain('M50 2 L52 6');
    expect(base).toContain('M2 50 L6 52');
    expect(layers).toHaveLength(1);
    expect(layers[0]).toContain('class="fm"');
    expect(layers[0]).toContain('animation-name:fm-rotate');
    expect(layers[0]).toContain('transform-origin:32px 32px');
    expect(layers[0]).toContain('M50 2 L52 6');
    expect(layers[0]).toContain('M50 94 L52 98');
  });

  it('un trait à dégradé se peint par son dégradé, sa couleur restant le repli', () => {
    const gradient = ring({
      gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 0, at: 0 }, { color: 1, at: 1, opacity: 0.5 }] }],
      ornament: { paths: [{ d: 'M50 2 L52 6 L48 6 Z', color: 1, opacity: 1, gradient: 0 }] },
    });
    const svg = avatarRingSvg({ ring: gradient, size: 64 });
    expect(svg).toMatch(/<linearGradient id="([^"]+)" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B8954F"\/><stop offset="1" stop-color="#FFD98A" stop-opacity="0.5"\/><\/linearGradient>/);
    const id = /<linearGradient id="([^"]+)"/.exec(svg)![1];
    expect(svg).toContain(`fill="url(#${id})"`);
  });
});

describe('le cadre de bannière se pose sur la photo, centre transparent (#10935)', () => {
  it('la découpe exclut le trou et garde la bordure, les coins et le cartouche', () => {
    const clip = bannerFrameClipPath(frame(), 450);
    expect(winding(clip, 225, 50)).toBe(0);
    expect(winding(clip, 100, 50)).toBe(0);
    expect(winding(clip, 4, 50)).not.toBe(0);
    expect(winding(clip, 446, 50)).not.toBe(0);
    expect(winding(clip, 12, 12)).not.toBe(0);
    expect(winding(clip, 225, 15)).not.toBe(0);
    expect(winding(clip, 225, 85)).toBe(0);
  });

  it('un chemin posé dans le trou est sous la découpe : rien du cadre ne se peint hors de la région', () => {
    const intruder = frame({ pieces: [{ anchor: 'center', paths: [{ d: 'M100 30 h100 v40 h-100 Z', color: 2, opacity: 1 }] }] });
    const svg = bannerFrameSvg({ frame: intruder, width: 360, height: 120 });
    const clipId = /<clipPath id="([^"]+)">/.exec(svg)![1];
    const body = svg.slice(svg.indexOf('</defs>') + '</defs>'.length, -'</svg>'.length);
    expect(body.startsWith(`<g clip-path="url(#${clipId})">`)).toBe(true);
    expect(body.endsWith('</g>')).toBe(true);
    expect(body.match(/<g clip-path=/g)).toHaveLength(1);
    const markup = bannerFrameMarkup({ frame: intruder, width: 360, height: 120, animated: true });
    expect(markup.startsWith('<span data-banner-frame-art="haussmannien" style="position:absolute;inset:0;clip-path:path(')).toBe(true);
  });

  it('la bordure et les filets se tracent à la largeur réelle, jamais étirés', () => {
    const svg = bannerFrameSvg({ frame: frame(), width: 600, height: 100 });
    expect(svg).toContain('viewBox="0 0 600 100"');
    expect(svg).toContain('d="M0 0H600V100H0ZM9.6 9.6V90.4H590.4V9.6Z"');
    expect(svg).toContain('<rect x="7.6" y="7.6" width="584.8" height="84.8"');
  });

  it('les pièces gardent leur ancrage, les frises répètent des modules entiers', () => {
    const elements = bannerFrameElements(frame(), 600);
    const end = elements.find((element) => element.path.d.startsWith('M288'))!;
    expect(end.transform).toEqual({ tx: 300, sx: 1 });
    const center = elements.find((element) => element.path.d.startsWith('M140'))!;
    expect(center.transform).toEqual({ tx: 150, sx: 1 });
    const modules = elements.filter((element) => element.path.d.startsWith('M16.5'));
    expect(modules).toHaveLength(142);
    expect(modules[1]!.transform.tx - modules[0]!.transform.tx).toBe(4);
  });

  it('les coins et le cartouche se posent PAR-DESSUS les frises : les frises d’abord, les pièces ensuite (#10936)', () => {
    const elements = bannerFrameElements(frame(), 600);
    const firstPiece = elements.findIndex((element) => element.transform.sx === 1 && !element.path.d.startsWith('M16.5'));
    const lastModule = elements.map((element) => element.path.d.startsWith('M16.5')).lastIndexOf(true);
    expect(lastModule).toBeLessThan(firstPiece);
  });

  it('un trait se trace en contour, une règle de remplissage se transmet, une frise justifiée se pose à l’échelle', () => {
    const stroked = frame({
      border: { width: 9.6, color: 0, opacity: 1 },
      pieces: [{ anchor: 'start', paths: [{ d: 'M2 2 h10', color: 2, opacity: 0.5, width: 1.2 }, { d: 'M2 2 h10 v10 h-10 Z', color: 3, opacity: 1, fillRule: 'evenodd' }] }],
      friezes: [{ module: 5, from: 16, to: 16, fit: 'justify', paths: [{ d: 'M16 2 h5 v3 h-5 Z', color: 1, opacity: 1 }] }],
    });
    const svg = bannerFrameSvg({ frame: stroked, width: 400, height: 100 });
    expect(svg).toContain('<path d="M2 2 h10" fill="none" stroke="#22262B" stroke-width="1.2" stroke-opacity="0.5"/>');
    expect(svg).toContain('fill-rule="evenodd"/>');
    expect(svg).not.toContain('<rect');
    expect(svg).toMatch(/<g transform="translate\([^ ]+ 0\) scale\([0-9.]+ 1\)">/);
  });

  it('une frise justifiée recalcule son module pour tomber juste', () => {
    const justified = frame({ friezes: [{ module: 5, from: 16, to: 16, fit: 'justify', paths: [{ d: 'M16 2 h5 v3 h-5 Z', color: 1, opacity: 1 }] }] });
    const modules = bannerFrameElements(justified, 400).filter((element) => element.path.d.startsWith('M16 2'));
    expect(modules).toHaveLength(74);
    const last = modules.at(-1)!;
    expect(last.transform.tx + 21 * last.transform.sx).toBeCloseTo(384, 6);
  });

  it('les mouvements d’un cadre de bannière ciblent ses groupes, rien ne bouge en mode fixe', () => {
    const moving = frame({ motion: [{ kind: 'twinkle', targets: ['rosaces'], duration: 3.4, stagger: 0.8 }] });
    const animated = bannerFrameMarkup({ frame: moving, width: 300, height: 100, animated: true });
    expect(animated.match(/animation-name:fm-twinkle/g)).toHaveLength(2);
    expect(animated).toContain('animation-delay:0.8s');
    const still = bannerFrameMarkup({ frame: moving, width: 300, height: 100, animated: false });
    expect(still).not.toContain('animation-name');
    expect(still).toContain('M288 2');
  });

  it('un reflet glisse sur un cadre de bannière, découpé en blanc à la forme de ses cibles, et la cible reste peinte fixe', () => {
    const sweeping = frame({ motion: [{ kind: 'sweep', targets: ['rosaces'], duration: 6.5, delay: 1, direction: 'reverse' }] });
    const markup = bannerFrameMarkup({ frame: sweeping, width: 600, height: 200, animated: true });
    expect(markup.match(/<span data-frame-sweep/g)).toHaveLength(1);
    expect(markup).toContain('animation-name:fm-sweep');
    expect(markup).toContain('animation-direction:reverse');
    expect(markup).toContain('animation-delay:1s');
    const mask = decodeURIComponent(/mask-image:url\('data:image\/svg\+xml,([^']+)'\)/.exec(markup)![1]!);
    expect(mask).toContain('viewBox="0 0 300 100"');
    expect(mask.match(/fill="#FFFFFF" fill-opacity="1"/g)).toHaveLength(2);
    const fixed = markup.slice(0, markup.indexOf('<span data-frame-sweep'));
    expect(fixed).toContain('M288 2');
  });

  it('une couche animée de cadre de bannière emporte ses dégradés et sa pièce déplacée', () => {
    const graded = frame({
      gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ color: 0, at: 0 }, { color: 3, at: 1 }] }],
      pieces: [{ anchor: 'end', paths: [{ d: 'M288 2 h10 v10 h-10 Z', color: 3, opacity: 1, gradient: 0, group: 'rosaces' }] }],
      motion: [{ kind: 'pulse', targets: ['rosaces'], duration: 2 }],
    });
    const markup = bannerFrameMarkup({ frame: graded, width: 600, height: 100, animated: true });
    const layer = markup.slice(markup.indexOf('<span class="fm"'));
    expect(layer).toMatch(/<defs><linearGradient id="fg0-[^"]+-L0"/);
    expect(layer).toContain('<g transform="translate(300 0)">');
    expect(layer).toMatch(/fill="url\(#fg0-[^"]+-L0\)"/);
  });
});
