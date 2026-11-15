import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createAuthClient } from '@/lib/api/auth';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { accountReplacementOf, provenSessionOf, type AccountReplacement, type ProvenSessionGestures } from '@/lib/api/proven-session';
import { sessionStore } from '@/lib/api/session';
import { createIntervalClock } from '@/lib/view/interval-clock';

import { AccountReplacementPrompt } from './account-replacement-prompt';
import { EmailCodeForm } from './email-code-form';
import { VerifyEmailFlow } from './verify-email-flow';

/**
 * LES RÉSERVES DE L'AUDIT DE #10451 (#10474) sur la question « un AUTRE
 * compte » : la session prouvée se referme aussi au DÉCHARGEMENT de la page
 * (R2) ; l'échec du chargement des gestes de l'appareil ferme la question
 * avec un message, sans rejet orphelin (R3) ; un compte à second facteur mène
 * à la saisie du code, jamais à la célébration ni à `onSignedIn` (R4) ; le
 * @pseudo du compte proposé, que l'attaquant ne choisit pas librement, passe
 * avant son nom affiché (R5).
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
  window.history.replaceState(null, '', '/');
});

const BOB = { id: 'u-bob', username: 'bob', displayName: 'Ada Lovelace (support)', email: 'bob@meeshy.example' };
const BOB_SESSION = { user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 86_400 };
const BOB_CHALLENGE = { verified: true, requires2FA: true, twoFactorToken: 'tf-bob', user: BOB };
const ADA = { id: 'u-ada', username: 'ada', displayName: 'Ada' };

function signInAsAda(): void {
  sessionStore.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3_600 });
}

function realAuth(response: ApiResult<unknown>) {
  return createAuthClient({
    store: sessionStore,
    transport: { request: async <T,>(_request: HttpRequest) => response as ApiResult<T> },
  });
}

function recordingGestures(overrides: Partial<ProvenSessionGestures> = {}) {
  const adopted: AccountReplacement[] = [];
  const discarded: AccountReplacement[] = [];
  const abandoned: AccountReplacement[] = [];
  const gestures: ProvenSessionGestures = {
    adopt: async (replacement) => {
      adopted.push(replacement);
      return true;
    },
    discard: async (replacement) => {
      discarded.push(replacement);
    },
    abandon: (replacement) => {
      abandoned.push(replacement);
    },
    ...overrides,
  };
  return { gestures, adopted, discarded, abandoned };
}

/** La bascule réelle de l'appareil, réduite à ce que `adopt` fait au magasin. */
function adoptingGestures(): ProvenSessionGestures {
  return {
    adopt: async (replacement) => {
      sessionStore.getState().clearSession();
      const proven = replacement.proven;
      if (proven.kind === 'second-factor') sessionStore.getState().beginTwoFactor({ user: proven.user, twoFactorToken: proven.twoFactorToken });
      return true;
    },
    discard: async () => undefined,
    abandon: () => undefined,
  };
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
const here = () => window.location.pathname;

async function click(target: HTMLElement | null) {
  await act(async () => {
    target?.click();
  });
  await settle();
}

function bobReplacement(data: object = BOB_SESSION): AccountReplacement {
  signInAsAda();
  const replacement = accountReplacementOf(sessionStore.getState().session, provenSessionOf(data));
  if (replacement === null) throw new Error('aucune question');
  return replacement;
}

function prompt(replacement: AccountReplacement, gestures: ProvenSessionGestures, onDiscarded: () => void = () => undefined) {
  return mountInto(<AccountReplacementPrompt language="fr" replacement={replacement} gestures={gestures} onAdopted={() => undefined} onDiscarded={onDiscarded} />);
}

describe('R2 — décharger la page pendant la question referme la session prouvée', () => {
  test('`pagehide` ⇒ la session de Bob est abandonnée (keepalive), une seule fois, et le démontage ne la rejoue pas', async () => {
    const { gestures, abandoned, discarded } = recordingGestures();
    prompt(bobReplacement(), gestures);
    await settle();

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      window.dispatchEvent(new Event('pagehide'));
    });
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    await settle();

    expect(abandoned.map((r) => r.proven.user.id)).toEqual(['u-bob']);
    expect(discarded).toEqual([]);
  });

  test('une réponse déjà donnée n’est pas rejouée au déchargement', async () => {
    const { gestures, abandoned, adopted } = recordingGestures();
    const el = prompt(bobReplacement(), gestures);
    await settle();
    await click(button(el, 'confirm'));

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(adopted.length).toBe(1);
    expect(abandoned).toEqual([]);
  });
});

