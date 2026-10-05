import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ApiResult } from '@/lib/api/http';
import type { MagicLinkRequestData } from '@/lib/api/auth';
import type { VerificationStatusData, VerifyEmailData } from '@/lib/api/verify-email';
import { forgetPendingVerification, holdPendingVerification } from '@/lib/pending-verification';
import { createIntervalClock } from '@/lib/view/interval-clock';

import { MagicLinkPanel } from './magic-link-panel';
import { VerifyEmailFlow } from './verify-email-flow';

/**
 * L'ÉCRAN DU CODE DIT QUE L'ADRESSE A ÉTÉ CONFIRMÉE AILLEURS (#8083) — le lien
 * ouvert sur l'ordinateur ne fige plus l'écran du code du téléphone. Il ne le
 * CONNECTE pas pour autant (« si et seulement si ») : il invite à saisir le
 * code, seconde clé, qui reste valable.
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
  forgetPendingVerification();
  window.history.replaceState({}, '', '/');
});

const PROVEN_TEXT = 'Adresse confirmée ✓ — saisissez le code reçu pour vous connecter ici.';
const clock = createIntervalClock(1_000, { setInterval: () => ({}), clearInterval: () => undefined, now: () => 0 });
const neverVerify = async (): Promise<ApiResult<VerifyEmailData>> => ({ ok: false, status: 400, error: 'x' });

function statusStub(status: VerificationStatusData['status']) {
  const tokens: string[] = [];
  const verificationStatus = async (token: string): Promise<ApiResult<VerificationStatusData>> => {
    tokens.push(token);
    return { ok: true, status: 200, data: { status } };
  };
  return { tokens, verificationStatus };
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

function render(node: ReactNode): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container;
}

function mountFlow(stub: ReturnType<typeof statusStub>): HTMLDivElement {
  return render(
    <VerifyEmailFlow
      email="neuf@meeshy.example"
      deps={{
        verifyEmail: neverVerify,
        resendVerification: async () => ({ ok: true, data: { message: 'ok' }, status: 200 }),
        clock,
        now: () => 0,
        verificationStatus: stub.verificationStatus,
      }}
    />,
  );
}

describe('/auth/verify-email — l’adresse confirmée ailleurs (#8083)', () => {
  test('« proven » ⇒ l’écran le dit, le champ du code reste là, AUCUNE session ouverte', async () => {
    holdPendingVerification({ email: 'neuf@meeshy.example', accountCreated: true, pendingSessionToken: 'attente-1' });
    const stub = statusStub('proven');
    const el = mountFlow(stub);
    await act(async () => {
      await flush();
    });
    expect(stub.tokens).toEqual(['attente-1']);
    expect(el.textContent).toContain(PROVEN_TEXT);
    expect(el.querySelector('#verify-email-code')).not.toBeNull();
    expect(window.location.pathname).toBe('/');
  });

  test('« pending » ⇒ rien n’est annoncé', async () => {
    holdPendingVerification({ email: 'neuf@meeshy.example', accountCreated: true, pendingSessionToken: 'attente-1' });
    const stub = statusStub('pending');
    const el = mountFlow(stub);
    await act(async () => {
      await flush();
    });
    expect(stub.tokens).toEqual(['attente-1']);
    expect(el.textContent).not.toContain(PROVEN_TEXT);
  });

  test('sans jeton d’attente (rechargement, ancienne passerelle) ⇒ aucune interrogation', async () => {
    holdPendingVerification({ email: 'neuf@meeshy.example', accountCreated: true });
    const stub = statusStub('proven');
    mountFlow(stub);
    await act(async () => {
      await flush();
    });
    expect(stub.tokens).toEqual([]);
  });
});

describe('connexion par e-mail seul — l’étape « e-mail envoyé » (#8083)', () => {
  test('le jeton rendu par la demande sert à l’écran du code, jamais à l’adresse', async () => {
    const stub = statusStub('proven');
    const request = async (): Promise<ApiResult<MagicLinkRequestData>> => ({
      ok: true,
      status: 200,
      data: { expiresInSeconds: 600, pendingSessionToken: 'attente-3' },
    });
    const el = render(<MagicLinkPanel deps={{ request, clock, now: () => 0, verifyEmail: neverVerify, verificationStatus: stub.verificationStatus }} />);
    const input = el.querySelector('input[type="email"]') as HTMLInputElement;
    act(() => {
      input.value = 'ada@meeshy.example';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flush();
    });
    await act(async () => {
      await flush();
    });
    expect(stub.tokens).toEqual(['attente-3']);
    expect(el.textContent).toContain(PROVEN_TEXT);
    expect(window.location.href).not.toContain('attente-3');
  });
});
