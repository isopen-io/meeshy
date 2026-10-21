import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createAuthClient } from '@/lib/api/auth';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import type { AccountReplacement, ProvenSessionGestures } from '@/lib/api/proven-session';
import { sessionStore } from '@/lib/api/session';
import { createIntervalClock } from '@/lib/view/interval-clock';

import { EmailCodeForm } from './email-code-form';
import { MagicLinkValidation } from './magic-link-validation';
import { VerifyEmailFlow } from './verify-email-flow';

/**
 * UN LIEN N'OUVRE JAMAIS UN AUTRE COMPTE PAR-DESSUS UNE SESSION OUVERTE SANS
 * LE DEMANDER (#10451, jumelle web de #10445). Les trois entrées qui ouvrent
 * une session par une preuve reçue par e-mail — le lien magique, le lien de
 * vérification (inscription comme revendication), le code — passent par le
 * VRAI client d'authentification (`createAuthClient`, transport bouchonné) et
 * le VRAI magasin de session : c'est la décision réelle qui est jugée.
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
  sessionStore.getState().clearSession();
});

const BOB = { id: 'u-bob', username: 'bob', displayName: 'Bob Martin', avatar: 'https://cdn.meeshy.example/bob.png', email: 'bob@meeshy.example' };
const BOB_SESSION = { user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 86_400 };

function signInAsAda(): void {
  sessionStore.getState().establish({ user: { id: 'u-ada', username: 'ada', displayName: 'Ada' }, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3_600 });
}

function realAuth(response: ApiResult<unknown>) {
  const calls: HttpRequest[] = [];
  const client = createAuthClient({
    store: sessionStore,
    transport: {
      request: async <T,>(request: HttpRequest) => {
        calls.push(request);
        return response as ApiResult<T>;
      },
    },
  });
  return { client, calls };
}

function recordingGestures() {
  const adopted: AccountReplacement[] = [];
  const discarded: AccountReplacement[] = [];
  const gestures: ProvenSessionGestures = {
    adopt: async (replacement) => {
      adopted.push(replacement);
      return true;
    },
    discard: async (replacement) => {
      discarded.push(replacement);
    },
    abandon: () => undefined,
  };
  return { gestures, adopted, discarded };
}

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

function mountInto(node: ReactElement): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container;
}

const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/gu, ' ');
const button = (el: HTMLElement, answer: 'cancel' | 'confirm') => el.querySelector(`[data-answer="${answer}"]`) as HTMLButtonElement | null;

async function click(target: HTMLElement | null) {
  await act(async () => {
    target?.click();
  });
  await settle();
}

describe('Lien magique (#10451)', () => {
  test('un AUTRE compte sur un appareil connecté ⇒ la question, la session ouverte intacte, rien ne navigue', async () => {
    signInAsAda();
    const before = sessionStore.getState().session;
    const { client } = realAuth({ ok: true, data: BOB_SESSION, status: 200 });
    const visits: string[] = [];
    const el = mountInto(<MagicLinkValidation token="tok-bob" returnUrl={null} validate={client.validateMagicLink} go={(path) => visits.push(path)} gestures={recordingGestures().gestures} />);
    await settle();

    expect(sessionStore.getState().session).toBe(before);
    expect(visits).toEqual([]);
    const prompt = el.querySelector('[role="alertdialog"]');
    expect(prompt).not.toBeNull();
    expect(text(el)).toContain('Ouvrir un AUTRE compte ?');
    expect(text(el)).toContain('@ada');
    expect(text(el)).toContain('Bob Martin');
    expect(text(el)).toContain('@bob');
    expect(text(el)).toContain('b•••@meeshy.example');
    expect(text(el)).not.toContain('bob@meeshy.example');
    expect(el.querySelector('img')?.getAttribute('src')).toContain('bob.png');
    const answers = [...el.querySelectorAll('[data-answer]')].map((node) => node.getAttribute('data-answer'));
    expect(answers).toEqual(['cancel', 'confirm']);
    expect(document.activeElement).toBe(button(el, 'cancel'));
    expect(button(el, 'cancel')?.textContent).toContain('Annuler');
  });

  test('« Annuler » : la session prouvée est refermée, la session ouverte reste, retour à l’accueil', async () => {
    signInAsAda();
    const before = sessionStore.getState().session;
    const { client } = realAuth({ ok: true, data: BOB_SESSION, status: 200 });
    const { gestures, adopted, discarded } = recordingGestures();
    const visits: string[] = [];
    const el = mountInto(<MagicLinkValidation token="tok-bob" returnUrl="/conversations/c-1" validate={client.validateMagicLink} go={(path) => visits.push(path)} gestures={gestures} />);
    await settle();

    await click(button(el, 'cancel'));

    expect(adopted).toEqual([]);
    expect(discarded.map((r) => [r.current.id, r.proven.user.id])).toEqual([['u-ada', 'u-bob']]);
    expect(sessionStore.getState().session).toBe(before);
    expect(visits).toEqual(['/chats']);
  });

  test('« Ouvrir cet autre compte » : la bascule, puis la destination du lien', async () => {
    signInAsAda();
    const { client } = realAuth({ ok: true, data: BOB_SESSION, status: 200 });
    const { gestures, adopted, discarded } = recordingGestures();
    const visits: string[] = [];
    const el = mountInto(<MagicLinkValidation token="tok-bob" returnUrl={null} validate={client.validateMagicLink} go={(path) => visits.push(path)} gestures={gestures} />);
    await settle();

    await click(button(el, 'confirm'));

    expect(discarded).toEqual([]);
    expect(adopted.map((r) => r.proven.user.id)).toEqual(['u-bob']);
    expect(visits).toEqual(['/chats']);
  });

  test('quitter l’écran sans répondre vaut « non » : la session prouvée est refermée, une seule fois', async () => {
    signInAsAda();
    const before = sessionStore.getState().session;
    const { client } = realAuth({ ok: true, data: BOB_SESSION, status: 200 });
    const { gestures, adopted, discarded } = recordingGestures();
    mountInto(<MagicLinkValidation token="tok-bob" returnUrl={null} validate={client.validateMagicLink} go={() => undefined} gestures={gestures} />);
    await settle();

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    await settle();

    expect(adopted).toEqual([]);
    expect(discarded.map((r) => r.proven.user.id)).toEqual(['u-bob']);
    expect(sessionStore.getState().session).toBe(before);
  });

  test('une réponse donnée n’est pas rejouée au démontage', async () => {
    signInAsAda();
    const { client } = realAuth({ ok: true, data: BOB_SESSION, status: 200 });
    const { gestures, adopted, discarded } = recordingGestures();
    const el = mountInto(<MagicLinkValidation token="tok-bob" returnUrl={null} validate={client.validateMagicLink} go={() => undefined} gestures={gestures} />);
    await settle();
    await click(button(el, 'confirm'));
    await click(button(el, 'cancel'));

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    await settle();

    expect(adopted.length).toBe(1);
    expect(discarded).toEqual([]);
  });

  test('le MÊME compte ⇒ rotation, sans question', async () => {
    signInAsAda();
    const { client } = realAuth({ ok: true, data: { ...BOB_SESSION, user: { id: 'u-ada', username: 'ada' }, token: 'jwt-rot' }, status: 200 });
    const visits: string[] = [];
    const el = mountInto(<MagicLinkValidation token="tok-ada" returnUrl={null} validate={client.validateMagicLink} go={(path) => visits.push(path)} gestures={recordingGestures().gestures} />);
    await settle();

    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    const session = sessionStore.getState().session;
    expect(session.status === 'authenticated' ? session.token : null).toBe('jwt-rot');
    expect(visits).toEqual(['/chats']);
  });

  test('un lien INVALIDE sur un appareil connecté ⇒ l’erreur, et la session ouverte intacte', async () => {
    signInAsAda();
    const before = sessionStore.getState().session;
    const { client } = realAuth({ ok: false, status: 400, error: 'This link has expired.' });
    const el = mountInto(<MagicLinkValidation token="tok-bidon" returnUrl={null} validate={client.validateMagicLink} go={() => undefined} gestures={recordingGestures().gestures} />);
    await settle();

    expect(text(el)).toContain('Lien invalide ou expiré');
    expect(sessionStore.getState().session).toBe(before);
  });
});

describe('Lien de vérification d’e-mail — inscription et revendication (#10451)', () => {
  test('servi pour un AUTRE compte ⇒ la question, ni célébration ni session posée', async () => {
    signInAsAda();
    const before = sessionStore.getState().session;
    const { client } = realAuth({ ok: true, data: { verified: true, ...BOB_SESSION }, status: 200 });
    const scheduler = { setInterval: () => ({}), clearInterval: () => undefined, now: () => 0 };
    const el = mountInto(
      <VerifyEmailFlow
        email="bob@meeshy.example"
        token="tok-v"
        next={null}
        deps={{
          verifyEmail: client.verifyEmail,
          resendVerification: async () => ({ ok: true, data: { message: 'ok' }, status: 200 }),
          clock: createIntervalClock(1_000, scheduler),
          now: () => 0,
          appHandoff: { target: () => null, open: () => undefined, watch: () => () => undefined },
          accountGestures: recordingGestures().gestures,
        }}
      />,
    );
    await settle();

    expect(sessionStore.getState().session).toBe(before);
    expect(el.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(text(el)).toContain('@bob');
    expect(text(el)).not.toContain('Adresse confirmée !');
  });
});

describe('Code reçu par e-mail (#10451)', () => {
  test('un code qui prouve un AUTRE compte ⇒ la même question, la session ouverte intacte', async () => {
    signInAsAda();
    const before = sessionStore.getState().session;
    const { client } = realAuth({ ok: true, data: { verified: true, ...BOB_SESSION }, status: 200 });
    const el = mountInto(
      <EmailCodeForm
        email="bob@meeshy.example"
        next={null}
        onVerified={() => undefined}
        verifyEmail={client.verifyEmail}
        verificationStatus={async () => ({ ok: true, data: { status: 'pending' }, status: 200 })}
        accountGestures={recordingGestures().gestures}
      />,
    );
    const input = el.querySelector('input') as HTMLInputElement;
    await act(async () => {
      input.value = '123456';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      (el.querySelector('form') as HTMLFormElement).requestSubmit();
    });
    await settle();

    expect(sessionStore.getState().session).toBe(before);
    expect(el.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(text(el)).toContain('Ouvrir un AUTRE compte ?');
  });
});
