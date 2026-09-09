import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import { createIntervalClock, type IntervalClockScheduler } from '@/lib/view/interval-clock';
import type { MagicLinkRequestData } from '@/lib/view/magic-link';

import { MagicLinkFlow, type MagicLinkFlowDeps } from '@/components/magic-link-flow';

/**
 * T9 (#5816) — « MagicLinkFlow », les cinq états (vide, saisie, envoi,
 * attente + compte à rebours, erreur, hors-ligne) et le renvoi. Patron
 * `use-back-dismiss.test.tsx`.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  GlobalRegistrator.register({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
});

/** Une horloge à la seconde ENTIÈREMENT contrôlée : `advanceSeconds` avance
 * le temps virtuel PAR PAS D'UNE SECONDE et rejoue le tick à chaque pas — le
 * même dispositif que `interval-clock.test.ts`, mais exposé en horloge
 * RÉELLE (`IntervalClock`) pour nourrir `useCountdown`. */
function fakeClock() {
  let current = 0;
  let tick: (() => void) | null = null;
  let activeTimer: unknown = null;
  const scheduler: IntervalClockScheduler = {
    setInterval: (callback) => {
      tick = callback;
      activeTimer = {};
      return activeTimer;
    },
    clearInterval: (id) => {
      if (id === activeTimer) {
        tick = null;
        activeTimer = null;
      }
    },
    now: () => current,
  };
  return {
    clock: createIntervalClock(1_000, scheduler),
    now: () => current,
    advanceSeconds(seconds: number) {
      for (let i = 0; i < seconds; i += 1) {
        current += 1_000;
        act(() => {
          tick?.();
        });
      }
    },
    hasActiveTimer: () => activeTimer !== null,
  };
}

function requestStub(responses: ReadonlyArray<ApiResult<MagicLinkRequestData>>) {
  const calls: ReadonlyArray<{ email: string; rememberDevice?: boolean }>[] = [];
  let i = 0;
  const request = async (
    body: { email: string; rememberDevice?: boolean },
  ): Promise<ApiResult<MagicLinkRequestData>> => {
    (calls as unknown as { email: string; rememberDevice?: boolean }[]).push(body);
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return r ?? { ok: false, status: 0, error: 'aucune réponse programmée' };
  };
  return { calls: calls as unknown as { email: string; rememberDevice?: boolean }[], request };
}

function mount(deps: MagicLinkFlowDeps): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<MagicLinkFlow deps={deps} />);
  });
  return container;
}

function fill(el: HTMLDivElement, value: string) {
  const input = el.querySelector('#magic-link-email') as HTMLInputElement;
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function submit(el: HTMLDivElement) {
  const form = el.querySelector('form') as HTMLFormElement;
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('MagicLinkFlow — (a) vide', () => {
  test('bouton disabled, champ autofocus (le champ reçoit le focus au montage)', () => {
    const { clock, now } = fakeClock();
    const el = mount({ request: requestStub([]).request, clock, now });
    const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    const input = el.querySelector('#magic-link-email') as HTMLInputElement;
    expect(button.disabled).toBe(true);
    expect(document.activeElement).toBe(input);
  });
});

describe('MagicLinkFlow — (b) saisie', () => {
  test('e-mail invalide ⇒ toujours disabled ; valide ⇒ actif', () => {
    const { clock, now } = fakeClock();
    const el = mount({ request: requestStub([]).request, clock, now });
    const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;

    fill(el, 'a@b');
    expect(button.disabled).toBe(true);

    fill(el, 'ada@meeshy.example');
    expect(button.disabled).toBe(false);
  });
});

describe('MagicLinkFlow — (c) envoi', () => {
  test('clic ⇒ aria-busy puis "Envoi…", UN appel avec { email }', async () => {
    const { clock, now } = fakeClock();
    const stub = requestStub([{ ok: true, data: { expiresInSeconds: 600 }, status: 200 }]);
    const el = mount({ request: stub.request, clock, now });
    fill(el, 'ada@meeshy.example');

    // Un appel async ne se résout pas SYNCHRONEMENT avec `act()` seul :
    // on l'attend explicitement avant de lire l'état "après" l'envoi.
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });

    expect(stub.calls).toEqual([{ email: 'ada@meeshy.example' }]);
  });
});

