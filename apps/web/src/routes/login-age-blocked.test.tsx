import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { LoginRequest, LoginResponseData } from '@/lib/api/auth';
import type { ApiResult } from '@/lib/api/http';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ageBlockedNotice } from '@/components/age-blocked';
import { MagicLinkValidation } from '@/components/magic-link-validation';
import { LoginDoors } from '@/routes/login';
import { createActMounter, typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * UN COMPTE DE MOINS DE 13 ANS À LA CONNEXION (#9928, contrat #9927 après
 * revue adversariale) — la déclaration sous 13 ans est DÉFINITIVE : la
 * passerelle répond 403 `AGE_BELOW_MINIMUM` à la connexion et au lien
 * magique. L'écran le dit comme l'accueil l'a dit — jamais un message
 * générique — et rien ne se relance tout seul.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/login?methode=password' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  window.history.replaceState({}, '', '/login?methode=password');
});

const BLOCKED: ApiResult<never> = { ok: false, status: 403, error: 'Meeshy is for 13+', code: 'AGE_BELOW_MINIMUM' };

const title = (host: ParentNode) => host.querySelector('[data-age-blocked] h1')?.textContent ?? null;

describe('connexion par mot de passe — 403 AGE_BELOW_MINIMUM', () => {
  test('l’écran « Meeshy est réservé aux 13 ans et plus » remplace le formulaire, un seul appel', async () => {
    const calls: LoginRequest[] = [];
    const login = async (request: LoginRequest): Promise<ApiResult<LoginResponseData>> => {
      calls.push(request);
      return BLOCKED;
    };
    const host = await mount(<LoginDoors method="password" passwordLogin={login} />);
    typeInto(host.querySelector<HTMLInputElement>('#login-username'), 'lea');
    typeInto(host.querySelector<HTMLInputElement>('#login-password'), 'secret-1');
    await act(async () => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(title(host)).toBe('Meeshy est réservé aux 13 ans et plus');
    expect(host.querySelector('form')).toBeNull();
    expect(host.textContent).not.toContain('La connexion a échoué');
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
    expect(calls).toHaveLength(1);
  });

  test('« Compris » rend la porte, mot de passe vidé, sans rien renvoyer', async () => {
    let calls = 0;
    const login = async (): Promise<ApiResult<LoginResponseData>> => {
      calls += 1;
      return BLOCKED;
    };
    const host = await mount(<LoginDoors method="password" passwordLogin={login} />);
    typeInto(host.querySelector<HTMLInputElement>('#login-username'), 'lea');
    typeInto(host.querySelector<HTMLInputElement>('#login-password'), 'secret-1');
    await act(async () => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    await click(host.querySelector<HTMLElement>('[data-age-blocked-confirm]'));

    expect(host.querySelector('[data-age-blocked]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('#login-password')?.value).toBe('');
    expect(calls).toBe(1);
  });
});

describe('l’accueil vient de refuser la date — la révocation renvoie à la connexion', () => {
  test('la connexion s’ouvre sur le même écran, une fois', async () => {
    ageBlockedNotice.raise();
    const login = async (): Promise<ApiResult<LoginResponseData>> => BLOCKED;
    const host = await mount(<LoginDoors method="password" passwordLogin={login} />);
    expect(title(host)).toBe('Meeshy est réservé aux 13 ans et plus');
    expect(ageBlockedNotice.pending()).toBe(false);
    await click(host.querySelector<HTMLElement>('[data-age-blocked-confirm]'));
    expect(host.querySelector('form')).not.toBeNull();
  });
});

describe('lien magique — 403 AGE_BELOW_MINIMUM', () => {
  test('le même écran, et « Compris » mène à la connexion', async () => {
    const visits: string[] = [];
    let calls = 0;
    const validate = async (): Promise<ApiResult<LoginResponseData>> => {
      calls += 1;
      return BLOCKED;
    };
    const host = await mount(<MagicLinkValidation token="t-1" returnUrl={null} validate={validate} go={(path) => visits.push(path)} />);
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

    expect(title(host)).toBe('Meeshy est réservé aux 13 ans et plus');
    expect(host.textContent).not.toContain('Lien invalide');
    await click(host.querySelector<HTMLElement>('[data-age-blocked-confirm]'));
    expect(visits).toEqual(['/login']);
    expect(calls).toBe(1);
  });
});