describe('retour par le cache de pages après un déchargement', () => {
  test('pagehide persisted puis pageshow persisted ⇒ la question refusée est quittée, sans rejouer le refus', async () => {
    const { gestures, abandoned, discarded } = recordingGestures();
    const leaves: string[] = [];
    prompt(bobReplacement(), gestures, () => leaves.push('discarded'));
    await settle();

    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    });
    await settle();

    expect(abandoned.length).toBe(1);
    expect(discarded).toEqual([]);
    expect(leaves).toEqual(['discarded']);
  });

  test('un pageshow sans déchargement préalable ne quitte pas la question', async () => {
    const { gestures } = recordingGestures();
    const leaves: string[] = [];
    const el = prompt(bobReplacement(), gestures, () => leaves.push('discarded'));
    await settle();

    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    });

    expect(leaves).toEqual([]);
    expect(button(el, 'confirm')).not.toBeNull();
  });
});

describe('R3 — les gestes de l’appareil ne se chargent pas', () => {
  test('« Ouvrir » qui échoue ⇒ la question se ferme sur un message, la session de Bob est refermée, Ada reste', async () => {
    const replacement = bobReplacement();
    const before = sessionStore.getState().session;
    const { gestures, discarded } = recordingGestures({ adopt: () => Promise.reject(new Error('Failed to fetch dynamically imported module')) });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    const leaves: string[] = [];
    const el = prompt(replacement, gestures, () => leaves.push('discarded'));
    await settle();

    await click(button(el, 'confirm'));
    await settle();
    process.off('unhandledRejection', onUnhandled);

    expect(unhandled).toEqual([]);
    expect(discarded.map((r) => r.proven.user.id)).toEqual(['u-bob']);
    expect(sessionStore.getState().session).toBe(before);
    expect(el.querySelector('[data-answer]')).toBeNull();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(text(el)).toContain('Impossible d’ouvrir cet autre compte');

    await click(el.querySelector('[data-action="leave"]') as HTMLButtonElement | null);
    expect(leaves).toEqual(['discarded']);
  });
});

describe('#10513 — accepter après la fenêtre d’adoption', () => {
  test('« Ouvrir » sur une preuve trop ancienne ⇒ la question se ferme sur « le lien a expiré », Ada reste ouverte', async () => {
    const replacement = bobReplacement();
    const before = sessionStore.getState().session;
    const { gestures, discarded } = recordingGestures({ adopt: async () => 'expired' });
    const leaves: string[] = [];
    const el = prompt(replacement, gestures, () => leaves.push('discarded'));
    await settle();

    await click(button(el, 'confirm'));
    await settle();

    expect(discarded).toEqual([]);
    expect(sessionStore.getState().session).toBe(before);
    expect(el.querySelector('[data-answer]')).toBeNull();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(text(el)).toContain('Ce lien a expiré');
    expect(text(el)).toContain('demandez-en un nouveau');

    await click(el.querySelector('[data-action="leave"]') as HTMLButtonElement | null);
    expect(leaves).toEqual(['discarded']);
  });
});

