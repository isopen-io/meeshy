import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { PublicationLanguageBar, type PublicationLanguageBarProps } from './publication-language-bar';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

async function monter(props: Partial<PublicationLanguageBarProps> = {}): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const full: PublicationLanguageBarProps = {
    languages: ['fr', 'en'],
    active: 'fr',
    language: 'fr',
    onSelect: () => {},
    onClose: () => {},
    ...props,
  };
  await act(async () => root?.render(<PublicationLanguageBar {...full} />));
  return container;
}

describe('PublicationLanguageBar — un chip par langue prête, et rien d’inerte', () => {
  test('un chip par langue, dans l’ordre reçu, avec le drapeau et un nom accessible', async () => {
    const host = await monter();
    const chips = [...host.querySelectorAll<HTMLButtonElement>('[data-story-language]')];
    const codes = chips.map((c) => c.getAttribute('data-story-language'));
    expect(codes).toEqual(['original', 'fr', 'en']);
    const en = host.querySelector<HTMLButtonElement>('[data-story-language="en"]');
    expect(en?.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
    expect(en?.querySelector('span[aria-hidden="true"]')).not.toBeNull();
  });

  test('la cible mesure au moins 44×44 (dimension 5)', async () => {
    const host = await monter();
    const en = host.querySelector<HTMLButtonElement>('[data-story-language="en"]');
    expect(en?.style.minWidth).toBe('44px');
    expect(en?.style.minHeight).toBe('44px');
  });

  test('le chip « Original » est PREMIER, libellé « Original »', async () => {
    const host = await monter();
    const first = host.querySelector('[data-story-language]');
    expect(first?.getAttribute('data-story-language')).toBe('original');
    expect(first?.textContent).toBe('Original');
  });

  test('l’actif porte aria-pressed="true", les autres "false" — base BCP-47, casse ignorée', async () => {
    const host = await monter({ languages: ['pt', 'en'], active: 'pt-BR' });
    expect(host.querySelector('[data-story-language="pt"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-story-language="en"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('[data-story-language="original"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  test('un clic appelle onSelect(code) UNE SEULE FOIS, et ne remonte pas au plateau', async () => {
    const appels: string[] = [];
    const plateau: string[] = [];
    const platform = document.createElement('div');
    platform.addEventListener('pointerdown', () => plateau.push('pointerdown'));
    platform.addEventListener('pointerup', () => plateau.push('pointerup'));
    document.body.append(platform);
    const inner = document.createElement('div');
    platform.append(inner);
    root = createRoot(inner);
    await act(async () =>
      root?.render(
        <PublicationLanguageBar
          languages={['en']}
          active="fr"
          language="fr"
          onSelect={(code) => appels.push(code)}
          onClose={() => {}}
        />,
      ),
    );
    const button = inner.querySelector<HTMLButtonElement>('[data-story-language="en"]');
    await act(async () => {
      button?.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
      button?.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true }));
      button?.click();
    });
    expect(appels).toEqual(['en']);
    expect(plateau).toEqual([]);
    container = inner;
    platform.remove();
  });

  test('sans onOpenMore, aucun « + » ; avec, un bouton qui l’appelle', async () => {
    const sans = await monter();
    expect(sans.querySelector('[data-story-language-more]')).toBeNull();
    const appels: string[] = [];
    const avec = await monter({ onOpenMore: () => appels.push('open') });
    const plus = avec.querySelector<HTMLButtonElement>('[data-story-language-more]');
    expect(plus).not.toBeNull();
    expect(plus?.getAttribute('aria-label')).toBe('Autres langues');
    await act(async () => plus?.click());
    expect(appels).toEqual(['open']);
  });

  test('le conteneur est role="group", aria-label = "Langues disponibles" ; Échap appelle onClose', async () => {
    const appels: string[] = [];
    const host = await monter({ onClose: () => appels.push('close') });
    const group = host.querySelector('[data-story-language-bar]');
    expect(group?.getAttribute('role')).toBe('group');
    expect(group?.getAttribute('aria-label')).toBe('Langues disponibles');
    await act(async () => {
      group?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(appels).toEqual(['close']);
  });

  test('au montage, le focus va sur le chip ACTIF', async () => {
    const host = await monter({ active: 'en' });
    expect(document.activeElement).toBe(host.querySelector('[data-story-language="en"]'));
  });

  test('> 5 langues => data-story-language-bar-scroll est posé ; <= 5 => absent', async () => {
    const peu = await monter({ languages: ['fr', 'en'] });
    expect(peu.querySelector('[data-story-language-bar]')?.hasAttribute('data-story-language-bar-scroll')).toBe(false);
    const beaucoup = await monter({ languages: ['fr', 'en', 'es', 'de', 'it', 'pt'] });
    expect(beaucoup.querySelector('[data-story-language-bar]')?.hasAttribute('data-story-language-bar-scroll')).toBe(true);
  });
});
