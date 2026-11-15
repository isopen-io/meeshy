import { describe, expect, test } from 'bun:test';

import { BACKDROP_VEIL_MAX, CARD_MAX_HEIGHT, layoutMessageCard, type MessageCardInput } from './message-card-layout';
import { cardOutputsOf } from './message-card-output';
import { paintMessageCard } from './message-card-paint';
import {
  SCROLL_LEAD_IN_S,
  SCROLL_LEAD_OUT_S,
  SCROLL_MAX_DURATION_S,
  SCROLL_MAX_HEIGHT,
  SCROLL_PIXELS_PER_SECOND,
  SCROLL_SPEEDS,
  opsBetween,
  scrollDurationLabel,
  scrollOffsetAt,
  scrollPlanOf,
  scrollSpeedLabel,
} from './message-card-scroll';
import { templateOf } from './message-card-templates';

const measure = (text: string) => text.length * 18;
const long = Array.from({ length: 160 }, (_, i) => `Ligne ${i} d’une très longue réponse qui ne tient pas dans une story`).join(' ');

const input = (overrides: Partial<MessageCardInput> = {}): MessageCardInput => ({
  quoted: { author: 'Awa', text: 'Tu racontes ?' },
  reply: { author: 'Jacques', text: long },
  handle: 'jacques',
  template: 'aurore.rond.orbite',
  aspect: 'story',
  ...overrides,
});

describe('la vitesse et le plan d’une carte qui défile (#18671)', () => {
  test('neuf vitesses, de ×0,5 à ×3, dites dans la décimale de la langue', () => {
    expect(SCROLL_SPEEDS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]);
    expect(scrollSpeedLabel(0.75, 'fr')).toBe('×0,75');
    expect(scrollSpeedLabel(0.75, 'en')).toBe('×0.75');
  });

  test('une carte qui tient dans son format n’a rien à faire défiler', () => {
    expect(scrollPlanOf(1920, 1920, 1)).toBeNull();
    expect(scrollPlanOf(1000, 1920, 1)).toBeNull();
  });

  test('la vitesse ×2 parcourt la carte deux fois plus vite, entre un instant immobile au début et à la fin', () => {
    const slow = scrollPlanOf(1920 + 540, 1920, 1);
    const fast = scrollPlanOf(1920 + 540, 1920, 2);
    expect(slow?.scrollDuration).toBeCloseTo(540 / SCROLL_PIXELS_PER_SECOND, 5);
    expect(fast?.scrollDuration).toBeCloseTo(540 / SCROLL_PIXELS_PER_SECOND / 2, 5);
    expect(slow?.duration).toBeCloseTo(SCROLL_LEAD_IN_S + 10 + SCROLL_LEAD_OUT_S, 5);
  });

  test('la vidéo ne dépasse jamais trois minutes : au-delà, le défilement accélère', () => {
    expect(scrollPlanOf(SCROLL_MAX_HEIGHT, 1920, 0.5)?.duration).toBeCloseTo(SCROLL_MAX_DURATION_S, 5);
  });

  test('le décalage reste à zéro pendant l’entrée, croît, puis s’arrête sur la dernière ligne', () => {
    const plan = scrollPlanOf(2460, 1920, 1);
    if (plan === null) throw new Error('plan attendu');
    expect(scrollOffsetAt(plan, 0)).toBe(0);
    expect(scrollOffsetAt(plan, SCROLL_LEAD_IN_S + plan.scrollDuration / 2)).toBeCloseTo(270, 5);
    expect(scrollOffsetAt(plan, plan.duration)).toBe(540);
  });

  test('la durée se dit à la seconde, en minutes au-delà d’une', () => {
    expect(scrollDurationLabel(38.4, 'fr')).toContain('38');
    expect(scrollDurationLabel(72, 'fr')).toMatch(/1.*12/);
  });
});

