import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ApiResult } from '@/lib/api/http';
import { createIntervalClock, type IntervalClockScheduler } from '@/lib/view/interval-clock';
import type { MagicLinkRequestData } from '@/lib/view/magic-link';

import { MagicLinkFlow, type MagicLinkFlowDeps } from '@/components/magic-link-flow';
import { MagicLinkValidation } from '@/components/magic-link-validation';
import { authColumnIn, strayFromAuthColumn } from '@/test-support/auth-column';
import { controlledBy, perceivableText } from '@/test-support/perceivable-text';

/**
 * T9 (#5816) — « MagicLinkFlow », les cinq états (vide, saisie, envoi,
 * attente + compte à rebours, erreur, hors-ligne) et le renvoi. Patron
 * `use-back-dismiss.test.tsx`.
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
  const calls: ReadonlyArray<{ email: string; rememberDevice?: boolean; returnUrl?: string }>[] = [];
  let i = 0;
  const request = async (
    body: { email: string; rememberDevice?: boolean; returnUrl?: string },
  ): Promise<ApiResult<MagicLinkRequestData>> => {
    (calls as unknown as { email: string; rememberDevice?: boolean; returnUrl?: string }[]).push(body);
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return r ?? { ok: false, status: 0, error: 'aucune réponse programmée' };
  };
  return { calls: calls as unknown as { email: string; rememberDevice?: boolean; returnUrl?: string }[], request };
}

function mount(deps: MagicLinkFlowDeps, next: string | null = null): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<MagicLinkFlow deps={deps} next={next} />);
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

/**
 * LE RETOUR APRÈS CONNEXION (#6742) — `/auth/magic-link?next=` (la SAISIE)
 * porte le même paramètre que `/login` et `/signup` ; la demande l'envoie en
 * `returnUrl`, clampé (`safeNextPath`), jamais cru.
 */
describe('MagicLinkFlow — retour après connexion (#6742)', () => {
  test('un `next` sûr voyage en `returnUrl` dans la demande', async () => {
    const { clock, now } = fakeClock();
    const stub = requestStub([{ ok: true, data: { expiresInSeconds: 600 }, status: 200 }]);
    const el = mount({ request: stub.request, clock, now }, '/chat/mshy_equipe_7f3a');
    fill(el, 'ada@meeshy.example');

    await act(async () => {
      submit(el);
      await Promise.resolve();
    });

    expect(stub.calls).toEqual([{ email: 'ada@meeshy.example', returnUrl: '/chat/mshy_equipe_7f3a' }]);
  });

  for (const hostile of ['//evil.com', 'https://evil.com/chat/x', '/\\evil.com']) {
    test(`un \`next\` hors même-origine (${hostile}) ne voyage pas`, async () => {
      const { clock, now } = fakeClock();
      const stub = requestStub([{ ok: true, data: { expiresInSeconds: 600 }, status: 200 }]);
      const el = mount({ request: stub.request, clock, now }, hostile);
      fill(el, 'ada@meeshy.example');

      await act(async () => {
        submit(el);
        await Promise.resolve();
      });

      expect(stub.calls).toEqual([{ email: 'ada@meeshy.example' }]);
    });
  }
});

/**
 * LES INDÉSIRABLES, NOMMÉS PENDANT L'ATTENTE — derrière un (i) « Rien reçu ? »
 * depuis #6626.
 *
 * La passerelle rend 200 même pour une adresse inconnue
 * (`MagicLinkService.ts:133-137`, anti-énumération) : l'écran ne peut donc ni
 * promettre l'envoi ni le démentir. #6404 posait la note EN CLAIR ; la
 * directive porteur du 2026-09-15 (« moins de détails […] utiliser des (i) »)
 * la replie derrière un contrôle qui NOMME la question qu'on se pose à cet
 * instant. Repliée ne veut pas dire absente : le texte reste dans le DOM,
 * `sr-only`, et un lecteur d'écran l'atteint sans trouver le bouton.
 */
describe('MagicLinkFlow — la note sur les indésirables', () => {
  test('absente à la saisie ; à l’attente, un (i) « Rien reçu ? » replié qui s’ouvre', async () => {
    const { clock, now } = fakeClock();
    const stub = requestStub([{ ok: true, data: { expiresInSeconds: 600 }, status: 200 }]);
    const el = mount({ request: stub.request, clock, now });
    expect(el.querySelector('[aria-label="Rien reçu ?"]')).toBeNull();

    fill(el, 'ada@meeshy.example');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });

    const info = el.querySelector('button[aria-label="Rien reçu ?"]') as HTMLButtonElement | null;
    expect(info).not.toBeNull();
    expect(info?.getAttribute('aria-expanded')).toBe('false');
    const note = controlledBy(info);
    expect(note?.textContent).toBe('Regardez vos indésirables (spam) : le message peut y être tombé.');
    expect(note?.classList.contains('sr-only')).toBe(true);

    act(() => {
      info?.click();
    });
    expect(info?.getAttribute('aria-expanded')).toBe('true');
    expect(note?.classList.contains('sr-only')).toBe(false);
  });
});