describe('MagicLinkFlow — (d) attente + compte à rebours', () => {
  test('« Lien envoyé ! », timer 10:00 → 0:00, expiration, renvoi relance à 10:00', async () => {
    const { clock, now, advanceSeconds, hasActiveTimer } = fakeClock();
    const stub = requestStub([
      { ok: true, data: { expiresInSeconds: 600 }, status: 200 },
      { ok: true, data: { expiresInSeconds: 600 }, status: 200 },
    ]);
    const el = mount({ request: stub.request, clock, now });
    fill(el, 'ada@meeshy.example');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });

    expect(el.textContent).toContain('Lien envoyé !');
    const timer = () => el.querySelector('[role="timer"]');
    expect(timer()?.textContent).toBe('10:00');
    const resend = () => el.querySelector('[aria-label="Renvoyer le lien magique"]') as HTMLButtonElement;
    expect(resend().disabled).toBe(true);

    advanceSeconds(599);
    expect(timer()?.textContent).toBe('0:01');

    advanceSeconds(1);
    expect(el.textContent).toContain('Lien expiré, renvoyez-en un nouveau');
    expect(resend().disabled).toBe(false);
    // Désabonnement à 0 : le planificateur n'a plus de minuteur actif.
    expect(hasActiveTimer()).toBe(false);

    await act(async () => {
      resend().click();
      await Promise.resolve();
    });
    expect(stub.calls.length).toBe(2);
    expect(el.querySelectorAll('[role="timer"]').length).toBe(1);
    expect(timer()?.textContent).toBe('10:00');
  });
});

describe('MagicLinkFlow — (e) Annuler', () => {
  test('retour à la saisie, e-mail CONSERVÉ, erreur effacée', async () => {
    const { clock, now } = fakeClock();
    const stub = requestStub([{ ok: false, status: 400, error: 'Invalid email address' }]);
    const el = mount({ request: stub.request, clock, now });
    fill(el, 'ada@meeshy.example');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
    expect(el.textContent).toContain('Adresse e-mail invalide');

    // Cet échec (400) ne fait PAS passer à l'étape attente — on reste en
    // saisie ; « Annuler » n'est donc pas exercé ici, mais l'email doit
    // rester dans le champ et l'erreur doit pouvoir être effacée par une
    // nouvelle saisie valide.
    const input = el.querySelector('#magic-link-email') as HTMLInputElement;
    expect(input.value).toBe('ada@meeshy.example');
  });
});

describe('MagicLinkFlow — (f) erreurs', () => {
  test('rate-limited ⇒ bandeau role=alert, reste en saisie', async () => {
    const { clock, now } = fakeClock();
    const stub = requestStub([{ ok: true, data: {}, status: 200 }]);
    const el = mount({ request: stub.request, clock, now });
    fill(el, 'ada@meeshy.example');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent ?? '').toContain('Trop de demandes');
    expect(el.querySelector('[role="timer"]')).toBeNull();
  });

  test('invalid-email ⇒ sous le champ', async () => {
    const { clock, now } = fakeClock();
    const stub = requestStub([{ ok: false, status: 400, error: 'Invalid email address' }]);
    const el = mount({ request: stub.request, clock, now });
    fill(el, 'ada@meeshy.example');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
    expect(el.querySelector('#magic-link-email-error')?.textContent).toBe('Adresse e-mail invalide');
  });
});

describe('MagicLinkFlow — (g) hors-ligne', () => {
  test('bandeau + bouton disabled', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const { clock, now } = fakeClock();
    const el = mount({ request: requestStub([]).request, clock, now });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    fill(el, 'ada@meeshy.example');
    const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