describe('la mise en page d’une carte qui défile (#18671)', () => {
  test('sans défilement, le texte long se réduit et se coupe dans le format ; en défilant, il s’allonge sous une fenêtre de story', () => {
    const still = layoutMessageCard(input(), measure);
    const scrolling = layoutMessageCard(input({ unbounded: true }), measure);
    expect(still.truncated).toBe(true);
    expect(still.viewportHeight ?? null).toBeNull();
    expect(scrolling.truncated).toBe(false);
    expect(scrolling.viewportHeight).toBe(1920);
    expect(scrolling.height).toBeGreaterThan(1920);
    expect(scrolling.height).toBeLessThanOrEqual(SCROLL_MAX_HEIGHT);
  });

  test('un texte court ne défile pas, même demandé', () => {
    const short = layoutMessageCard(input({ reply: { author: 'Jacques', text: 'Oui' }, aspect: 'auto', unbounded: true }), measure);
    expect(short.height).toBeLessThanOrEqual(CARD_MAX_HEIGHT);
    expect(short.viewportHeight).toBeNull();
  });

  test('une image de la vidéo ne peint que ce que sa fenêtre montre', () => {
    const scrolling = layoutMessageCard(input({ unbounded: true }), measure);
    const all = scrolling.ops.filter((op) => op.kind === 'text').length;
    const shown = opsBetween(scrolling, 0, 1920).filter((op) => op.kind === 'text').length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(all);
  });
});

describe('la photo ou la vidéo choisie en fond (#18672)', () => {
  test('ses pixels suivent ceux des médias, sous un voile de la palette réglable et borné', () => {
    const card = layoutMessageCard(input({ media: [{ kind: 'image', width: 4, height: 3 }], chosenBackdrop: { video: true, veil: 0.3 } }), measure);
    expect(card.backdrop?.index).toBe(1);
    expect(card.backdrop?.video).toBe(true);
    expect(card.backdrop?.veil.endsWith(', 0.3)')).toBe(true);
    const capped = layoutMessageCard(input({ chosenBackdrop: { video: false, veil: 2 } }), measure);
    expect(capped.backdrop?.veil.endsWith(`, ${BACKDROP_VEIL_MAX})`)).toBe(true);
  });

  test('une carte sur une vidéo choisie, ou qui défile, s’offre en vidéo', () => {
    expect(cardOutputsOf([], { scrolls: true, backdropVideo: false })).toEqual(['image', 'video']);
    expect(cardOutputsOf([], { scrolls: false, backdropVideo: true })).toEqual(['image', 'video']);
    expect(cardOutputsOf([], { scrolls: false, backdropVideo: false })).toEqual(['image']);
  });
});

describe('une image de la vidéo qui défile', () => {
  const recorder = () => {
    const rects: number[][] = [];
    const drawn: number[][] = [];
    const texts: string[] = [];
    const moves: number[][] = [];
    const gradient = { addColorStop: () => {} };
    const ctx = {
      fillStyle: '' as string | CanvasGradient | CanvasPattern,
      strokeStyle: '' as string | CanvasGradient | CanvasPattern,
      lineWidth: 1,
      lineCap: 'butt' as CanvasLineCap,
      font: '',
      textAlign: 'left' as CanvasTextAlign,
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      direction: 'ltr' as CanvasDirection,
      globalAlpha: 1,
      fillRect: (...args: number[]) => rects.push(args),
      fillText: (text: string) => texts.push(text),
      measureText: (text: string) => ({ width: text.length * 18 }) as TextMetrics,
      beginPath: () => {},
      arc: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      setLineDash: () => {},
      save: () => {},
      restore: () => {},
      translate: (...args: number[]) => moves.push(args),
      rotate: () => {},
      createLinearGradient: () => gradient as unknown as CanvasGradient,
      createRadialGradient: () => gradient as unknown as CanvasGradient,
      roundRect: () => {},
      closePath: () => {},
      clip: () => {},
      drawImage: (...args: unknown[]) => drawn.push(args.slice(1).map(Number)),
    };
    return { ctx, rects, drawn, texts, moves };
  };

  test('le fond, le voile et le filigrane remplissent la fenêtre ; le contenu glisse du décalage', () => {
    const layout = layoutMessageCard(input({ unbounded: true, chosenBackdrop: { video: false, veil: 0.5 } }), measure);
    const { ctx, rects, drawn, texts, moves } = recorder();
    paintMessageCard(ctx, layout, templateOf('aurore.rond.orbite'), { sources: [{ width: 1000, height: 1000 } as unknown as CanvasImageSource], scrollOffset: 300 });
    expect(rects.every(([, , , h]) => h === 1920)).toBe(true);
    expect(drawn[0]?.[3]).toBeGreaterThanOrEqual(1920);
    expect(drawn[0]?.[3]).toBeLessThan(layout.height);
    expect(texts).toContain('Meeshy @jacques');
    expect(moves).toContainEqual([0, -300]);
  });
});
