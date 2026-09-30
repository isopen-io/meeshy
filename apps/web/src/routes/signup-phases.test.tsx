import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import SignupScreen, { type SignupVerificationDeps } from '@/routes/signup';
import type { RegisterBody, RegisterResponseData } from '@/lib/api/auth';
import type { ApiResult } from '@/lib/api/http';
import type { VerificationStatusData, VerifyEmailData } from '@/lib/api/verify-email';
import { sessionStore } from '@/lib/api/session';
import { forgetPendingVerification } from '@/lib/pending-verification';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * L'INSCRIPTION EN PHASES VIVANTES, JUSQU'AU PIXEL (#8288).
 *
 * `signup-phases.test.ts` prouve la LOI ; celui-ci prouve qu'elle gouverne
 * l'écran : téléphone en verre qui ondule, adresse, carte d'identité, code
 * dans la carte, feu d'artifice, « Parler aux autres ».
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
    sessionStore.getState().clearSession();
  });
  container.remove();
  forgetPendingVerification();
});

const EMAIL = 'ada.lovelace@meeshy.example';

const WITH_SESSION: ApiResult<RegisterResponseData> = {
  ok: true,
  status: 200,
  data: { user: { id: 'u-1', username: 'ada' }, token: 'jwt', sessionToken: 'sess', expiresIn: 86_400, pendingSessionToken: 'attente-1' },
};

const SIGNED_IN: ApiResult<VerifyEmailData> = {
  ok: true,
  status: 200,
  data: { token: 'jwt-2', sessionToken: 'sess-2', user: { id: 'u-1', username: 'ada' }, expiresIn: 86_400 },
};

const PENDING: ApiResult<VerificationStatusData> = { ok: true, status: 200, data: { status: 'pending' } };
const PROVEN: ApiResult<VerificationStatusData> = { ok: true, status: 200, data: { status: 'proven' } };

type Harness = {
  readonly el: HTMLDivElement;
  readonly sent: RegisterBody[];
  readonly codes: string[];
};

function mount({
  reply = WITH_SESSION,
  verify = SIGNED_IN,
  status = PENDING,
  url = '/signup',
}: {
  readonly reply?: ApiResult<RegisterResponseData>;
  readonly verify?: ApiResult<VerifyEmailData>;
  readonly status?: ApiResult<VerificationStatusData>;
  readonly url?: string;
} = {}): Harness {
  window.history.replaceState({}, '', url);
  const sent: RegisterBody[] = [];
  const codes: string[] = [];
  const verification: SignupVerificationDeps = {
    verifyEmail: async (request) => {
      codes.push('code' in request ? request.code : '');
      return verify;
    },
    verificationStatus: async () => status,
  };
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
        verification={verification}
      />,
    );
  });
  return { el: container, sent, codes };
}

