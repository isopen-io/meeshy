import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createAuthClient } from '@/lib/api/auth';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import type { AccountReplacement, ProvenSessionGestures } from '@/lib/api/proven-session';
import { sessionStore } from '@/lib/api/session';
import type { LinkDeviceSecrets } from '@/lib/links/link-device-secret';
import { createIntervalClock } from '@/lib/view/interval-clock';

import { MagicLinkValidation } from './magic-link-validation';
import { VerifyEmailFlow } from './verify-email-flow';

/**
 * #10872 — UN LIEN DE CONNEXION OUVERT AILLEURS QUE SUR L'APPAREIL QUI L'A
 * DEMANDÉ NE CONNECTE PERSONNE SANS LE DEMANDER. Les deux écrans qui
 * consomment un jeton reçu par e-mail passent par le VRAI client
 * d'authentification et le VRAI magasin de session ; seul le transport est un
 * enregistreur.
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

const MALLORY = { id: 'u-mallory', username: 'mallory', displayName: 'Mallory', avatar: null, email: 'mallory@meeshy.example' };
const MALLORY_SESSION = { user: MALLORY, token: 'jwt-mallory', sessionToken: 'sess-mallory', expiresIn: 86_400 };
const QUESTION = { requiresConfirmation: true, account: { id: 'u-mallory', username: 'mallory', displayName: 'Mallory', avatar: null } };
const SECRET = 'secret-de-ce-navigateur-0123456789abcdefgh';

function signInAs(user: { id: string; username: string; displayName: string }): void {
  sessionStore.getState().establish({ user, token: `jwt-${user.username}`, sessionToken: `sess-${user.username}`, expiresIn: 3_600 });
}

function realAuth(responses: ReadonlyArray<ApiResult<unknown>>, secret: string | null = null) {
  const calls: HttpRequest[] = [];
  let i = 0;
  const kept = { secret };
  const linkSecrets: LinkDeviceSecrets = {
    issue: async () => null,
    presented: () => kept.secret,
    forget: () => {
      kept.secret = null;
    },
  };
  const client = createAuthClient({
    store: sessionStore,
    linkSecrets,
    transport: {
      request: async <T,>(request: HttpRequest) => {
        calls.push(request);
        const response = responses[Math.min(i, responses.length - 1)];
        i += 1;
        return response as ApiResult<T>;
      },
    },
  });
  return { client, calls, kept };
}

function recordingGestures() {
  const adopted: AccountReplacement[] = [];
  const gestures: ProvenSessionGestures = {
    adopt: async (replacement) => {
      adopted.push(replacement);
      return true;
    },
    discard: async () => undefined,
    abandon: () => undefined,
  };
  return { gestures, adopted };
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

const bodyOf = (call: HttpRequest | undefined) => (call?.body ?? {}) as Record<string, unknown>;

function verifyDeps(client: ReturnType<typeof realAuth>['client'], gestures?: ProvenSessionGestures) {
  return {
    verifyEmail: client.verifyEmail,
    resendVerification: client.resendVerification,
    clock: createIntervalClock(1_000),
    now: () => Date.now(),
    appHandoff: { target: () => null, open: () => undefined, watch: () => () => undefined },
    arrival: { prefetch: async () => undefined, wait: async () => undefined, reducedMotion: () => true },
    ...(gestures === undefined ? {} : { accountGestures: gestures }),
  };
}

describe('Lien magique (#10872)', () => {
  test('même navigateur : le secret part avec le jeton, la session se pose sans question', async () => {
    const { client, calls } = realAuth([{ ok: true, status: 200, data: MALLORY_SESSION }], SECRET);
    const visits: string[] = [];
    const el = mountInto(<MagicLinkValidation token="tok" returnUrl={null} validate={client.validateMagicLink} go={(path) => visits.push(path)} />);
    await settle();

    expect(bodyOf(calls[0])).toMatchObject({ token: 'tok', linkDeviceSecret: SECRET });
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    expect(sessionStore.getState().session.status).toBe('authenticated');
    expect(visits).toEqual(['/chats']);
  });

  test('ouvert ailleurs : « Se connecter en tant que @mallory ? », AUCUNE session avant le oui', async () => {
    const { client, calls } = realAuth([{ ok: true, status: 200, data: QUESTION }]);
    const visits: string[] = [];
    const el = mountInto(<MagicLinkValidation token="tok" returnUrl={null} validate={client.validateMagicLink} go={(path) => visits.push(path)} />);
    await settle();

    expect(text(el)).toContain('Se connecter en tant que @mallory ?');
    expect(sessionStore.getState().session.status).toBe('anonymous');
    expect(visits).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(document.activeElement).toBe(button(el, 'cancel'));
  });

  test('« Se connecter » rejoue la validation avec `confirm: true`, puis la session se pose', async () => {
    const { client, calls } = realAuth([
      { ok: true, status: 200, data: QUESTION },
      { ok: true, status: 200, data: MALLORY_SESSION },
    ]);
    const visits: string[] = [];
    const el = mountInto(<MagicLinkValidation token="tok" returnUrl={null} validate={client.validateMagicLink} go={(path) => visits.push(path)} />);
    await settle();

    await click(button(el, 'confirm'));

    expect(bodyOf(calls[1])).toMatchObject({ token: 'tok', confirm: true });
    expect(sessionStore.getState().session.status).toBe('authenticated');
    expect(visits).toEqual(['/chats']);
  });

  test('« Annuler » : aucun second appel, aucune session, retour à la connexion', async () => {
    const { client, calls } = realAuth([{ ok: true, status: 200, data: QUESTION }]);
    const visits: string[] = [];
    const el = mountInto(<MagicLinkValidation token="tok" returnUrl={null} validate={client.validateMagicLink} go={(path) => visits.push(path)} />);
    await settle();

    await click(button(el, 'cancel'));

    expect(calls).toHaveLength(1);
    expect(sessionStore.getState().session.status).toBe('anonymous');
    expect(visits).toEqual(['/login']);
  });

  test('le compte du lien EST le compte ouvert : confirmé sans question', async () => {
    signInAs({ id: 'u-mallory', username: 'mallory', displayName: 'Mallory' });
    const { client, calls } = realAuth([
      { ok: true, status: 200, data: QUESTION },
      { ok: true, status: 200, data: MALLORY_SESSION },
    ]);
    const el = mountInto(<MagicLinkValidation token="tok" returnUrl={null} validate={client.validateMagicLink} go={() => undefined} />);
    await settle();

    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    expect(bodyOf(calls[1])).toMatchObject({ confirm: true });
  });

  test('un AUTRE compte ouvert : la question le nomme, et le oui ne la repose pas', async () => {
    signInAs({ id: 'u-ada', username: 'ada', displayName: 'Ada' });
    const { client } = realAuth([
      { ok: true, status: 200, data: QUESTION },
      { ok: true, status: 200, data: MALLORY_SESSION },
    ]);
    const { gestures, adopted } = recordingGestures();
    const el = mountInto(<MagicLinkValidation token="tok" returnUrl={null} validate={client.validateMagicLink} go={() => undefined} gestures={gestures} />);
    await settle();

    expect(text(el)).toContain('@ada');
    expect(sessionStore.getState().session.status === 'authenticated' && sessionStore.getState().session).toMatchObject({ user: { id: 'u-ada' } });

    await click(button(el, 'confirm'));

    expect(text(el)).not.toContain('Ouvrir un AUTRE compte ?');
    expect(adopted.map((r) => r.proven.user.id)).toEqual(['u-mallory']);
  });
});

describe('Lien de vérification (#10872)', () => {
  test('ouvert ailleurs : la question, aucune session, puis le oui rejoue avec `confirm`', async () => {
    const { client, calls } = realAuth([
      { ok: true, status: 200, data: QUESTION },
      { ok: true, status: 200, data: { verified: true, alreadyVerified: true, ...MALLORY_SESSION } },
    ]);
    const el = mountInto(<VerifyEmailFlow email="mallory@meeshy.example" token="tok" deps={verifyDeps(client)} />);
    await settle();

    expect(text(el)).toContain('Se connecter en tant que @mallory ?');
    expect(sessionStore.getState().session.status).toBe('anonymous');

    await click(button(el, 'confirm'));

    expect(bodyOf(calls[1])).toMatchObject({ email: 'mallory@meeshy.example', token: 'tok', confirm: true });
    expect(sessionStore.getState().session.status).toBe('authenticated');
  });

  test('« Annuler » : aucun second appel, aucune session', async () => {
    const { client, calls } = realAuth([{ ok: true, status: 200, data: QUESTION }]);
    const el = mountInto(<VerifyEmailFlow email="mallory@meeshy.example" token="tok" deps={verifyDeps(client)} />);
    await settle();

    await click(button(el, 'cancel'));

    expect(calls).toHaveLength(1);
    expect(sessionStore.getState().session.status).toBe('anonymous');
  });

  test('même navigateur : le secret part avec le jeton, sans question', async () => {
    const { client, calls } = realAuth([{ ok: true, status: 200, data: { verified: true, ...MALLORY_SESSION } }], SECRET);
    const el = mountInto(<VerifyEmailFlow email="mallory@meeshy.example" token="tok" deps={verifyDeps(client)} />);
    await settle();

    expect(bodyOf(calls[0])).toMatchObject({ token: 'tok', linkDeviceSecret: SECRET });
    expect(el.querySelector('[data-link-account]')).toBeNull();
    expect(sessionStore.getState().session.status).toBe('authenticated');
  });
});

/**
 * #10879 — le oui d'un lien de REVENDICATION (#8214) ne fait pas que connecter :
 * il rattache l'adresse au compte revendiquant. L'écran le DIT, et montre
 * l'adresse MASQUÉE par la passerelle — jamais l'adresse complète.
 */
