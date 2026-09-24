import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { DayPill, NoticePill, OlderLoadIndicator, ScrollToBottomButton } from './thread-chrome';

describe('DayPill (#5774, travail 3/3, T9)', () => {
  test('label present, en-tete replie -> un role=heading aria-level=2 au texte, aria-hidden absent, pointer-events none', () => {
    const html = renderToStaticMarkup(<DayPill label="Hier" headerExpanded={false} />);
    expect(html).toContain('role="heading"');
    expect(html).toContain('aria-level="2"');
    expect(html).toContain('>Hier<');
    expect(html).not.toContain('aria-hidden');
    expect(html).toContain('pointer-events-none');
  });

  test('en-tete DEPLIE -> rien ne se monte, quel que soit le libelle', () => {
    const html = renderToStaticMarkup(<DayPill label="Hier" headerExpanded />);
    expect(html).toBe('');
  });

  test('aucun libelle -> rien ne se monte', () => {
    const html = renderToStaticMarkup(<DayPill label={null} headerExpanded={false} />);
    expect(html).toBe('');
  });
});

describe('ScrollToBottomButton (#5774, travail 3/3)', () => {
  test('invisible -> ne se monte pas', () => {
    const html = renderToStaticMarkup(
      <ScrollToBottomButton visible={false} unreadCount={0} onClick={() => {}} />,
    );
    expect(html).toBe('');
  });

  test('visible, sans non-lus -> cible 44pt, libelle "Defiler vers le bas", chevron seul', () => {
    const html = renderToStaticMarkup(<ScrollToBottomButton visible unreadCount={0} onClick={() => {}} />);
    expect(html).toContain('aria-label="Défiler vers le bas"');
    expect(html).toContain('min-h-11');
    expect(html).toContain('min-w-11');
  });

  test('visible, 3 non-lus en DM -> libelle pluriel, apercu SANS nom', () => {
    const html = renderToStaticMarkup(
      <ScrollToBottomButton visible unreadCount={3} previewText="Salut" onClick={() => {}} />,
    );
    expect(html).toContain('aria-label="3 messages non lus, Défiler vers le bas"');
    expect(html).toContain('>Salut<');
    expect(html).not.toContain('messages non lus<');
  });

  test('visible, 6 non-lus en GROUPE -> en-tete "N messages non lus" ET apercu prefixe par le nom', () => {
    const html = renderToStaticMarkup(
      <ScrollToBottomButton visible unreadCount={6} senderName="Bruno" previewText="Salut" onClick={() => {}} />,
    );
    expect(html).toContain('6 messages non lus<');
    expect(html).toContain('>Bruno : Salut<');
  });

  test('5 non-lus (borne) -> pas d en-tete "N messages", seulement l apercu', () => {
    const html = renderToStaticMarkup(
      <ScrollToBottomButton visible unreadCount={5} senderName="Bruno" previewText="Salut" onClick={() => {}} />,
    );
    expect(html).not.toContain('messages non lus<');
    expect(html).toContain('>Bruno : Salut<');
  });
});

describe('OlderLoadIndicator (#6972, extrait de routes/thread.tsx au lot #7429)', () => {
  test('state hors loading-more/error -> rien ne se monte', () => {
    const html = renderToStaticMarkup(<OlderLoadIndicator state="idle" onRetry={() => {}} />);
    expect(html).toBe('');
    const exhausted = renderToStaticMarkup(<OlderLoadIndicator state="exhausted" onRetry={() => {}} />);
    expect(exhausted).toBe('');
  });

  test('loading-more -> role=status et texte sr-only "Chargement des messages plus anciens"', () => {
    const html = renderToStaticMarkup(<OlderLoadIndicator state="loading-more" onRetry={() => {}} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Chargement des messages plus anciens');
  });

  test('error -> bouton "Historique indisponible · Réessayer", cible 44px', () => {
    const html = renderToStaticMarkup(<OlderLoadIndicator state="error" onRetry={() => {}} />);
    expect(html).toContain('Historique indisponible');
    expect(html).toContain('Réessayer');
    expect(html).toContain('min-height:44px');
  });

  describe('error -> le clic déclenche onRetry UNE fois (loi 4 : un contrôle existe s’il a un effet)', () => {
    const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    let container: HTMLDivElement;
    let root: Root;

    beforeAll(() => {
      ensureHappyDomRegistered();
      globals.IS_REACT_ACT_ENVIRONMENT = true;
    });

    afterAll(async () => {
      await act(async () => {});
      delete globals.IS_REACT_ACT_ENVIRONMENT;
      await releaseHappyDomIfRegistered();
    });

    afterEach(() => {
      act(() => {
        root.unmount();
      });
      container.remove();
    });

    test('un clic appelle onRetry exactement une fois', () => {
      let calls = 0;
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => {
        root.render(<OlderLoadIndicator state="error" onRetry={() => (calls += 1)} />);
      });
      const button = container.querySelector('button');
      expect(button).not.toBeNull();
      act(() => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(calls).toBe(1);
    });
  });
});

describe('NoticePill (revue #5814, défaut majeur 10 ; extrait de routes/thread.tsx au lot #7429)', () => {
  test('texte vide -> rien ne se monte', () => {
    expect(renderToStaticMarkup(<NoticePill text="" />)).toBe('');
  });

  test('texte non vide -> aria-hidden, pointer-events-none, contient le texte, ancré au bord bas mesuré', () => {
    const html = renderToStaticMarkup(<NoticePill text="Message copié" />);
    expect(html).toContain('aria-hidden');
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('>Message copié<');
    expect(html).toContain('bottom:var(--thread-notice-bottom)');
  });
});
