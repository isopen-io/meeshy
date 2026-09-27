import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { defaultMagicLinkDeps, type MagicLinkPanelDeps } from '@/components/magic-link-panel';
import type { RegisterBody, RegisterResponseData } from '@/lib/api/auth';
import type { ApiResult } from '@/lib/api/http';
import { sessionStore } from '@/lib/api/session';
import ForgotPasswordScreen from '@/routes/forgot-password';
import { LoginDoors } from '@/routes/login';
import SignupScreen from '@/routes/signup';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * UNE ADRESSE DÉJÀ UTILISÉE MÈNE EN UN GESTE AU LIEN DE CONNEXION (#8216).
 *
 * Sur `EMAIL_TAKEN`, l'inscription n'offrait qu'un lien « Se connecter » qui
 * ouvrait la connexion avec l'adresse VIDE : retaper, puis demander le lien —
 * quatre gestes, et l'occasion de se tromper d'adresse et de créer un second
 * compte. Désormais : « Recevoir un lien de connexion » envoie le code et le
 * lien à l'adresse SAISIE, par la machine de `MagicLinkPanel`, puis montre son
 * écran d'attente. Et l'adresse est préremplie partout où l'on bascule.
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
});

const EMAIL = 'ada@meeshy.example';

const EMAIL_TAKEN: ApiResult<RegisterResponseData> = {
  ok: false,
  status: 409,
  code: 'EMAIL_TAKEN',
  field: 'email',
  error: 'Email already used',
};

function linkRequestsCapturing() {
  const calls: { email: string; returnUrl?: string }[] = [];
  const request: MagicLinkPanelDeps['request'] = async (body) => {
    calls.push(body);
    return { ok: true, status: 200, data: { expiresInSeconds: 600 } };
  };
  return { calls, deps: { ...defaultMagicLinkDeps, request } };
}

function render(node: ReactNode): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container;
}

