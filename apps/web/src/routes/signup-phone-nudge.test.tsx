import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import SignupScreen from '@/routes/signup';
import type { RegisterBody, RegisterResponseData } from '@/lib/api/auth';
import type { ApiResult } from '@/lib/api/http';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { setInterfaceLanguage } from '@/lib/interface-language';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * S'INSCRIRE SANS NUMÉRO PASSE PAR UNE ALERTE (#8040) — directive porteur
 * 2026-09-26 : « lorsqu'on veut créer un compte sans numéro de téléphone,
 * alerter pour indiquer que le numéro est utile pour sécuriser son compte et
 * la récupération de ce dernier ! Si l'utilisateur choisit continuer quand
 * même, alors on crée sans numéro de téléphone. »
 *
 * Une ALERTE, jamais un blocage : « Continuer quand même » crée le compte
 * exactement comme avant ; « Ajouter mon numéro » (et Échap, le choix sûr)
 * n'envoie RIEN et rend la main au champ téléphone.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/signup' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
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
});

const REFUSED: ApiResult<RegisterResponseData> = { ok: false, status: 500, error: 'Serveur indisponible' };

function mount(): { readonly el: HTMLDivElement; readonly sent: RegisterBody[] } {
  window.history.replaceState({}, '', '/signup');
  const sent: RegisterBody[] = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <SignupScreen
        register={async (body) => {
          sent.push(body);
          return REFUSED;
        }}
      />,
    );
  });
  return { el: container, sent };
}

function type(el: HTMLDivElement, selector: string, value: string) {
  const input = el.querySelector(selector) as HTMLInputElement;
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit(el: HTMLDivElement) {
  await act(async () => {
    el.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

async function click(el: HTMLDivElement, selector: string) {
  await act(async () => {
    (el.querySelector(selector) as HTMLButtonElement).click();
  });
}

const nudge = (el: HTMLDivElement) => el.querySelector<HTMLDialogElement>('dialog[data-confirm-dialog="signup-phone-nudge"]');

describe('sans numéro, valider ouvre l’alerte — et rien ne part', () => {
  test('l’alerte paraît, nommée et décrite, et AUCUNE requête n’est envoyée', async () => {
    const { el, sent } = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    await submit(el);
    const dialog = nudge(el);
    expect(dialog).not.toBeNull();
    const title = el.querySelector(`[id="${dialog?.getAttribute('aria-labelledby') ?? ''}"]`)?.textContent ?? '';
    const body = el.querySelector(`[id="${dialog?.getAttribute('aria-describedby') ?? ''}"]`)?.textContent ?? '';
    expect(title).toContain('numéro');
    expect(body).toContain('sécuriser');
    expect(body).toContain('récupérer');
    expect(sent).toEqual([]);
  });

  test('ses deux gestes disent « Ajouter mon numéro » et « Continuer quand même »', async () => {
    const { el } = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    await submit(el);
    expect(el.querySelector('[data-confirm="cancel"]')?.textContent).toBe('Ajouter mon numéro');
    expect(el.querySelector('[data-confirm="confirm"]')?.textContent).toBe('Continuer quand même');
  });
});

describe('« Continuer quand même » crée le compte sans numéro, comme avant', () => {
  test('UNE requête part, sans aucune clé téléphone, et l’alerte se referme', async () => {
    const { el, sent } = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    await submit(el);
    await click(el, '[data-confirm="confirm"]');
    expect(sent.length).toBe(1);
    expect(sent[0]?.email).toBe('ada@meeshy.example');
    expect(Object.keys(sent[0] ?? {})).not.toContain('phoneNumber');
    expect(Object.keys(sent[0] ?? {})).not.toContain('phoneCountryCode');
    expect(nudge(el)).toBeNull();
  });
});

describe('« Ajouter mon numéro » — et Échap, le choix sûr — rendent la main au champ', () => {
  test('rien n’est envoyé, l’alerte se referme, le champ téléphone a le focus', async () => {
    const { el, sent } = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    await submit(el);
    await click(el, '[data-confirm="cancel"]');
    expect(nudge(el)).toBeNull();
    expect(sent).toEqual([]);
    expect(document.activeElement?.id).toBe('signup-phone');
  });

  test('Échap (l’événement `close` du dialogue) vaut « Ajouter mon numéro »', async () => {
    const { el, sent } = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    await submit(el);
    await act(async () => {
      nudge(el)?.dispatchEvent(new Event('close'));
    });
    expect(nudge(el)).toBeNull();
    expect(sent).toEqual([]);
    expect(document.activeElement?.id).toBe('signup-phone');
  });

  test('une fois le numéro ajouté, valider crée le compte AVEC lui, sans alerte', async () => {
    const { el, sent } = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    await submit(el);
    await click(el, '[data-confirm="cancel"]');
    type(el, '#signup-phone', '612345678');
    await submit(el);
    expect(nudge(el)).toBeNull();
    expect(sent.length).toBe(1);
    expect(sent[0]?.phoneNumber).toBe('612345678');
  });
});

describe('avec un numéro, aucune alerte', () => {
  test('valider envoie directement, numéro compris', async () => {
    const { el, sent } = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    type(el, '#signup-phone', '612345678');
    await submit(el);
    expect(nudge(el)).toBeNull();
    expect(sent.length).toBe(1);
    expect(sent[0]?.phoneNumber).toBe('612345678');
    expect(typeof sent[0]?.phoneCountryCode).toBe('string');
  });
});

describe('l’alerte parle la langue d’interface', () => {
  test('en allemand, ses textes viennent du catalogue allemand', async () => {
    await loadInterfaceCatalog('de');
    await setInterfaceLanguage('de');
    try {
      const { el } = mount();
      type(el, '#signup-email', 'ada@meeshy.example');
      await submit(el);
      const label = el.querySelector('[data-confirm="cancel"]')?.textContent ?? '';
      expect(label).not.toBe('Ajouter mon numéro');
      expect(label.length).toBeGreaterThan(0);
    } finally {
      await setInterfaceLanguage('fr');
    }
  });
});
