import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { authColumnIn, strayFromAuthColumn } from '@/test-support/auth-column';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ApiResult } from '@/lib/api/http';
import type { VerifyEmailData, VerifyEmailRequest } from '@/lib/api/verify-email';
import { forgetPendingVerification, holdPendingVerification } from '@/lib/pending-verification';
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
  forgetPendingVerification();
  window.history.replaceState({}, '', '/auth/verify-email');
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

type VerifyCall = VerifyEmailRequest;

function verifyStub(responses: ReadonlyArray<ApiResult<VerifyEmailData>>) {
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

function mount(
  email: string | null,
  deps: VerifyEmailFlowDeps,
  options: { readonly token?: string | null; readonly next?: string | null } = {},
): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<VerifyEmailFlow email={email} token={options.token ?? null} next={options.next ?? null} deps={deps} />);
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

/**
 * L'ÉTAPE DE CODE TIENT DANS LA COLONNE DE LA CONNEXION (#6643) — directive
 * porteur 2026-09-15 : les étapes d'inscription et de vérification « doivent
 * être centrées même hors smartphone ». La largeur se mesure en navigateur
 * (`check-access-column.mjs`) ; ici, que tout vive dans UNE colonne.
 */
describe('VerifyEmailFlow — tout tient dans UNE colonne, la puce « Fermer » comprise (#6643)', () => {
  test('saisie du code', () => {
    const { clock, now } = fakeClock();
    const el = mount('ada@meeshy.example', {
      verifyEmail: verifyStub([]).verifyEmail,
      resendVerification: resendStub().resendVerification,
      clock,
      now,
    });
    const column = authColumnIn(el);
    expect(column?.querySelector('#verify-email-code')).not.toBeNull();
    expect(column?.querySelector('a[aria-label="Fermer"]')).not.toBeNull();
    expect(strayFromAuthColumn(el)).toEqual([]);
  });

  test('sans adresse', () => {
    const { clock, now } = fakeClock();
    const el = mount(null, {
      verifyEmail: verifyStub([]).verifyEmail,
      resendVerification: resendStub().resendVerification,
      clock,
      now,
    });
    expect(authColumnIn(el)).not.toBeNull();
    expect(strayFromAuthColumn(el)).toEqual([]);
  });
});

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
    expect(el.textContent).toContain('E-mail vérifié !');
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

    expect(el.textContent).toContain('E-mail vérifié !');
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
    expect(el.textContent).not.toContain('E-mail vérifié');
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

/**
 * LA VÉRIFICATION OUVRE LA SESSION (#8034, contrat #8033) — le code comme le
 * lien de l'e-mail rendent `{ verified, token, sessionToken, user }` : l'écran
 * ne montre plus « E-mail vérifié », il mène là où une connexion mène.
 */
const SESSION_DATA: VerifyEmailData = {
  verified: true,
  token: 'jwt',
  sessionToken: 'sess',
  user: { id: 'u-1', username: 'neuf', displayName: 'Neuf' },
};

const here = () => `${window.location.pathname}${window.location.search}`;

