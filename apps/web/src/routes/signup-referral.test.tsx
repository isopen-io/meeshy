import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import SignupScreen from '@/routes/signup';
import * as affiliateApi from '@/lib/api/affiliate';
import type { ReferralValidation } from '@/lib/api/affiliate';
import type { RegisterBody, RegisterResponseData } from '@/lib/api/auth';
import type { ApiResult } from '@/lib/api/http';
import { forgetPendingVerification } from '@/lib/pending-verification';
import { REFERRAL_MEMORY_KEY } from '@/lib/view/referral-memory';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * LE CODE DE PARRAINAGE À L'INSCRIPTION (#6584) — question porteur
 * 2026-09-14 : « Ou de la possibilité d'entrer le code du référer lors de
 * l'inscription ? »
 *
 * La règle que ces témoins tiennent, et qui gouverne tout le reste : **un code
 * d'invitation n'est JAMAIS une condition d'entrée.** Refuser un compte parce
 * que le lien de celui qui invite a expiré serait punir l'invité de la
 * défaillance de l'hôte.
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
  });
  container.remove();
});

const VALID: ReferralValidation = {
  isValid: true,
  affiliateUser: { id: 'u1', username: 'zoe', displayName: 'Zoé Martin' },
};

function mountAt(url: string, validation: ReferralValidation = VALID): HTMLDivElement {
  window.history.replaceState({}, '', url);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <SignupScreen referralDeps={{ validate: async () => ({ ok: true as const, status: 200, data: validation }) }} />,
    );
  });
  return container;
}

function type(el: HTMLDivElement, selector: string, value: string) {
  const input = el.querySelector(selector) as HTMLInputElement;
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** L'identité ne paraît qu'à l'adresse valide (#6582) — le parrainage vit avec elle. */
function openIdentity(el: HTMLDivElement) {
  type(el, '#signup-email', 'ada@meeshy.example');
}

const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/gu, ' ');

/**
 * QUITTER LE CHAMP — `focusout` ET `blur`.
 *
 * React délègue `onBlur` sur `focusout` (le seul des deux qui remonte). Le
 * témoin émet les DEUX, pour la même raison qu'il émet `input` ET `change`
 * ailleurs : rester vrai quel que soit le détail de délégation, plutôt que de
 * mesurer une implémentation de React. Leçon 603, même famille.
 */
async function leave(el: HTMLDivElement, selector: string) {
  const champ = el.querySelector(selector) as HTMLInputElement;
  await act(async () => {
    champ.dispatchEvent(new Event('focusout', { bubbles: true }));
    champ.dispatchEvent(new Event('blur', { bubbles: true }));
  });
}

describe('sans code dans l’adresse, le champ ne s’impose à personne', () => {
  test('le champ est ABSENT — il y a un contrôle pour l’ouvrir, pas un champ de plus', () => {
    const el = mountAt('/signup');
    openIdentity(el);
    expect(el.querySelector('#signup-referral')).toBeNull();
    expect(text(el)).toContain('code de parrainage');
  });

  test('le contrôle l’ouvre', () => {
    const el = mountAt('/signup');
    openIdentity(el);
    act(() => {
      (el.querySelector('[data-signup-referral-toggle]') as HTMLButtonElement).click();
    });
    expect(el.querySelector('#signup-referral')).not.toBeNull();
  });
});

/**
 * LA MÉMOIRE — CE QUE LE LEGACY AVAIT, ET QUE CE LOT REPREND (#6584).
 *
 * `apps/web` écrit le jeton pour 30 jours (`localStorage` + cookie) et le relit
 * à l'inscription. Sans cette moitié, seul le cas RARE comptait : s'inscrire
 * sans jamais quitter la page d'arrivée. Le cas nominal d'un lien partagé —
 * cliquer, regarder, s'inscrire plus tard — perdait le parrainage.
 */
describe('un code reçu la veille tient encore', () => {
  test('sans rien dans l’adresse, un code MÉMORISÉ ouvre le bloc et le remplit', () => {
    window.localStorage.setItem(REFERRAL_MEMORY_KEY, JSON.stringify({ code: 'aff_hier', savedAt: Date.now() }));
    const el = mountAt('/signup');
    openIdentity(el);
    expect((el.querySelector('#signup-referral') as HTMLInputElement).value).toBe('aff_hier');
    window.localStorage.clear();
  });

  test('l’ADRESSE gagne sur la mémoire — un nouveau lien remplace l’ancien', () => {
    window.localStorage.setItem(REFERRAL_MEMORY_KEY, JSON.stringify({ code: 'aff_ancien', savedAt: Date.now() }));
    const el = mountAt('/signup?ref=aff_nouveau');
    openIdentity(el);
    expect((el.querySelector('#signup-referral') as HTMLInputElement).value).toBe('aff_nouveau');
    window.localStorage.clear();
  });

  test('arriver par un lien RETIENT le code pour la navigation qui suit', () => {
    window.localStorage.clear();
    mountAt('/signup?ref=aff_retenu');
    expect(window.localStorage.getItem(REFERRAL_MEMORY_KEY) ?? '').toContain('aff_retenu');
    window.localStorage.clear();
  });
});

