import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import type { LoginRequest, LoginResponseData } from '@/lib/api/auth';
import { forgetPendingVerification, pendingVerificationFor } from '@/lib/pending-verification';
import { LoginDoors } from '@/routes/login';
import { typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * UN E-MAIL INCONNU À LA PORTE DU MOT DE PASSE (#8034, contrat #8033) — la
 * passerelle crée le compte et envoie un code et un lien ; l'écran mène
 * AUSSITÔT à la saisie du code, et le mot de passe tapé est retenu en mémoire
 * vive pour voyager avec ce code.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/login?methode=password' });
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
  window.history.replaceState({}, '', '/login?methode=password');
});

function loginStub(response: ApiResult<LoginResponseData>) {
  const calls: LoginRequest[] = [];
  const login = async (request: LoginRequest) => {
    calls.push(request);
    return response;
  };
  return { calls, login };
}

function mount(login: (request: LoginRequest) => Promise<ApiResult<LoginResponseData>>, next: string | null = null) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<LoginDoors method="password" next={next} passwordLogin={login} />);
  });
  return container;
}

async function signInWith(el: HTMLElement, username: string, password: string) {
  typeInto(el.querySelector<HTMLInputElement>('#login-username'), username);
  typeInto(el.querySelector<HTMLInputElement>('#login-password'), password);
  await act(async () => {
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

const here = () => new URL(window.location.href);

describe('/login?methode=password — e-mail inconnu ⇒ l’écran du code (#8034)', () => {
  test('compte créé : on arrive sur /auth/verify-email avec l’adresse servie, le mot de passe est retenu', async () => {
    const stub = loginStub({ ok: true, status: 200, data: { status: 'verification-required', accountCreated: true, email: 'neuf@x.io' } });
    const el = mount(stub.login);

    await signInWith(el, 'Neuf@X.io', 'secret-1');

    expect(stub.calls[0]).toEqual({ username: 'Neuf@X.io', password: 'secret-1' });
    expect(here().pathname).toBe('/auth/verify-email');
    expect(here().searchParams.get('email')).toBe('neuf@x.io');
    expect(pendingVerificationFor('neuf@x.io')).toEqual({ email: 'neuf@x.io', password: 'secret-1', accountCreated: true });
  });

  test('le mot de passe ne voyage JAMAIS dans l’adresse', async () => {
    const stub = loginStub({ ok: true, status: 200, data: { status: 'verification-required', accountCreated: false, email: 'neuf@x.io' } });
    const el = mount(stub.login);

    await signInWith(el, 'neuf@x.io', 'secret-1');

    expect(window.location.href).not.toContain('secret-1');
  });

  test('`next` sûr voyage jusqu’à l’écran du code', async () => {
    const stub = loginStub({ ok: true, status: 200, data: { status: 'verification-required', accountCreated: true, email: 'neuf@x.io' } });
    const el = mount(stub.login, '/chat/mshy_x');

    await signInWith(el, 'neuf@x.io', 'secret-1');

    expect(here().searchParams.get('next')).toBe('/chat/mshy_x');
  });

  test('un identifiant qui n’est pas un e-mail reste un refus (401), sur place', async () => {
    const stub = loginStub({ ok: false, status: 401, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    const el = mount(stub.login);

    await signInWith(el, 'pseudo', 'secret-1');

    expect(here().pathname).toBe('/login');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(pendingVerificationFor('pseudo')).toBeNull();
  });

  test('le jeton d’attente (#8083) est retenu en MÉMOIRE pour l’écran du code — jamais dans l’adresse', async () => {
    const stub = loginStub({
      ok: true,
      status: 200,
      data: { status: 'verification-required', accountCreated: true, email: 'neuf@x.io', pendingSessionToken: 'attente-1' },
    });
    const el = mount(stub.login);

    await signInWith(el, 'neuf@x.io', 'secret-1');

    expect(pendingVerificationFor('neuf@x.io')?.pendingSessionToken).toBe('attente-1');
    expect(window.location.href).not.toContain('attente-1');
  });
});