describe('Lien de revendication d’adresse (#10879)', () => {
  const CLAIM = { ...QUESTION, intent: 'claim-email', maskedEmail: 'ma....y@m*****le' };

  test('la question dit que l’adresse passe au compte, avec l’adresse masquée, jamais en clair', async () => {
    const { client } = realAuth([{ ok: true, status: 200, data: CLAIM }]);
    const el = mountInto(<VerifyEmailFlow email="mallory@meeshy.example" token="tok" deps={verifyDeps(client)} />);
    await settle();

    expect(text(el)).toContain('Cette adresse sera rattachée à @mallory et retirée de tout autre compte Meeshy.');
    expect(el.querySelector('[data-link-email]')?.textContent).toBe('ma....y@m*****le');
    expect(text(el)).not.toContain('mallory@meeshy.example');
    expect(button(el, 'confirm')?.textContent).toBe('Rattacher l’adresse et se connecter');
  });

  test('une connexion simple montre l’adresse masquée, sans la phrase de rattachement', async () => {
    const { client } = realAuth([{ ok: true, status: 200, data: { ...QUESTION, intent: 'sign-in', maskedEmail: 'ma....y@m*****le' } }]);
    const el = mountInto(<MagicLinkValidation token="tok" returnUrl={null} validate={client.validateMagicLink} go={() => undefined} />);
    await settle();

    expect(el.querySelector('[data-link-email]')?.textContent).toBe('ma....y@m*****le');
    expect(text(el)).not.toContain('rattachée');
    expect(button(el, 'confirm')?.textContent).toBe('Se connecter');
  });

  test('une passerelle d’avant #10879 (ni nature ni adresse) : la question d’hier, sans ligne vide', async () => {
    const { client } = realAuth([{ ok: true, status: 200, data: QUESTION }]);
    const el = mountInto(<MagicLinkValidation token="tok" returnUrl={null} validate={client.validateMagicLink} go={() => undefined} />);
    await settle();

    expect(text(el)).toContain('Se connecter en tant que @mallory ?');
    expect(el.querySelector('[data-link-email]')).toBeNull();
    expect(text(el)).not.toContain('rattachée');
  });

  test('« Annuler » une revendication : aucun second appel, aucune session', async () => {
    const { client, calls } = realAuth([{ ok: true, status: 200, data: CLAIM }]);
    const el = mountInto(<VerifyEmailFlow email="mallory@meeshy.example" token="tok" deps={verifyDeps(client)} />);
    await settle();

    await click(button(el, 'cancel'));

    expect(calls).toHaveLength(1);
    expect(sessionStore.getState().session.status).toBe('anonymous');
  });
});
