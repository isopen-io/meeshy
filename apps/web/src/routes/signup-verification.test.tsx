import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import SignupScreen from '@/routes/signup';
import type { RegisterBody, RegisterResponseData } from '@/lib/api/auth';
import type { ApiResult } from '@/lib/api/http';
import { forgetPendingVerification, pendingVerificationFor } from '@/lib/pending-verification';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * SANS NUMÉRO, LE COMPTE ATTEND SON CODE (#8055) — règle porteur 2026-09-26 :
 * « Le code s'entre après la création de compte la première fois pour
 * continuer sur l'application ! […] Si un numéro est donné en plus de
 * l'email, le compte est activé directement. »
 *
 * La passerelle rend alors la forme de la connexion d'un e-mail inconnu
 * (#8033) ; l'écran rejoint le chemin de #8034 : l'écran du code, la
 * vérification retenue en mémoire vive — SANS le mot de passe, déjà
 * enregistré sur le compte par l'inscription.
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
  forgetPendingVerification();
});

const AWAITING_CODE: ApiResult<RegisterResponseData> = {
  ok: true,
  status: 200,
  data: { status: 'verification-required', accountCreated: true, email: 'ada@meeshy.example' },
};

function mount(url: string, reply: ApiResult<RegisterResponseData>): { readonly el: HTMLDivElement; readonly sent: RegisterBody[] } {
  window.history.replaceState({}, '', url);
  const sent: RegisterBody[] = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <SignupScreen
        register={async (body) => {
          sent.push(body);
          return reply;
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

async function submitWithoutPhone(el: HTMLDivElement) {
  await act(async () => {
    el.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await act(async () => {
    (el.querySelector('[data-confirm="confirm"]') as HTMLButtonElement).click();
  });
}

const location = () => `${window.location.pathname}${window.location.search}`;

describe('sans numéro : l’écran du code, jamais l’application', () => {
  test('« Continuer quand même » mène à /auth/verify-email pour CETTE adresse', async () => {
    const { el, sent } = mount('/signup', AWAITING_CODE);
    type(el, '#signup-email', 'ada@meeshy.example');
    await submitWithoutPhone(el);
    expect(sent.length).toBe(1);
    expect(location()).toBe('/auth/verify-email?email=ada%40meeshy.example');
  });

  test('l’écran du code sait que le compte vient d’être créé — sans retenir le mot de passe', async () => {
    const { el } = mount('/signup', AWAITING_CODE);
    type(el, '#signup-email', 'ada@meeshy.example');
    type(el, '#signup-password', 'un-mot-de-passe-solide');
    await submitWithoutPhone(el);
    const pending = pendingVerificationFor('ada@meeshy.example');
    expect(pending?.accountCreated).toBe(true);
    expect(pending?.password).toBeUndefined();
  });

  test('une invitation (`next`) voyage jusqu’à l’écran du code, sans le court-circuiter', async () => {
    const { el } = mount('/signup?next=%2Fchat%2Fmshy_equipe', AWAITING_CODE);
    type(el, '#signup-email', 'ada@meeshy.example');
    await submitWithoutPhone(el);
    expect(window.location.pathname).toBe('/auth/verify-email');
    const search = new URLSearchParams(window.location.search);
    expect(search.get('email')).toBe('ada@meeshy.example');
    expect(search.get('next')).toBe('/chat/mshy_equipe');
  });
});

describe('avec numéro : la session, comme avant', () => {
  test('une réponse avec session mène là où l’inscription menait déjà, sans rien retenir', async () => {
    const withSession: ApiResult<RegisterResponseData> = {
      ok: true,
      status: 200,
      data: { user: { id: 'u-1', username: 'ada' }, token: 'jwt', sessionToken: 'sess', expiresIn: 86_400 },
    };
    const { el, sent } = mount('/signup?next=%2Fchat%2Fmshy_equipe', withSession);
    type(el, '#signup-email', 'ada@meeshy.example');
    type(el, '#signup-phone', '612345678');
    await act(async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(sent[0]?.phoneNumber).toBe('612345678');
    expect(location()).toBe('/chat/mshy_equipe');
    expect(pendingVerificationFor('ada@meeshy.example')).toBeNull();
  });
});
