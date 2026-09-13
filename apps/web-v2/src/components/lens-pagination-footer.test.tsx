import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { LensPaginationFooter } from './lens-pagination-footer';

function render(props: Parameters<typeof LensPaginationFooter>[0]): string {
  return renderToStaticMarkup(<LensPaginationFooter {...props} />);
}

describe('LensPaginationFooter', () => {
  test('loading-more ⇒ role=status, un TEXTE annonçable, les points', () => {
    const html = render({ state: 'loading-more', showsAllLoadedHint: false, onRetry: () => {}, sentinelRef: null });
    expect(html).toContain('data-pagination-footer="loading-more"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Chargement de la suite');
  });

  /** Le rôle `listitem` du `<li>` n'est PAS écrasé (revue-correction #6195) :
   * `role="status"` vit sur un enfant, et la région porte un CONTENU textuel,
   * jamais un seul `aria-label` qu'aucune région live n'annonce. */
  test('loading-more ⇒ le <li> ne porte AUCUN role, la région live porte du texte', () => {
    const html = render({ state: 'loading-more', showsAllLoadedHint: false, onRetry: () => {}, sentinelRef: null });
    expect(html).not.toMatch(/<li[^>]*role=/);
    expect(html).not.toContain('aria-label="Chargement de la suite"');
    expect(html).toMatch(/role="status"[^>]*>.*Chargement de la suite/);
  });

  /** CONTRASTE AA DANS LES DEUX SCHÉMAS (revue-correction #6195) — indigo400
   * servi tel quel mesure 2,98:1 sur la surface CLAIRE. */
  test('l’encre du pied bascule en indigo600 sous le schéma clair', () => {
    for (const state of ['loading-more', 'error'] as const) {
      const html = render({ state, showsAllLoadedHint: false, onRetry: () => {}, sentinelRef: null });
      expect(html).toContain('light:text-[color:var(--ios-indigo-600)]');
      expect(html).not.toContain('color:var(--ios-indigo-400);');
    }
  });

  test('exhausted + showsAllLoadedHint:true ⇒ le texte "Toutes les conversations sont chargées"', () => {
    const html = render({ state: 'exhausted', showsAllLoadedHint: true, onRetry: () => {}, sentinelRef: null });
    expect(html).toContain('Toutes les conversations sont chargées');
  });

  test('exhausted + showsAllLoadedHint:false ⇒ RIEN, pas même un <li> vide', () => {
    const html = render({ state: 'exhausted', showsAllLoadedHint: false, onRetry: () => {}, sentinelRef: null });
    expect(html).toBe('');
  });

  /** `exhaustedLabel` (#5893) — le fil des publications réutilise ce même
   * pied pour un corpus de POSTS, pas de conversations. */
  test('exhaustedLabel PARAMÉTRÉ ⇒ remplace le texte par défaut, sans le dupliquer', () => {
    const html = render({
      state: 'exhausted',
      showsAllLoadedHint: true,
      onRetry: () => {},
      sentinelRef: null,
      exhaustedLabel: 'Toutes les publications sont chargées',
    });
    expect(html).toContain('Toutes les publications sont chargées');
    expect(html).not.toContain('Toutes les conversations sont chargées');
  });

  test('error ⇒ le texte + le bouton Réessayer (cible ≥ 44 px)', () => {
    const html = render({ state: 'error', showsAllLoadedHint: false, onRetry: () => {}, sentinelRef: null });
    expect(html).toContain('Impossible de charger plus');
    expect(html).toContain('Réessayer');
    expect(html).toContain('min-height:44px');
  });

  test('idle ⇒ <li data-load-more-sentinel aria-hidden style height:1px>', () => {
    const html = render({ state: 'idle', showsAllLoadedHint: false, onRetry: () => {}, sentinelRef: null });
    expect(html).toContain('data-load-more-sentinel');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('height:1px');
  });

  test('data-pagination-footer porte le state courant sur chaque cas rendu', () => {
    for (const state of ['loading-more', 'error', 'idle'] as const) {
      const html = render({ state, showsAllLoadedHint: true, onRetry: () => {}, sentinelRef: null });
      expect(html).toContain(`data-pagination-footer="${state}"`);
    }
  });
});

/** Loi 4 (« un contrôle existe s'il a un EFFET ») — le bouton Réessayer
 * appelle bien `onRetry`, motif `use-load-more-sentinel.test.tsx`. */
describe('LensPaginationFooter — Réessayer a un EFFET', () => {
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

  test('clic sur Réessayer ⇒ onRetry appelé', () => {
    let calls = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <ul>
          <LensPaginationFooter state="error" showsAllLoadedHint={false} onRetry={() => (calls += 1)} sentinelRef={null} />
        </ul>,
      );
    });
    const button = container.querySelector('button');
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(calls).toBe(1);
  });
});