function type(el: HTMLElement, selector: string, value: string) {
  const input = el.querySelector(selector) as HTMLInputElement;
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(el: HTMLElement, selector: string) {
  await act(async () => {
    (el.querySelector(selector) as HTMLElement).click();
  });
}

const has = (el: HTMLElement, selector: string) => el.querySelector(selector) !== null;
const phase = (el: HTMLElement) => el.querySelector('[data-signup-phase]')?.getAttribute('data-signup-phase');
const primary = (el: HTMLElement) => el.querySelector('[data-signup-primary]') as HTMLButtonElement;
const card = (el: HTMLElement) => el.querySelector('[data-signup-card]') as HTMLElement;
const location = () => `${window.location.pathname}${window.location.search}`;

function toCard(el: HTMLElement) {
  type(el, '#signup-phone', '0612345678');
  type(el, '#signup-email', EMAIL);
}

describe('phase 1 — le téléphone d’abord, en verre liquide', () => {
  test('à l’ouverture : le numéro, son pays, le lien discret — et rien d’autre', () => {
    const { el } = mount();
    expect(phase(el)).toBe('phone');
    expect(has(el, '[data-signup-phone-glass] #signup-phone')).toBe(true);
    expect(has(el, '[data-signup-country]')).toBe(true);
    expect(el.querySelector('[data-signup-skip-phone]')?.textContent).toBe('Plus tard');
    expect(has(el, '#signup-email')).toBe(false);
    expect(has(el, '[data-signup-card]')).toBe(false);
  });

  test('« Plus tard → » vit sur la ligne du libellé « Téléphone », et se dit à un lecteur d’écran (#8842)', () => {
    const { el } = mount();
    const row = el.querySelector('[data-signup-phone-label-row]');
    expect(row?.querySelector('label[for="signup-phone"]')?.textContent).toBe('Téléphone');
    const later = row?.querySelector<HTMLButtonElement>('[data-signup-skip-phone]');
    expect(later?.getAttribute('aria-label')).toBe('Plus tard, continuer sans numéro');
    expect(later?.querySelector('svg')).not.toBeNull();
  });

  test('ce que le numéro ouvre se lit d’emblée, sans (i) à ouvrir (#8842)', () => {
    const { el } = mount();
    const benefit = el.querySelector('#signup-phone-hint');
    expect(benefit?.textContent).toBe('Il vous permettra de vous connecter, et à vos proches de vous retrouver.');
    expect(benefit?.classList.contains('sr-only')).toBe(false);
    expect(has(el, '[data-signup-phone-glass] [aria-controls="signup-phone-hint"]')).toBe(false);
  });

  test('« S’inscrire » est déjà là, inactif', () => {
    const { el } = mount();
    expect(primary(el).textContent).toBe('S’inscrire');
    expect(primary(el).disabled).toBe(true);
  });

  test('chaque frappe fait onduler le verre', () => {
    const { el } = mount();
    const glass = el.querySelector('[data-signup-phone-glass]') as HTMLElement;
    const waves: unknown[] = [];
    Object.defineProperty(glass, 'animate', {
      configurable: true,
      value: (keyframes: unknown) => {
        waves.push(keyframes);
        return { cancel: () => undefined };
      },
    });
    type(el, '#signup-phone', '06');
    type(el, '#signup-phone', '061');
    expect(waves.length).toBe(2);
  });
});

describe('phase 2 — l’adresse paraît', () => {
  test('dès que le numéro est donné', () => {
    const { el } = mount();
    type(el, '#signup-phone', '0612');
    expect(has(el, '#signup-email')).toBe(false);
    type(el, '#signup-phone', '0612345678');
    expect(phase(el)).toBe('email');
    expect(has(el, '#signup-email')).toBe(true);
  });

  test('ou par « Plus tard → »', async () => {
    const { el } = mount();
    await click(el, '[data-signup-skip-phone]');
    expect(has(el, '#signup-email')).toBe(true);
    expect(has(el, '[data-signup-skip-phone]')).toBe(false);
  });
});

/**
 * L'AVERTISSEMENT DE VALIDATION D'ADRESSE, derrière un (i) « Pourquoi un
 * lien » (#6626). Replié ne veut pas dire absent : la note reste citée par
 * `aria-describedby` de l'adresse — un lecteur d'écran l'entend en y entrant.
 */
describe('l’adresse parue porte son (i)', () => {
  async function emailShown() {
    const harness = mount();
    await click(harness.el, '[data-signup-skip-phone]');
    return harness.el;
  }

  test('le (i) « Pourquoi un lien » est replié, et le champ cite sa note', async () => {
    const el = await emailShown();
    const bouton = el.querySelector('button[aria-label="Pourquoi un lien"]') as HTMLButtonElement;
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
    const note = el.querySelector(`#${bouton.getAttribute('aria-controls') ?? ''}`) as HTMLElement;
    expect(note.textContent).toBe('Nous vous enverrons un lien à cette adresse : il faudra l’ouvrir pour valider votre compte.');
    expect(note.className).toContain('sr-only');
    expect(el.querySelector('#signup-email')?.getAttribute('aria-describedby')).toBe(note.id);
  });

  test('le champ vide ne s’annonce pas invalide pour autant', async () => {
    const el = await emailShown();
    expect(el.querySelector('#signup-email')?.getAttribute('aria-invalid')).toBe('false');
  });
});

describe('phase 3 — la carte d’identité, en verre liquide', () => {
  test('une adresse cohérente fait paraître la carte, nom et pseudo pré-dérivés et modifiables', () => {
    const { el } = mount();
    toCard(el);
    expect(phase(el)).toBe('card');
    const username = card(el).querySelector('#signup-username') as HTMLInputElement;
    const displayName = card(el).querySelector('#signup-display-name') as HTMLInputElement;
    expect(username.value).toBe('ada-lovelace');
    expect(displayName.value).not.toBe('');
    type(el, '#signup-username', 'ada_l');
    expect((card(el).querySelector('#signup-username') as HTMLInputElement).value).toBe('ada_l');
  });

  test('« S’inscrire » s’active : l’inscription sans code est permise', () => {
    const { el } = mount();
    toCard(el);
    expect(primary(el).disabled).toBe(false);
  });

  test('le pseudo pris et ses suggestions s’affichent DANS la carte', async () => {
    const { el } = mount({
      reply: { ok: false, status: 409, code: 'USERNAME_TAKEN', field: 'username', error: 'pris', suggestions: ['ada_l2', 'ada_l3'] },
    });
    toCard(el);
    await click(el, '[data-signup-validate-now]');
    expect(card(el).textContent).toContain('@ada_l2');
  });

  test('« Est-ce vous ? » (#8216) s’affiche DANS la carte', async () => {
    const { el } = mount({
      reply: {
        ok: false,
        status: 409,
        code: 'EMAIL_TAKEN',
        field: 'email',
        error: 'pris',
        emailOwner: { maskedDisplayName: 'A** L***', maskedUsername: 'a*******e', avatar: null },
      },
    });
    toCard(el);
    await click(el, '[data-signup-validate-now]');
    expect(card(el).textContent).toContain('Est-ce vous ?');
  });
});

describe('phase 4 — « Valider mon compte maintenant », le code dans la carte', () => {
  test('crée le compte et fait paraître le code — sans quitter l’inscription', async () => {
    const { el, sent } = mount();
    toCard(el);
    await click(el, '[data-signup-validate-now]');
    expect(sent.length).toBe(1);
    expect(phase(el)).toBe('code');
    expect(has(el, '[data-signup-card] #verify-email-code')).toBe(true);
    expect(location()).toBe('/signup');
  });

  /** `auth.register` ÉTABLIT la session avant de répondre (#4264) : la carte
   * ne doit pas être emmenée vers la liste par la redirection des comptes
   * déjà connectés, sous les doigts de celui qui attend son code. */
  test('la session que l’inscription établit ne fait pas quitter la carte', async () => {
    window.history.replaceState({}, '', '/signup');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <SignupScreen
          register={async () => {
            sessionStore.getState().establish({ user: { id: 'u-1', username: 'ada' }, token: 'jwt', sessionToken: 'sess', expiresIn: 86_400 });
            await Promise.resolve();
            return WITH_SESSION;
          }}
          verification={{ verifyEmail: async () => SIGNED_IN, verificationStatus: async () => PENDING }}
        />,
      );
    });
    toCard(container);
    await click(container, '[data-signup-validate-now]');
    expect(location()).toBe('/signup');
    expect(phase(container)).toBe('code');
  });

  test('le code juste : feu d’artifice, et « S’inscrire » devient « Parler aux autres »', async () => {
    const { el, codes } = mount();
    toCard(el);
    await click(el, '[data-signup-validate-now]');
    type(el, '#verify-email-code', '123456');
    await act(async () => {
      el.querySelector('[data-signup-card] form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(codes).toEqual(['123456']);
    expect(phase(el)).toBe('verified');
    expect(has(el, '[data-signup-celebration]')).toBe(true);
    expect(primary(el).textContent).toBe('Parler aux autres');
  });

  test('« Parler aux autres » entre dans l’onboarding', async () => {
    const { el } = mount();
    toCard(el);
    await click(el, '[data-signup-validate-now]');
    type(el, '#verify-email-code', '123456');
    await act(async () => {
      el.querySelector('[data-signup-card] form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await click(el, '[data-signup-primary]');
    expect(location()).toBe('/onboarding');
  });

  test('le lien ouvert ailleurs se reflète dans la carte (#8083)', async () => {
    const { el } = mount({ status: PROVEN });
    toCard(el);
    await click(el, '[data-signup-validate-now]');
    await act(async () => {
      await Promise.resolve();
    });
    expect(phase(el)).toBe('verified');
    expect(primary(el).textContent).toBe('Parler aux autres');
  });

  test('« S’inscrire » sans code entre avec le compte déjà créé — sans en créer un second', async () => {
    const { el, sent } = mount();
    toCard(el);
    await click(el, '[data-signup-validate-now]');
    await click(el, '[data-signup-primary]');
    expect(sent.length).toBe(1);
    expect(location()).toBe('/onboarding');
  });
});

describe('« S’inscrire » depuis la carte', () => {
  test('crée le compte et entre dans l’onboarding', async () => {
    const { el, sent } = mount();
    toCard(el);
    await click(el, '[data-signup-primary]');
    expect(sent.length).toBe(1);
    expect(location()).toBe('/onboarding');
  });

  test('« Plus tard → » était la question : aucune alerte « sans numéro » ne la repose', async () => {
    const { el, sent } = mount();
    await click(el, '[data-signup-skip-phone]');
    type(el, '#signup-email', EMAIL);
    await click(el, '[data-signup-primary]');
    expect(el.querySelector('dialog[data-confirm-dialog="signup-phone-nudge"]')).toBeNull();
    expect(sent.length).toBe(1);
    expect(sent[0]?.phoneNumber).toBeUndefined();
  });

  test('une invitation (`next`) garde la priorité', async () => {
    const { el } = mount({ url: '/signup?next=%2Fchat%2Fmshy_equipe' });
    toCard(el);
    await click(el, '[data-signup-primary]');
    expect(location()).toBe('/chat/mshy_equipe');
  });

  test('un compte SANS session (revendication) attend son code dans la carte', async () => {
    const { el } = mount({
      reply: { ok: true, status: 200, data: { status: 'verification-required', accountCreated: true, email: EMAIL, pendingSessionToken: 'attente-2' } },
    });
    toCard(el);
    await click(el, '[data-signup-primary]');
    expect(phase(el)).toBe('code');
    expect(primary(el).disabled).toBe(true);
    expect(location()).toBe('/signup');
  });
});