describe('VerifyEmailFlow — le lien de l’e-mail (`?token=`) connecte au montage (#8034)', () => {
  test('UN appel { email, token }, AUCUN mot de passe, puis l’accueil', async () => {
    const { clock, now } = fakeClock();
    holdPendingVerification({ email: 'neuf@meeshy.example', password: 'secret-1', accountCreated: true });
    const stub = verifyStub([{ ok: true, data: SESSION_DATA, status: 200 }]);
    await act(async () => {
      mount('neuf@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now }, { token: 'tok-1' });
      await Promise.resolve();
    });

    expect(stub.calls).toEqual([{ email: 'neuf@meeshy.example', token: 'tok-1' }]);
    expect(here()).toBe('/');
  });

  test('avec `next` sûr : on y arrive', async () => {
    const { clock, now } = fakeClock();
    const stub = verifyStub([{ ok: true, data: SESSION_DATA, status: 200 }]);
    await act(async () => {
      mount('neuf@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now }, { token: 'tok-1', next: '/chat/mshy_x' });
      await Promise.resolve();
    });
    expect(here()).toBe('/chat/mshy_x');
  });

  test('pendant l’appel : « Vérification du lien… », aucun formulaire', () => {
    const { clock, now } = fakeClock();
    const verifyEmail = () => new Promise<ApiResult<VerifyEmailData>>(() => undefined);
    const el = mount('neuf@meeshy.example', { verifyEmail, resendVerification: resendStub().resendVerification, clock, now }, { token: 'tok-1' });
    expect(el.textContent).toContain('Vérification du lien…');
    expect(el.querySelector('form')).toBeNull();
  });

  test('lien refusé ⇒ le formulaire du code, avec la raison', async () => {
    const { clock, now } = fakeClock();
    const stub = verifyStub([{ ok: false, status: 400, error: 'Invalid token' }]);
    let el!: HTMLDivElement;
    await act(async () => {
      el = mount('neuf@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now }, { token: 'tok-x' });
      await Promise.resolve();
    });
    expect(el.querySelector('#verify-email-code')).not.toBeNull();
    expect(el.textContent).toContain('Ce lien n’est plus valide. Entrez le code reçu dans le même e-mail.');
  });

  test('ancienne passerelle (vérifié SANS session) ⇒ « E-mail vérifié ! » comme avant', async () => {
    const { clock, now } = fakeClock();
    const stub = verifyStub([{ ok: true, data: { message: 'ok' }, status: 200 }]);
    let el!: HTMLDivElement;
    await act(async () => {
      el = mount('ada@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now }, { token: 'tok-1' });
      await Promise.resolve();
    });
    expect(el.textContent).toContain('E-mail vérifié !');
  });
});

describe('VerifyEmailFlow — le code ouvre la session (#8034)', () => {
  test('le mot de passe tapé à la connexion voyage AVEC le code, puis est oublié ; l’accueil', async () => {
    const { clock, now } = fakeClock();
    holdPendingVerification({ email: 'neuf@meeshy.example', password: 'secret-1', accountCreated: true });
    const stub = verifyStub([{ ok: true, data: SESSION_DATA, status: 200 }]);
    const el = mount('neuf@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now });
    fillCode(el, '123456');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });

    expect(stub.calls).toEqual([{ email: 'neuf@meeshy.example', code: '123456', password: 'secret-1' }]);
    expect(here()).toBe('/');
    const { pendingVerificationFor } = await import('@/lib/pending-verification');
    expect(pendingVerificationFor('neuf@meeshy.example')).toBeNull();
  });

  test('sans mot de passe retenu : { email, code } seuls', async () => {
    const { clock, now } = fakeClock();
    const stub = verifyStub([{ ok: true, data: SESSION_DATA, status: 200 }]);
    const el = mount('ada@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now });
    fillCode(el, '123456');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
    expect(stub.calls).toEqual([{ email: 'ada@meeshy.example', code: '123456' }]);
  });

  test('un code faux GARDE le mot de passe pour l’essai suivant', async () => {
    const { clock, now } = fakeClock();
    holdPendingVerification({ email: 'neuf@meeshy.example', password: 'secret-1', accountCreated: true });
    const stub = verifyStub([
      { ok: false, status: 400, error: 'bad' },
      { ok: true, data: SESSION_DATA, status: 200 },
    ]);
    const el = mount('neuf@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now });
    fillCode(el, '000000');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
    fillCode(el, '123456');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
    expect(stub.calls[1]).toEqual({ email: 'neuf@meeshy.example', code: '123456', password: 'secret-1' });
  });

  test('429 ⇒ « Trop de tentatives »', async () => {
    const { clock, now } = fakeClock();
    const stub = verifyStub([{ ok: false, status: 429, error: 'Too many' }]);
    const el = mount('ada@meeshy.example', { verifyEmail: stub.verifyEmail, resendVerification: resendStub().resendVerification, clock, now });
    fillCode(el, '123456');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
    expect(el.querySelector('#verify-email-code-error')?.textContent).toBe('Trop de tentatives — réessayez dans quelques minutes.');
  });
});

describe('VerifyEmailFlow — ce que l’écran DIT de l’e-mail reçu (#8034)', () => {
  const lead = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/gu, ' ');

  test('compte créé à l’instant par la connexion', () => {
    const { clock, now } = fakeClock();
    holdPendingVerification({ email: 'neuf@meeshy.example', password: 'secret-1', accountCreated: true });
    const el = mount('neuf@meeshy.example', { verifyEmail: verifyStub([]).verifyEmail, resendVerification: resendStub().resendVerification, clock, now });
    expect(lead(el)).toContain('Nous avons créé votre compte et envoyé un code et un lien à neuf@meeshy.example.');
  });

  test('compte qui attendait sa vérification', () => {
    const { clock, now } = fakeClock();
    holdPendingVerification({ email: 'neuf@meeshy.example', password: 'secret-1', accountCreated: false });
    const el = mount('neuf@meeshy.example', { verifyEmail: verifyStub([]).verifyEmail, resendVerification: resendStub().resendVerification, clock, now });
    expect(lead(el)).toContain('Votre compte attend sa vérification : nous avons renvoyé un code et un lien à neuf@meeshy.example.');
  });

  test('arrivée sans connexion préalable : la phrase ordinaire', () => {
    const { clock, now } = fakeClock();
    const el = mount('ada@meeshy.example', { verifyEmail: verifyStub([]).verifyEmail, resendVerification: resendStub().resendVerification, clock, now });
    expect(lead(el)).toContain('Entrez le code à 6 chiffres envoyé à ada@meeshy.example');
  });
});
