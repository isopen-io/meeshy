import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ApiResult } from '@/lib/api/http';
import type { VerifyEmailData, VerifyEmailRequest } from '@/lib/api/verify-email';
import { takeOnboardingWaiver } from '@/lib/onboarding/landing-waiver';
import type { AppHandoff } from '@/lib/links/app-handoff';
import { createIntervalClock } from '@/lib/view/interval-clock';

import { VerifyEmailFlow } from './verify-email-flow';

/**
 * LE LIEN OUVERT SUR UN TÉLÉPHONE EST D'ABORD REMIS À L'APP, AVANT D'ÊTRE
 * CONSOMMÉ (#8083, décision porteur « SI ET SEULEMENT SI »). Le jeton est à
 * usage unique : si le navigateur le validait d'abord, l'app ouverte ensuite
 * n'aurait plus rien à valider. L'app ne s'ouvre pas (page toujours visible
 * après ~1,5 s) ⇒ le navigateur valide et se connecte, sans message d'erreur.
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
  takeOnboardingWaiver();
  window.history.replaceState({}, '', '/auth/verify-email');
});

const SESSION_DATA: VerifyEmailData = {
  verified: true,
  token: 'jwt',
  sessionToken: 'sess',
  user: { id: 'u-1', username: 'neuf', displayName: 'Neuf' },
};

const here = () => `${window.location.pathname}${window.location.search}`;

function handoffStub(target: string | null) {
  const opened: string[] = [];
  const verdicts: Array<(appOpened: boolean) => void> = [];
  let cancelled = 0;
  const handoff: AppHandoff = {
    target: () => target,
    open: (url) => opened.push(url),
    watch: (_ms, done) => {
      verdicts.push(done);
      return () => {
        cancelled += 1;
      };
    },
  };
  return { handoff, opened, verdicts, cancelled: () => cancelled };
}

function verifyStub() {
  const calls: VerifyEmailRequest[] = [];
  const verifyEmail = async (request: VerifyEmailRequest): Promise<ApiResult<VerifyEmailData>> => {
    calls.push(request);
    return { ok: true, data: SESSION_DATA, status: 200 };
  };
  return { calls, verifyEmail };
}

function mount(stub: ReturnType<typeof verifyStub>, appHandoff: AppHandoff): HTMLDivElement {
  const scheduler = { setInterval: () => ({}), clearInterval: () => undefined, now: () => 0 };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <VerifyEmailFlow
        email="neuf@meeshy.example"
        token="tok-1"
        next={null}
        deps={{
          verifyEmail: stub.verifyEmail,
          resendVerification: async () => ({ ok: true, data: { message: 'ok' }, status: 200 }),
          clock: createIntervalClock(1_000, scheduler),
          now: () => 0,
          appHandoff,
          arrival: { prefetch: async () => undefined, wait: async () => undefined, reducedMotion: () => true },
        }}
      />,
    );
  });
  return container;
}

const INTENT = 'intent://auth/verify-email?token=tok-1#Intent;scheme=meeshy;package=me.meeshy.app;end';

describe('VerifyEmailFlow — remise du lien à l’app (#8083)', () => {
  test('téléphone : le lien est remis à l’app AVANT toute validation ; le jeton n’est pas consommé', () => {
    const stub = verifyStub();
    const h = handoffStub(INTENT);
    const el = mount(stub, h.handoff);
    expect(h.opened).toEqual([INTENT]);
    expect(stub.calls).toEqual([]);
    expect(el.textContent).toContain('Vérification du lien…');
    expect(el.querySelector('form')).toBeNull();
  });

  test('l’app ne s’ouvre pas (page toujours visible) ⇒ le navigateur valide et se connecte, sans erreur', async () => {
    const stub = verifyStub();
    const h = handoffStub(INTENT);
    const el = mount(stub, h.handoff);
    await act(async () => {
      h.verdicts[0]?.(false);
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(stub.calls).toEqual([{ email: 'neuf@meeshy.example', token: 'tok-1' }]);
    expect(here()).toBe('/');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  test('l’app s’est ouverte ⇒ le navigateur ne consomme RIEN ; « Continuer dans le navigateur » reste offert', async () => {
    const stub = verifyStub();
    const h = handoffStub(INTENT);
    const el = mount(stub, h.handoff);
    act(() => {
      h.verdicts[0]?.(true);
    });
    expect(stub.calls).toEqual([]);
    expect(el.textContent).toContain('Le lien a été ouvert dans l’app Meeshy.');

    const stay = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Continuer dans le navigateur');
    expect(stay).toBeDefined();
    await act(async () => {
      stay?.click();
      await Promise.resolve();
    });
    expect(stub.calls).toEqual([{ email: 'neuf@meeshy.example', token: 'tok-1' }]);
  });

  test('ordinateur ou coque (rien à remettre) : validation immédiate, comme avant', async () => {
    const stub = verifyStub();
    const h = handoffStub(null);
    await act(async () => {
      mount(stub, h.handoff);
      await Promise.resolve();
    });
    expect(h.opened).toEqual([]);
    expect(stub.calls).toEqual([{ email: 'neuf@meeshy.example', token: 'tok-1' }]);
  });

  test('démonté pendant l’attente ⇒ l’attente est annulée, rien n’est consommé', () => {
    const stub = verifyStub();
    const h = handoffStub(INTENT);
    mount(stub, h.handoff);
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    expect(h.cancelled()).toBeGreaterThan(0);
    expect(stub.calls).toEqual([]);
  });
});
