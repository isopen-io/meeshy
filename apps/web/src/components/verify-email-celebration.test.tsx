import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ApiResult } from '@/lib/api/http';
import { sessionStore } from '@/lib/api/session';
import type { VerifyEmailData, VerifyEmailRequest } from '@/lib/api/verify-email';
import { takeOnboardingWaiver } from '@/lib/onboarding/landing-waiver';
import { ARRIVAL_MAX_MS, ARRIVAL_MIN_MS, type ArrivalDeps } from '@/lib/arrival/arrival';
import { createIntervalClock } from '@/lib/view/interval-clock';

import { VerifyEmailFlow } from './verify-email-flow';

/**
 * L'ARRIVÉE PAR LE LIEN EST UNE CÉLÉBRATION (#8088) — le lien validé ouvre la
 * session : feu d'artifice (ou sa variante sobre), annonce « Adresse
 * confirmée — connexion… » au lecteur d'écran, préchargement des premières
 * données, PUIS la liste des conversations. Un lien refusé ne célèbre rien.
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

function arrivalStub(options: { readonly reduced?: boolean } = {}) {
  const timers: Array<{ readonly ms: number; readonly fire: () => void }> = [];
  let prefetches = 0;
  let finishPrefetch!: () => void;
  const prefetched = new Promise<void>((resolve) => {
    finishPrefetch = resolve;
  });
  const deps: ArrivalDeps = {
    prefetch: () => {
      prefetches += 1;
      return prefetched;
    },
    wait: (ms) => new Promise<void>((resolve) => timers.push({ ms, fire: resolve })),
    reducedMotion: () => options.reduced === true,
  };
  return {
    deps,
    prefetches: () => prefetches,
    finishPrefetch: () => finishPrefetch(),
    fire: (ms: number) => timers.filter((t) => t.ms === ms).forEach((t) => t.fire()),
  };
}

function mount(result: ApiResult<VerifyEmailData>, arrival: ArrivalDeps): { readonly el: HTMLDivElement; readonly calls: VerifyEmailRequest[] } {
  window.history.replaceState({}, '', '/auth/verify-email');
  const calls: VerifyEmailRequest[] = [];
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
          verifyEmail: async (request) => {
            calls.push(request);
            return result;
          },
          resendVerification: async () => ({ ok: true, data: { message: 'ok' }, status: 200 }),
          clock: createIntervalClock(1_000, scheduler),
          now: () => 0,
          appHandoff: { target: () => null, open: () => undefined, watch: () => () => undefined },
          arrival,
        }}
      />,
    );
  });
  return { el: container, calls };
}

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('VerifyEmailFlow — l’arrivée par le lien est une célébration (#8088)', () => {
  test('session ouverte ⇒ célébration annoncée, préchargement lancé, on reste le temps du minimum', async () => {
    const arrival = arrivalStub();
    const { el, calls } = mount({ ok: true, data: SESSION_DATA, status: 200 }, arrival.deps);
    await settle();

    expect(calls).toEqual([{ email: 'neuf@meeshy.example', token: 'tok-1' }]);
    const celebration = el.querySelector('[data-arrival-celebration]');
    expect(celebration).not.toBeNull();
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Adresse confirmée — connexion…');
    expect(arrival.prefetches()).toBe(1);
    expect(here()).toBe('/auth/verify-email');
  });

  test('minimum écoulé ET préchargement fini ⇒ la liste des conversations', async () => {
    const arrival = arrivalStub();
    mount({ ok: true, data: SESSION_DATA, status: 200 }, arrival.deps);
    await settle();
    arrival.finishPrefetch();
    await settle();
    expect(here()).toBe('/auth/verify-email');
    arrival.fire(ARRIVAL_MIN_MS);
    await settle();
    expect(here()).toBe('/');
    expect(takeOnboardingWaiver()).toBe(true);
  });

  test('préchargement lent ⇒ le plafond tranche : on arrive quand même sur les conversations', async () => {
    const arrival = arrivalStub();
    mount({ ok: true, data: SESSION_DATA, status: 200 }, arrival.deps);
    await settle();
    arrival.fire(ARRIVAL_MIN_MS);
    await settle();
    expect(here()).toBe('/auth/verify-email');
    arrival.fire(ARRIVAL_MAX_MS);
    await settle();
    expect(here()).toBe('/');
  });

  test('mouvement complet : le feu d’artifice se charge à la demande', async () => {
    const arrival = arrivalStub();
    const { el } = mount({ ok: true, data: SESSION_DATA, status: 200 }, arrival.deps);
    await settle();
    await settle();
    expect(el.querySelector('[data-arrival-celebration]')?.getAttribute('data-motion')).toBe('full');
    expect(el.querySelector('canvas[data-arrival-fireworks]')).not.toBeNull();
  });

  test('mouvement réduit : variante sobre, AUCUN feu d’artifice, même annonce, même destination', async () => {
    const arrival = arrivalStub({ reduced: true });
    const { el } = mount({ ok: true, data: SESSION_DATA, status: 200 }, arrival.deps);
    await settle();
    await settle();
    expect(el.querySelector('[data-arrival-celebration]')?.getAttribute('data-motion')).toBe('reduced');
    expect(el.querySelector('canvas')).toBeNull();
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Adresse confirmée — connexion…');
    arrival.finishPrefetch();
    arrival.fire(ARRIVAL_MIN_MS);
    await settle();
    expect(here()).toBe('/');
  });

  test('lien refusé (expiré ou invalide) ⇒ aucune célébration, aucun préchargement, le message existant', async () => {
    const arrival = arrivalStub();
    const { el } = mount({ ok: false, status: 400, error: 'Invalid token' }, arrival.deps);
    await settle();
    expect(el.querySelector('[data-arrival-celebration]')).toBeNull();
    expect(el.querySelector('canvas')).toBeNull();
    expect(arrival.prefetches()).toBe(0);
    expect(el.textContent).toContain('Ce lien n’est plus valide. Entrez le code reçu dans le même e-mail.');
  });

  test('démonté pendant la célébration ⇒ on ne navigue pas sous les pieds de l’utilisateur', async () => {
    const arrival = arrivalStub();
    mount({ ok: true, data: SESSION_DATA, status: 200 }, arrival.deps);
    await settle();
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    arrival.finishPrefetch();
    arrival.fire(ARRIVAL_MIN_MS);
    arrival.fire(ARRIVAL_MAX_MS);
    await settle();
    expect(here()).toBe('/auth/verify-email');
  });

  test('lien ouvert alors qu’une session existe déjà ⇒ même déroulé : le lien ouvre la session, on célèbre, on arrive sur les conversations', async () => {
    sessionStore.getState().establish({ user: { id: 'u-1', username: 'neuf', displayName: 'Neuf' }, token: 'old', sessionToken: 'old-s', expiresIn: 3600 });
    const arrival = arrivalStub();
    const { el, calls } = mount({ ok: true, data: SESSION_DATA, status: 200 }, arrival.deps);
    await settle();
    expect(calls).toHaveLength(1);
    expect(el.querySelector('[data-arrival-celebration]')).not.toBeNull();
    arrival.finishPrefetch();
    arrival.fire(ARRIVAL_MIN_MS);
    await settle();
    expect(here()).toBe('/');
  });
});
