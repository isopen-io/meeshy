import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { BackGlyph, BUTTON, GLYPH_SIZE, SCREEN_HEADER_HEIGHT, ScreenHeader } from './ui-chrome';

/**
 * LES PRIMITIVES DU CHROME (#8879) — ce qu'un écran reçoit quand il monte
 * l'en-tête canonique, la flèche de retour et l'échelle des glyphes, au lieu
 * de les réécrire (dix routes portaient chacune leur `HEADER_HEIGHT = 64`).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

describe("ScreenHeader — l'en-tête d'écran, retour à gauche", () => {
  test('pose la hauteur canonique, le titre en h1, et ordonne retour · titre · actions', async () => {
    const container = await mounter.mount(
      <ScreenHeader
        leading={<button type="button" aria-label="Retour" data-probe="back" />}
        title="Notifications"
        subtitle="3"
        trailing={<button type="button" data-probe="action" />}
      />,
    );
    const header = container.querySelector('header');
    expect(header?.style.height).toBe(`${SCREEN_HEADER_HEIGHT}px`);
    expect(container.querySelector('h1')?.textContent).toBe('Notifications');
    const order = [...(header?.querySelectorAll('[data-probe], h1') ?? [])].map((node) => node.getAttribute('data-probe') ?? 'title');
    expect(order).toEqual(['back', 'title', 'action']);
    expect(container.textContent).toContain('3');
  });

  test('sans sous-titre ni action, il ne rend que le retour et le titre', async () => {
    const container = await mounter.mount(<ScreenHeader leading={<span data-probe="back" />} title="Réglages" />);
    expect(container.querySelector('header')?.children.length).toBe(2);
  });
});

describe('BackGlyph — la flèche de retour, dessinée dans le disque du chrome', () => {
  test("un chevron gauche, retourné en écriture de droite à gauche, au centre du disque", async () => {
    const container = await mounter.mount(<BackGlyph />);
    const disc = container.querySelector('[data-chrome-disc]');
    const svg = disc?.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe(String(GLYPH_SIZE.md));
    expect(svg?.getAttribute('class')).toContain('rtl:-scale-x-100');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe("GLYPH_SIZE — l'échelle FERMÉE des glyphes", () => {
  test('cinq pas strictement croissants, alignés sur les tailles de symboles des vues iOS', () => {
    expect(GLYPH_SIZE).toEqual({ xs: 12, sm: 14, md: 16, lg: 20, xl: 28 });
  });
});

describe('BUTTON — les classes canoniques des boutons', () => {
  test('chaque rôle nomme SON utilitaire de styles/ui.css', () => {
    expect(BUTTON).toEqual({
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      destructive: 'btn-destructive',
      icon: 'btn-icon',
      onMedia: 'btn-on-media',
    });
  });
});
