import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CountrySheet } from './country-sheet';

/**
 * LA FEUILLE DE CHOIX DU PAYS PARLE LA LANGUE D'INTERFACE (#10823) — titre,
 * recherche et « aucun pays ne correspond » viennent du catalogue d'interface,
 * avec les valeurs d'iOS (`auth.signup.phone.country.*`).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/signup' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all((['fr', 'en', 'es'] as const).map((language) => loadInterfaceCatalog(language)));
});

afterAll(async () => {
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
  document.documentElement.lang = 'fr';
});

function mountSearching(query: string): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<CountrySheet onSelect={() => undefined} onClose={() => undefined} />);
  });
  const search = document.body.querySelector('input[type="search"], input') as HTMLInputElement;
  act(() => {
    search.value = query;
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return document.body;
}

const text = (el: HTMLElement): string => (el.textContent ?? '').replace(/\s+/gu, ' ');

describe('la feuille de choix du pays suit la langue d’interface', () => {
  test('interface fr : « Aucun pays ne correspond à « … ». »', () => {
    const body = mountSearching('zzqx');
    expect(text(body)).toContain('Aucun pays ne correspond à « zzqx ».');
  });

  test('interface en : titre, recherche et liste vide en anglais', () => {
    document.documentElement.lang = 'en';
    const body = mountSearching('zzqx');
    expect(text(body)).toContain('Country');
    expect(body.querySelector('input[aria-label="Search for a country"]')).not.toBeNull();
    expect(text(body)).toContain('No country matches “zzqx”.');
    expect(text(body)).not.toMatch(/Aucun pays|Rechercher un pays|Pays/u);
  });

  test('interface es : la liste vide vient du catalogue espagnol', () => {
    document.documentElement.lang = 'es';
    const body = mountSearching('zzqx');
    expect(text(body)).toContain('Ningún país coincide con «zzqx».');
  });
});
