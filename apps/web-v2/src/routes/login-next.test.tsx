import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { sessionStore } from '@/lib/api/session';
import { LoginDoors } from '@/routes/login';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * `/login?next=` — REVENIR LÀ OÙ L'ON ALLAIT (#5561).
 *
 * Un visiteur invité à une conversation se connecte pour la rejoindre : la
 * session qui s'ouvre doit le RAMENER à l'invitation, jamais le poser sur la
 * liste où il n'a encore rien. `next` vient de l'adresse — donc de quiconque a
 * forgé le lien — et ne sort jamais du domaine.
 *
 * `SessionGate` (`main.tsx`) navigue AUSSI quand une session s'ouvre sur cet
 * écran, APRÈS lui : il lit la même règle (`landingAfterSession`), prouvée
 * seule dans `session-guard.test.ts`.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/login' });
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

function mount(next: string | null, method: 'lien' | 'password' = 'password'): HTMLDivElement {
  window.history.replaceState({}, '', next === null ? '/login' : `/login?next=${encodeURIComponent(next)}`);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<LoginDoors method={method} next={next} />);
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
const signupLink = (el: HTMLElement) =>
  [...el.querySelectorAll('a')].find((a) => new URL(a.getAttribute('href') ?? '', 'http://localhost').pathname === '/signup') ?? null;

describe('/login?next= — la session qui s’ouvre ramène à `next`', () => {
  test('un `next` interne : on y arrive, pas sur la liste', () => {
    mount('/chat/mshy_equipe_7f3a');
    signIn();
    expect(here()).toBe('/chat/mshy_equipe_7f3a');
  });

  test('sans `next` : la liste, comme avant', () => {
    mount(null);
    signIn();
    expect(here()).toBe('/');
  });

  for (const hostile of ['//evil.com', 'https://evil.com/chat/x', '/\\evil.com']) {
    test(`\`next=${hostile}\` ne sort pas du domaine : la liste`, () => {
      mount(hostile);
      signIn();
      expect(here()).toBe('/');
    });
  }
});

describe('/login?next= — « Créer un compte » garde l’invitation', () => {
  test('le lien vers l’inscription porte le même `next`', () => {
    const el = mount('/chat/mshy_equipe_7f3a');
    const href = signupLink(el)?.getAttribute('href') ?? '';
    expect(new URL(href, 'http://localhost').searchParams.get('next')).toBe('/chat/mshy_equipe_7f3a');
  });

  test('un `next` hostile ne voyage pas : `/signup` nu', () => {
    const el = mount('//evil.com');
    expect(signupLink(el)?.getAttribute('href')).toBe('/signup');
  });
});

/**
 * CHANGER DE PORTE NE PERD PAS L'INVITATION — la porte par défaut est le lien
 * par e-mail (#6404) : un invité qui préfère son mot de passe passe par
 * `?methode=password`, et revient par « Se connecter par e-mail ». Deux liens
 * qui réécrivent l'adresse : sans `next`, chacun effaçait l'invitation.
 */
describe('/login?next= — passer d’une porte à l’autre garde l’invitation', () => {
  const nextAndMethodOf = (anchor: HTMLAnchorElement | undefined) => {
    const url = new URL(anchor?.getAttribute('href') ?? '', 'http://localhost');
    return { methode: url.searchParams.get('methode'), next: url.searchParams.get('next') };
  };

  test('« Se connecter avec un identifiant et un mot de passe » porte `next`', () => {
    const el = mount('/chat/mshy_equipe_7f3a', 'lien');
    const vers = [...el.querySelectorAll('a')].find((a) => (a.textContent ?? '').includes('identifiant'));
    expect(nextAndMethodOf(vers)).toEqual({ methode: 'password', next: '/chat/mshy_equipe_7f3a' });
  });

  test('« Se connecter par e-mail » porte `next`', () => {
    const el = mount('/chat/mshy_equipe_7f3a', 'password');
    const retour = [...el.querySelectorAll('a')].find((a) => (a.textContent ?? '').trim() === 'Se connecter par e-mail');
    expect(nextAndMethodOf(retour)).toEqual({ methode: null, next: '/chat/mshy_equipe_7f3a' });
  });
});
