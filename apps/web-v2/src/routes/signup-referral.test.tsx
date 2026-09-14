import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import SignupScreen from '@/routes/signup';
import type { ReferralValidation } from '@/lib/api/affiliate';
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