describe('un lien d’invitation pose le code lui-même', () => {
  test('`?ref=` : le bloc est OUVERT et le champ REMPLI — rien à recopier', () => {
    const el = mountAt('/signup?ref=aff_abc123');
    openIdentity(el);
    const champ = el.querySelector('#signup-referral') as HTMLInputElement;
    expect(champ).not.toBeNull();
    expect(champ.value).toBe('aff_abc123');
  });

  test('`?parrain=` ouvre la même porte', () => {
    const el = mountAt('/signup?parrain=ref_zoe');
    openIdentity(el);
    expect((el.querySelector('#signup-referral') as HTMLInputElement).value).toBe('ref_zoe');
  });
});

describe('le code est VÉRIFIÉ, et ce qu’on en apprend est NOMMÉ', () => {
  test('un code valide nomme la personne qui invite', async () => {
    const el = mountAt('/signup?ref=aff_abc123');
    openIdentity(el);
    await leave(el, '#signup-referral');
    expect(text(el)).toContain('Zoé Martin');
  });

  test('un code refusé le DIT — et n’empêche pas de créer le compte', async () => {
    const el = mountAt('/signup?ref=aff_perime', { isValid: false });
    openIdentity(el);
    await leave(el, '#signup-referral');
    expect(text(el)).toContain('n’est plus valable');
    // LA règle du lot : le bouton reste ACTIF. Un jeton expiré est le problème
    // de celui qui a invité, jamais de celui qui s'inscrit.
    expect((el.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });
});

/**
 * LE PARRAINAGE VOYAGE AVEC L'INSCRIPTION (#8058) — arbitrage porteur
 * 2026-09-26 : « C'est pas sauvegardé lors de la création de compte ? »
 *
 * Depuis #8055, une inscription SANS numéro ne rend plus de session : l'appel
 * authentifié `POST /affiliate/register` d'après-inscription ne pouvait plus
 * partir. Le code part donc DANS le corps de `POST /auth/register`
 * (`affiliateToken`), et la passerelle noue la relation à la création du
 * compte, activé ou non.
 */
const AWAITING_CODE: ApiResult<RegisterResponseData> = {
  ok: true,
  status: 200,
  data: { status: 'verification-required', accountCreated: true, email: 'ada@meeshy.example' },
};

const WITH_SESSION: ApiResult<RegisterResponseData> = {
  ok: true,
  status: 200,
  data: { user: { id: 'u-1', username: 'ada' }, token: 'jwt', sessionToken: 'sess', expiresIn: 86_400 },
};

const REFUSED: ApiResult<RegisterResponseData> = { ok: false, status: 500, error: 'boom' };

function mountRegistering(url: string, reply: ApiResult<RegisterResponseData>): { readonly el: HTMLDivElement; readonly sent: RegisterBody[] } {
  window.history.replaceState({}, '', url);
  const sent: RegisterBody[] = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <SignupScreen
        referralDeps={{ validate: async () => ({ ok: true as const, status: 200, data: VALID }) }}
        register={async (body) => {
          sent.push(body);
          return reply;
        }}
      />,
    );
  });
  return { el: container, sent };
}

async function submit(el: HTMLDivElement, { withPhone }: { readonly withPhone: boolean }) {
  await act(async () => {
    el.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  if (withPhone) return;
  await act(async () => {
    (el.querySelector('[data-confirm="confirm"]') as HTMLButtonElement).click();
  });
}

describe('le code de parrainage part AVEC l’inscription (#8058)', () => {
  afterEach(() => {
    window.localStorage.clear();
    forgetPendingVerification();
  });

  test('sans numéro (écran du code) : `affiliateToken` est dans le corps, et le code mémorisé est oublié', async () => {
    const { el, sent } = mountRegistering('/signup?ref=aff_abc123', AWAITING_CODE);
    openIdentity(el);
    await submit(el, { withPhone: false });
    expect(sent.length).toBe(1);
    expect(sent[0]?.affiliateToken).toBe('aff_abc123');
    expect(window.localStorage.getItem(REFERRAL_MEMORY_KEY)).toBeNull();
    expect(window.location.pathname).toBe('/auth/verify-email');
  });

  test('avec numéro (session immédiate) : `affiliateToken` est dans le corps, et le code mémorisé est oublié', async () => {
    const { el, sent } = mountRegistering('/signup?ref=aff_abc123', WITH_SESSION);
    openIdentity(el);
    type(el, '#signup-phone', '612345678');
    await submit(el, { withPhone: true });
    expect(sent[0]?.affiliateToken).toBe('aff_abc123');
    expect(sent[0]?.phoneNumber).toBe('612345678');
    expect(window.localStorage.getItem(REFERRAL_MEMORY_KEY)).toBeNull();
  });

  test('aucun code ⇒ aucune clé de parrainage dans le corps', async () => {
    window.localStorage.clear();
    const { el, sent } = mountRegistering('/signup', AWAITING_CODE);
    openIdentity(el);
    await submit(el, { withPhone: false });
    expect('affiliateToken' in (sent[0] ?? {})).toBe(false);
    expect('affiliateSessionKey' in (sent[0] ?? {})).toBe(false);
  });

  test('une inscription REFUSÉE garde le code pour la tentative suivante', async () => {
    const { el, sent } = mountRegistering('/signup?ref=aff_abc123', REFUSED);
    openIdentity(el);
    await submit(el, { withPhone: false });
    expect(sent[0]?.affiliateToken).toBe('aff_abc123');
    expect(window.localStorage.getItem(REFERRAL_MEMORY_KEY) ?? '').toContain('aff_abc123');
  });

  test('plus aucun rattachement SÉPARÉ après l’inscription — le port n’offre plus `POST /affiliate/register`', () => {
    expect('convertReferral' in affiliateApi).toBe(false);
  });
});