function type(el: HTMLElement, selector: string, value: string) {
  const input = el.querySelector(selector) as HTMLInputElement;
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function refusedSignup(url = '/signup') {
  window.history.replaceState({}, '', url);
  const { calls, deps } = linkRequestsCapturing();
  const el = render(<SignupScreen register={async () => EMAIL_TAKEN} magicLinkDeps={deps} />);
  type(el, '#signup-email', EMAIL);
  type(el, '#signup-phone', '612345678');
  await act(async () => {
    el.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  return { el, calls };
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const button = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement | undefined;
const anchor = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll('a')].find((a) => text(a) === label) as HTMLAnchorElement | undefined;

describe('EMAIL_TAKEN — l’écran dit ce qui se passe et offre le lien', () => {
  test('« Un compte existe déjà avec cette adresse. » sous le champ', async () => {
    const { el } = await refusedSignup();
    expect(text(el)).toContain('Un compte existe déjà avec cette adresse.');
  });

  test('UN geste envoie le lien à l’adresse SAISIE, puis l’écran d’attente', async () => {
    const { el, calls } = await refusedSignup();
    const send = button(el, 'Recevoir un lien de connexion');
    expect(send).toBeDefined();

    await act(async () => {
      send?.click();
      await Promise.resolve();
    });

    expect(calls).toEqual([{ email: EMAIL }]);
    expect(text(el)).toContain('E-mail envoyé');
    expect(text(el)).toContain(EMAIL);
  });

  test('une invitation (`next`) voyage avec la demande de lien', async () => {
    const { el, calls } = await refusedSignup('/signup?next=%2Fchat%2Fmshy_equipe');
    await act(async () => {
      button(el, 'Recevoir un lien de connexion')?.click();
      await Promise.resolve();
    });
    expect(calls).toEqual([{ email: EMAIL, returnUrl: '/chat/mshy_equipe' }]);
  });

  test('« Annuler » l’attente rend le formulaire, adresse intacte', async () => {
    const { el } = await refusedSignup();
    await act(async () => {
      button(el, 'Recevoir un lien de connexion')?.click();
      await Promise.resolve();
    });
    const cancel = button(el, 'Annuler');
    expect(cancel).toBeDefined();
    act(() => {
      cancel?.click();
    });
    expect((el.querySelector('#signup-email') as HTMLInputElement | null)?.value).toBe(EMAIL);
    expect(button(el, 'Recevoir un lien de connexion')).toBeDefined();
  });

  test('« Mot de passe oublié ? » reste à côté, adresse préremplie', async () => {
    const { el } = await refusedSignup();
    const forgot = anchor(el, 'Mot de passe oublié ?');
    expect(forgot?.getAttribute('href')).toBe('/forgot-password?email=ada%40meeshy.example');
  });

  test('aucun lien « Se connecter » à l’adresse vide ne survit sous le champ', async () => {
    const { el } = await refusedSignup();
    const bare = [...el.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/login');
    expect(bare).toEqual([]);
  });
});

/**
 * « EST-CE VOUS ? » (#8216 × #8214, décision porteur 2026-09-27) — le 409
 * porte le détenteur MASQUÉ (`emailOwner`). « C'est moi » récupère le compte
 * par le lien ; « Ce n'est pas moi » renvoie la MÊME inscription avec
 * `claimEmail: true`, et le code envoyé à l'adresse décide.
 */
describe('EMAIL_TAKEN avec son détenteur masqué', () => {
  const TAKEN_WITH_OWNER = {
    ...EMAIL_TAKEN,
    emailOwner: { maskedDisplayName: 'A** L*******', maskedUsername: 'a**l', avatar: null },
  } as ApiResult<RegisterResponseData>;

  async function refusedWithOwner() {
    window.history.replaceState({}, '', '/signup');
    const { calls, deps } = linkRequestsCapturing();
    const sent: RegisterBody[] = [];
    const replies: ApiResult<RegisterResponseData>[] = [
      TAKEN_WITH_OWNER,
      { ok: true, status: 200, data: { status: 'verification-required', accountCreated: true, email: EMAIL } },
    ];
    const el = render(
      <SignupScreen
        register={async (body) => {
          sent.push(body);
          return replies[sent.length - 1] ?? TAKEN_WITH_OWNER;
        }}
        magicLinkDeps={deps}
      />,
    );
    type(el, '#signup-email', EMAIL);
    type(el, '#signup-phone', '612345678');
    await act(async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    return { el, calls, sent };
  }

  test('« Est-ce vous ? » montre le nom et le @pseudo MASQUÉS', async () => {
    const { el } = await refusedWithOwner();
    const card = el.querySelector('[data-signup-email-owner]');
    expect(text(card)).toContain('Est-ce vous ?');
    expect(text(card)).toContain('A** L*******');
    expect(text(card)).toContain('@a**l');
  });

  test('« C’est moi — récupérer mon compte » envoie le lien à l’adresse saisie', async () => {
    const { el, calls } = await refusedWithOwner();
    await act(async () => {
      button(el, 'C’est moi — récupérer mon compte')?.click();
      await Promise.resolve();
    });
    expect(calls).toEqual([{ email: EMAIL }]);
    expect(text(el)).toContain('E-mail envoyé');
  });

  test('« Mot de passe oublié ? » reste à côté', async () => {
    const { el } = await refusedWithOwner();
    expect(anchor(el, 'Mot de passe oublié ?')?.getAttribute('href')).toBe('/forgot-password?email=ada%40meeshy.example');
  });

  test('« Ce n’est pas moi » renvoie la MÊME inscription avec claimEmail, puis l’écran du code', async () => {
    const { el, sent } = await refusedWithOwner();
    expect(text(el)).toContain('Le code envoyé à cette adresse sera demandé pour l’obtenir.');
    await act(async () => {
      button(el, 'Ce n’est pas moi')?.click();
    });
    expect(sent.length).toBe(2);
    expect(sent[1]).toEqual({ ...sent[0], claimEmail: true } as RegisterBody);
    expect(window.location.pathname).toBe('/auth/verify-email');
    expect(new URLSearchParams(window.location.search).get('email')).toBe(EMAIL);
  });

  test('sans `emailOwner` (ancienne passerelle) : aucune carte « Est-ce vous ? », la récupération seule', async () => {
    const { el } = await refusedSignup();
    expect(el.querySelector('[data-signup-email-owner]')).toBeNull();
    expect(button(el, 'Ce n’est pas moi')).toBeUndefined();
    expect(button(el, 'Recevoir un lien de connexion')).toBeDefined();
  });
});

describe('l’adresse est PRÉREMPLIE partout où l’inscription bascule vers la connexion', () => {
  test('« Déjà un compte ? Se connecter » emporte l’adresse saisie', () => {
    window.history.replaceState({}, '', '/signup');
    const el = render(<SignupScreen register={async () => EMAIL_TAKEN} />);
    type(el, '#signup-email', EMAIL);
    const login = [...el.querySelectorAll('a')].find((a) => text(a).startsWith('Déjà un compte'));
    expect(login?.getAttribute('href')).toBe('/login?email=ada%40meeshy.example');
  });

  test('une adresse incomplète ne voyage pas', () => {
    window.history.replaceState({}, '', '/signup');
    const el = render(<SignupScreen register={async () => EMAIL_TAKEN} />);
    type(el, '#signup-email', 'ada@');
    const login = [...el.querySelectorAll('a')].find((a) => text(a).startsWith('Déjà un compte'));
    expect(login?.getAttribute('href')).toBe('/login');
  });

  test('la connexion par e-mail reçoit l’adresse', () => {
    window.history.replaceState({}, '', '/login');
    const el = render(<LoginDoors method="lien" email={EMAIL} />);
    expect((el.querySelector('#magic-link-email') as HTMLInputElement | null)?.value).toBe(EMAIL);
  });

  test('la porte du mot de passe reçoit l’adresse comme identifiant', () => {
    window.history.replaceState({}, '', '/login?methode=password');
    const el = render(<LoginDoors method="password" email={EMAIL} />);
    expect((el.querySelector('#login-username') as HTMLInputElement | null)?.value).toBe(EMAIL);
  });

  test('le mot de passe oublié reçoit l’adresse de `?email=`', () => {
    window.history.replaceState({}, '', `/forgot-password?email=${encodeURIComponent(EMAIL)}`);
    const el = render(<ForgotPasswordScreen />);
    expect((el.querySelector('#forgot-email') as HTMLInputElement | null)?.value).toBe(EMAIL);
  });
});
