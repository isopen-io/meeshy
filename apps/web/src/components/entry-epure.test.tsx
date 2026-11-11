import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { controlledBy } from '@/test-support/perceivable-text';

import { AuthSiteFooter } from './auth-site-footer';
import { MagicLinkPanel } from './magic-link-panel';

/**
 * ÉPURE DES ÉCRANS D'ENTRÉE (#17584, #17666) — ce que `/auth/magic-link` et le
 * pied des écrans d'entrée disent, et ce qu'ils ne disent plus.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/auth/magic-link' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(node: React.ReactNode): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
  return container;
}

describe('/auth/magic-link — le même panneau que /login', () => {
  test('la phrase qui dit ce que fait la porte est visible au repos ; le (i) ne garde que la durée', () => {
    const el = mount(<MagicLinkPanel />);
    const lead = [...el.querySelectorAll('p')].find((p) => (p.textContent ?? '').startsWith('Pas de mot de passe'));
    expect(lead).toBeDefined();
    expect(lead?.classList.contains('sr-only')).toBe(false);
    const info = el.querySelector('button[aria-label="Combien de temps le lien reste valable ?"]');
    expect(controlledBy(info)?.textContent).toBe('Le lien est valable 10 minutes et ne sert qu’une fois.');
  });
});

describe('AuthSiteFooter — un lien légal déjà dans la phrase de consentement ne se redit pas', () => {
  test('sans exclusion : conditions, confidentialité, contact, aide, à propos', () => {
    const el = mount(<AuthSiteFooter shell={false} />);
    const pages = [...el.querySelectorAll('[data-auth-site-link]')].map((a) => a.getAttribute('data-auth-site-link'));
    expect(pages).toEqual(['terms', 'privacy', 'contact', 'help', 'about']);
  });

  test('`omit` retire les pages nommées et garde le reste, badges compris', () => {
    const el = mount(<AuthSiteFooter shell={false} omit={['terms', 'privacy']} />);
    const pages = [...el.querySelectorAll('[data-auth-site-link]')].map((a) => a.getAttribute('data-auth-site-link'));
    expect(pages).toEqual(['contact', 'help', 'about']);
    expect(el.querySelector('[data-store="app-store"]')).not.toBeNull();
  });
});
