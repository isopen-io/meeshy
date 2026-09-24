import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { sessionStore } from '@/lib/api/session';
import SignupScreen, { landingAfterRegistration } from '@/routes/signup';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * `/signup?next=` — S'INSCRIRE DEPUIS UNE INVITATION ET Y REVENIR (#5561).
 *
 * Le compte créé depuis `/chat/:link` doit retrouver l'invitation, où
 * « Rejoindre » l'attend. La vérification de l'e-mail n'est pas perdue : le
 * lien part par courriel à l'inscription (`registration.service.ts:488`), et
 * rejoindre comme écrire restent ouverts à un compte non confirmé (#6437,
 * `middleware/auth.ts § EMAIL_VERIFICATION_GATED_ROUTES`).
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

function mountAt(url: string): HTMLDivElement {
  window.history.replaceState({}, '', url);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<SignupScreen referralDeps={{ validate: async () => ({ ok: false, status: 0, error: 'hors sujet' }) }} />);
  });
  return container;
}

const signIn = () =>
  act(() => {
    sessionStore.getState().establish({
      user: { id: '0'.repeat(24), username: 'ada', displayName: 'Ada', avatar: '' },
      token: 'jeton-du-temoin',
      sessionToken: 'session-du-temoin',
      expiresIn: 3600,
    });
  });

const here = () => `${window.location.pathname}${window.location.search}`;
const text = (el: Element) => (el.textContent ?? '').replace(/\s+/gu, ' ');
const signInLink = (el: HTMLElement) => [...el.querySelectorAll('a')].find((a) => text(a).includes('Déjà un compte')) ?? null;

describe('/signup?next= — un compte DÉJÀ connecté repart vers `next`', () => {
  test('`next` interne : l’invitation, pas la liste', () => {
    signIn();
    mountAt('/signup?next=%2Fchat%2Fmshy_equipe_7f3a');
    expect(here()).toBe('/chat/mshy_equipe_7f3a');
  });

  test('`next` hostile : la liste', () => {
    signIn();
    mountAt('/signup?next=%2F%2Fevil.com');
    expect(here()).toBe('/');
  });
});

describe('/signup?next= — « Déjà un compte ? Se connecter » garde l’invitation', () => {
  test('le lien vers la connexion porte le même `next`', () => {
    const el = mountAt('/signup?next=%2Fchat%2Fmshy_equipe_7f3a');
    const href = signInLink(el)?.getAttribute('href') ?? '';
    expect(new URL(href, 'http://localhost').searchParams.get('next')).toBe('/chat/mshy_equipe_7f3a');
  });

  test('un `next` hostile ne voyage pas : `/login` nu', () => {
    const el = mountAt('/signup?next=https%3A%2F%2Fevil.com');
    expect(signInLink(el)?.getAttribute('href')).toBe('/login');
  });
});

describe('landingAfterRegistration — où mène un compte qui vient d’être créé', () => {
  test('depuis une invitation : retour à l’invitation', () => {
    expect(landingAfterRegistration({ next: '/chat/mshy_equipe_7f3a', email: 'ada@meeshy.example' })).toBe('/chat/mshy_equipe_7f3a');
  });

  test('sans `next` : la vérification de l’e-mail, comme avant', () => {
    expect(landingAfterRegistration({ next: null, email: 'ada@meeshy.example' })).toBe('/auth/verify-email?email=ada%40meeshy.example');
  });

  test('`next` hostile : la vérification de l’e-mail', () => {
    for (const hostile of ['//evil.com', 'https://evil.com']) {
      expect({ hostile, landing: landingAfterRegistration({ next: hostile, email: 'ada@meeshy.example' }) }).toEqual({
        hostile,
        landing: '/auth/verify-email?email=ada%40meeshy.example',
      });
    }
  });
});
