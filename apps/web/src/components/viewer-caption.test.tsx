import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { screenGestureYields } from '@/lib/view/shortcut-scope';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ViewerCaption } from './viewer-caption';

/**
 * **UNE LÉGENDE POSÉE SUR UN MÉDIA OUVRE SES ADRESSES** (#9074) — sans voler
 * le geste du lecteur : un tap sur le TEXTE passe toujours à l'hôte (avancer
 * la story, ouvrir la visionneuse), un tap sur un LIEN reste au lien.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root !== null) {
    const mounted = root;
    act(() => mounted.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

function mount(node: React.ReactNode): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  act(() => {
    mounted.render(node as never);
  });
  return container;
}

const TRACKED = [{ url: 'https://exemple.org/promo', token: 'Promo42' }] as const;

describe('ViewerCaption — les adresses', () => {
  test('une URL de la carte passe par /l/<token> et s’affiche m+<token> (#9093)', () => {
    const c = mount(<ViewerCaption text="voir https://exemple.org/promo" trackingLinks={TRACKED} />);
    const link = c.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/l/Promo42');
    expect(link?.textContent).toBe('m+Promo42');
  });

  test('une URL hors carte est un lien direct, sans opener ni referrer', () => {
    const c = mount(<ViewerCaption text="voir https://ailleurs.net/x" trackingLinks={TRACKED} />);
    const link = c.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://ailleurs.net/x');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  test('le lien prend la couleur héritée de la légende', () => {
    const c = mount(<ViewerCaption text="https://ailleurs.net/x" />);
    expect((c.querySelector('a') as HTMLAnchorElement).style.color).toBe('inherit');
  });
});

describe('ViewerCaption — le geste', () => {
  test('le lien réclame le geste ; le texte ne le réclame pas', () => {
    const c = mount(<ViewerCaption text="avant https://ailleurs.net/x après" />);
    const link = c.querySelector('a') as HTMLAnchorElement;
    const paragraph = c.querySelector('[data-rich-text]') as HTMLElement;
    expect(screenGestureYields({ target: link, layerOpen: false })).toBe(true);
    expect(screenGestureYields({ target: paragraph, layerOpen: false })).toBe(false);
  });

  test('les liens restent cliquables sous un chrome `pointer-events-none`', () => {
    const c = mount(<ViewerCaption text="https://ailleurs.net/x" />);
    expect(c.querySelector('[data-rich-text]')?.className).toContain('[&_a]:pointer-events-auto');
  });

  test('un clic sur un lien ne remonte pas à l’hôte ; un clic sur le texte, si', () => {
    const heard: string[] = [];
    const c = mount(
      <div
        onClick={() => heard.push('click')}
        onPointerDown={() => heard.push('down')}
        onPointerUp={() => heard.push('up')}
      >
        <ViewerCaption text="avant https://ailleurs.net/x après" />
      </div>,
    );
    const link = c.querySelector('a') as HTMLAnchorElement;
    link.addEventListener('click', (event) => event.preventDefault());
    act(() => {
      link.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      link.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(heard).toEqual([]);
    const paragraph = c.querySelector('[data-rich-text]') as HTMLElement;
    act(() => {
      paragraph.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      paragraph.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      paragraph.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(heard).toEqual(['down', 'up', 'click']);
  });

  test('les sondes et la langue voyagent jusqu’au paragraphe', () => {
    const c = mount(<ViewerCaption text="hola" lang="es" probe={{ 'data-story-media-caption': '' }} />);
    const paragraph = c.querySelector('[data-rich-text]') as HTMLElement;
    expect(paragraph.getAttribute('lang')).toBe('es');
    expect(paragraph.hasAttribute('data-story-media-caption')).toBe(true);
  });
});