describe('R4 — un compte à second facteur mène à la saisie du code', () => {
  test('code, appareil sans compte ⇒ la saisie du second facteur, jamais `onSignedIn`', async () => {
    const signedIn: string[] = [];
    const el = mountInto(
      <EmailCodeForm
        email="bob@meeshy.example"
        next={null}
        onVerified={() => signedIn.push('verified')}
        onSignedIn={() => signedIn.push('signed-in')}
        verifyEmail={realAuth({ ok: true, data: BOB_CHALLENGE, status: 200 }).verifyEmail}
        verificationStatus={async () => ({ ok: true, data: { status: 'pending' }, status: 200 })}
      />,
    );
    await submitCode(el);

    expect(signedIn).toEqual([]);
    expect(sessionStore.getState().session.status).toBe('pending2fa');
    expect(here()).toBe('/login');
  });

  test('code d’un AUTRE compte à second facteur, accepté ⇒ la saisie du second facteur, jamais `onSignedIn`', async () => {
    signInAsAda();
    const signedIn: string[] = [];
    const el = mountInto(
      <EmailCodeForm
        email="bob@meeshy.example"
        next={null}
        onVerified={() => signedIn.push('verified')}
        onSignedIn={() => signedIn.push('signed-in')}
        verifyEmail={realAuth({ ok: true, data: BOB_CHALLENGE, status: 200 }).verifyEmail}
        verificationStatus={async () => ({ ok: true, data: { status: 'pending' }, status: 200 })}
        accountGestures={adoptingGestures()}
      />,
    );
    await submitCode(el);
    await click(button(el, 'confirm'));

    expect(signedIn).toEqual([]);
    expect(sessionStore.getState().session.status).toBe('pending2fa');
    expect(here()).toBe('/login');
  });

  test('lien de vérification, appareil sans compte ⇒ la saisie du second facteur, sans célébration', async () => {
    const el = mountInto(<VerifyEmailFlow email="bob@meeshy.example" token="tok-v" next={null} deps={flowDeps(BOB_CHALLENGE, adoptingGestures())} />);
    await settle();

    expect(text(el)).not.toContain('Adresse confirmée !');
    expect(sessionStore.getState().session.status).toBe('pending2fa');
    expect(here()).toBe('/login');
  });

  test('lien de vérification d’un AUTRE compte à second facteur, accepté ⇒ la saisie du second facteur, sans célébration', async () => {
    signInAsAda();
    const el = mountInto(<VerifyEmailFlow email="bob@meeshy.example" token="tok-v" next={null} deps={flowDeps(BOB_CHALLENGE, adoptingGestures())} />);
    await settle();
    await click(button(el, 'confirm'));

    expect(text(el)).not.toContain('Adresse confirmée !');
    expect(sessionStore.getState().session.status).toBe('pending2fa');
    expect(here()).toBe('/login');
  });
});

describe('R5 — le @pseudo du compte proposé passe avant son nom affiché', () => {
  test('le pseudo est le titre de la carte, en gras ; le nom affiché, choisi librement, vient en second', async () => {
    const el = prompt(bobReplacement(), recordingGestures().gestures);
    await settle();

    const card = el.querySelector('[data-proven-account]') as HTMLElement;
    const handle = card.querySelector('[data-proven-handle]') as HTMLElement | null;
    const name = card.querySelector('[data-proven-name]') as HTMLElement | null;
    expect(handle?.textContent).toBe('@bob');
    expect(handle?.tagName).toBe('STRONG');
    expect(name?.textContent).toBe('Ada Lovelace (support)');
    expect(handle!.compareDocumentPosition(name!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

function flowDeps(data: object, accountGestures: ProvenSessionGestures) {
  const scheduler = { setInterval: () => ({}), clearInterval: () => undefined, now: () => 0 };
  return {
    verifyEmail: realAuth({ ok: true, data, status: 200 }).verifyEmail,
    resendVerification: async () => ({ ok: true as const, data: { message: 'ok' }, status: 200 }),
    clock: createIntervalClock(1_000, scheduler),
    now: () => 0,
    appHandoff: { target: () => null, open: () => undefined, watch: () => () => undefined },
    accountGestures,
  };
}

async function submitCode(el: HTMLElement) {
  const input = el.querySelector('input') as HTMLInputElement;
  await act(async () => {
    input.value = '123456';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    (el.querySelector('form') as HTMLFormElement).requestSubmit();
  });
  await settle();
}