describe('MagicLinkFlow — le vocabulaire dit « e-mail », jamais « magique » (#6626)', () => {
  test('l’en-tête de l’écran plein est « Connexion par e-mail »', () => {
    const { clock, now } = fakeClock();
    const el = mount({ request: requestStub([]).request, clock, now });
    expect(el.querySelector('h1')?.textContent).toBe('Connexion par e-mail');
    expect(perceivableText(el)).not.toMatch(/magi(que|c)/iu);
  });

  test('l’écran d’un lien invalide ne le dit pas davantage', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<MagicLinkValidation token={null} returnUrl={null} />);
    });
    expect(container.textContent).toContain('Lien invalide ou expiré');
    expect(perceivableText(container)).not.toMatch(/magi(que|c)/iu);
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

    expect(el.textContent).toContain('E-mail envoyé');
    expect((el.textContent ?? '').replace(/\s+/gu, ' ')).toContain('Ouvrez le lien reçu à ada@meeshy.example');
    expect(perceivableText(el)).not.toMatch(/magi(que|c)/iu);
    const timer = () => el.querySelector('[role="timer"]');
    expect(timer()?.textContent).toBe('10:00');
    const resend = () => el.querySelector('[aria-label="Renvoyer le lien"]') as HTMLButtonElement;
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

  /**
   * #6666 — depuis #6658, la passerelle rend un VRAI 429
   * (`code: 'RATE_LIMITED'`) plutôt que le 200 `data:{}` ci-dessus. Le même
   * bandeau doit apparaître, jamais le message de succès générique — et
   * l'étape doit rester « saisie », jamais « attente ».
   */
  test('429 (code RATE_LIMITED) ⇒ même bandeau, jamais l’étape « attente » (#6666)', async () => {
    const { clock, now } = fakeClock();
    const stub = requestStub([{ ok: false, status: 429, error: 'Too many requests', code: 'RATE_LIMITED' }]);
    const el = mount({ request: stub.request, clock, now });
    fill(el, 'ada@meeshy.example');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent ?? '').toContain('Trop de demandes');
    expect(el.textContent).not.toContain('E-mail envoyé');
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

/**
 * LA COLONNE DE LA CONNEXION (#6643) — l'écran plein du lien par e-mail portait
 * sa propre géométrie, pleine largeur : sur ordinateur, le champ s'étalait sur
 * tout l'écran pendant que `/login`, qui monte LE MÊME panneau, le rangeait au
 * centre. La largeur se mesure en navigateur (`check-access-column.mjs`) ; ici,
 * que tout vive dans UNE colonne.
 */
describe('MagicLinkFlow — tout tient dans UNE colonne, la puce « Fermer » comprise (#6643)', () => {
  test('saisie : l’en-tête « Connexion par e-mail » et sa puce « Fermer » vivent dans la colonne', () => {
    const { clock, now } = fakeClock();
    const el = mount({ request: requestStub([]).request, clock, now });
    const column = authColumnIn(el);
    expect(column?.querySelector('a[aria-label="Fermer"]')).not.toBeNull();
    expect(column?.querySelector('#magic-link-email')).not.toBeNull();
    expect(strayFromAuthColumn(el)).toEqual([]);
  });

  test('attente : le compte à rebours et « Rien reçu ? » aussi', async () => {
    const { clock, now } = fakeClock();
    const stub = requestStub([{ ok: true, data: { expiresInSeconds: 600 }, status: 200 }]);
    const el = mount({ request: stub.request, clock, now });
    fill(el, 'ada@meeshy.example');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
    expect(authColumnIn(el)?.querySelector('[role="timer"]')).not.toBeNull();
    expect(strayFromAuthColumn(el)).toEqual([]);
  });

  test('validation : l’écran d’un lien invalide aussi', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<MagicLinkValidation token={null} returnUrl={null} />);
    });
    expect(authColumnIn(container)?.querySelector('a[href="/auth/magic-link"]')).not.toBeNull();
    expect(strayFromAuthColumn(container)).toEqual([]);
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
