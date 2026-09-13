import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ApiResult } from '@/lib/api/http';
import { createIntervalClock, type IntervalClockScheduler } from '@/lib/view/interval-clock';

import { VerifyEmailFlow, type VerifyEmailFlowDeps } from './verify-email-flow';

/**
 * LE FLUX DE VÉRIFICATION D'E-MAIL, RENDU (T-verify, #5672) — patron
 * `magic-link.test.tsx` : code juste ⇒ overlay de succès + porte de sortie ;
 * code faux ⇒ message SOUS le champ, jamais un bandeau générique ; hors-ligne
 * ⇒ le bouton reste désactivé ; `?email=` absent ⇒ état dédié, aucun appel
 * réseau possible.
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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
});

function fakeClock() {
  const current = 0;
  let activeTimer: unknown = null;
  const scheduler: IntervalClockScheduler = {
    setInterval: () => {
      activeTimer = {};
      return activeTimer;
    },
    clearInterval: () => {
      activeTimer = null;
    },
    now: () => current,
  };
  return { clock: createIntervalClock(1_000, scheduler), now: () => current };
}

type VerifyCall = { readonly email: string; readonly code: string };

function verifyStub(responses: ReadonlyArray<ApiResult<{ message: string; alreadyVerified?: boolean }>>) {
  const calls: VerifyCall[] = [];
  let i = 0;
  const verifyEmail = async (request: VerifyCall) => {
    calls.push(request);
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return r ?? { ok: false as const, status: 0, error: 'aucune réponse programmée' };
  };
  return { calls, verifyEmail };
}

function resendStub() {
  const calls: string[] = [];
  const resendVerification = async (email: string) => {
    calls.push(email);
    return { ok: true as const, data: { message: 'ok' }, status: 200 };
  };
  return { calls, resendVerification };
}

function mount(email: string | null, deps: VerifyEmailFlowDeps): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<VerifyEmailFlow email={email} deps={deps} />);
  });
  return container;
}

function fillCode(el: HTMLDivElement, value: string) {
  const input = el.querySelector('#verify-email-code') as HTMLInputElement;
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function submit(el: HTMLDivElement) {
  const form = el.querySelector('form') as HTMLFormElement;
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('VerifyEmailFlow — `?email=` absent', () => {
  test('état dédié, AUCUN formulaire, aucun appel possible', () => {
    const { clock, now } = fakeClock();
    const stub = verifyStub([]);
    const el = mount(null, { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now });
    expect(el.querySelector('form')).toBeNull();
    expect(el.textContent).toContain('aucune adresse e-mail');
  });
});

describe('VerifyEmailFlow — saisie', () => {
  test('bouton désactivé sous 6 chiffres, actif à 6 chiffres', () => {
    const { clock, now } = fakeClock();
    const stub = verifyStub([]);
    const el = mount('ada@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now });
    const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;

    fillCode(el, '12345');
    expect(button.disabled).toBe(true);

    fillCode(el, '123456');
    expect(button.disabled).toBe(false);
  });

  test('les caractères non-numériques sont filtrés', () => {
    const { clock, now } = fakeClock();
    const stub = verifyStub([]);
    const el = mount('ada@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now });
    const input = el.querySelector('#verify-email-code') as HTMLInputElement;

    fillCode(el, 'ab12cd34');
    expect(input.value).toBe('1234');
  });
});

describe('VerifyEmailFlow — code juste', () => {
  test('⇒ UN appel { email, code }, overlay de succès avec une porte de sortie', async () => {
    const { clock, now } = fakeClock();
    const stub = verifyStub([{ ok: true, data: { message: 'Email vérifié' }, status: 200 }]);
    const el = mount('ada@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now });
    fillCode(el, '123456');

    await act(async () => {
      submit(el);
      await Promise.resolve();
    });

    expect(stub.calls).toEqual([{ email: 'ada@meeshy.example', code: '123456' }]);
    expect(el.textContent).toContain('Email vérifié !');
    const anchors = Array.from(el.querySelectorAll('a'));
    expect(anchors.some((a) => a.textContent === 'Continuer')).toBe(true);
  });

  test('un compte déjà vérifié EST un succès (magic-link.ts:349-354), même overlay', async () => {
    const { clock, now } = fakeClock();
    const stub = verifyStub([{ ok: true, data: { message: 'déjà vérifiée', alreadyVerified: true }, status: 200 }]);
    const el = mount('ada@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now });
    fillCode(el, '123456');

    await act(async () => {
      submit(el);
      await Promise.resolve();
    });

    expect(el.textContent).toContain('Email vérifié !');
  });
});

describe('VerifyEmailFlow — code faux', () => {
  test('⇒ message SOUS le champ, jamais un bandeau générique', async () => {
    const { clock, now } = fakeClock();
    const stub = verifyStub([{ ok: false, status: 400, error: 'Invalid or expired verification code' }]);
    const el = mount('ada@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now });
    fillCode(el, '000000');

    await act(async () => {
      submit(el);
      await Promise.resolve();
    });

    expect(el.querySelector('#verify-email-code-error')?.textContent).toBe('Code invalide ou expiré');
    expect(el.textContent).not.toContain('Email vérifié');
  });
});

describe('VerifyEmailFlow — hors-ligne', () => {
  test('le bouton de vérification ET le bouton de renvoi restent désactivés', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const { clock, now } = fakeClock();
    const stub = verifyStub([]);
    const resend = resendStub();
    const el = mount('ada@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resend.resendVerification, clock, now });
    fillCode(el, '123456');

    const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    const resendButton = el.querySelector('[aria-label="Renvoyer le code"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(resendButton.disabled).toBe(true);
  });
});

describe('VerifyEmailFlow — renvoi', () => {
  test('clic ⇒ UN appel avec l’e-mail, le bouton se verrouille pour 30 s', async () => {
    const { clock, now } = fakeClock();
    const stub = verifyStub([]);
    const resend = resendStub();
    const el = mount('ada@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resend.resendVerification, clock, now });
    const resendButton = () => el.querySelector('[aria-label="Renvoyer le code"]') as HTMLButtonElement;

    await act(async () => {
      resendButton().click();
      await Promise.resolve();
    });

    expect(resend.calls).toEqual(['ada@meeshy.example']);
    expect(resendButton().disabled).toBe(true);
    expect(resendButton().textContent).toContain('30s');
  });
});
