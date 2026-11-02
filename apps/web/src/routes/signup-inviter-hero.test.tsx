import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import SignupScreen from '@/routes/signup';
import { inviterCardOf, type ReferralValidation } from '@/lib/api/affiliate';
import type { ApiResult } from '@/lib/api/http';
import { loadInviteCatalog } from '@/lib/i18n-invite-catalog';
import { REFERRAL_INVITER_KEY, recallReferralInviter, rememberReferralInviter } from '@/lib/view/referral-inviter';
import { REFERRAL_MEMORY_KEY } from '@/lib/view/referral-memory';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * LE CADRE « QUI M'INVITE » DE L'INSCRIPTION PAR AFFILIATION (#10559) —
 * demande porteur 2026-10-13 : « un cadre hero indiquant qui a invité, avec son
 * avatar et sa bannière », nommé par « le nom et prénom ou display name de
 * l'utilisateur, avec son pseudo ».
 *
 * Les témoins rendent l'ÉCRAN et lisent ce qu'il montre depuis la charge servie
 * par `GET /affiliate/validate/:token`.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/signup' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInviteCatalog('fr');
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
  window.localStorage.removeItem(REFERRAL_MEMORY_KEY);
  window.localStorage.removeItem(REFERRAL_INVITER_KEY);
});

type Validate = (code: string) => Promise<ApiResult<ReferralValidation>>;

const served = (validation: ReferralValidation): Validate => async () => ({ ok: true as const, status: 200, data: validation });

const invited = (user: Partial<NonNullable<ReferralValidation['affiliateUser']>> = {}): ReferralValidation => ({
  isValid: true,
  affiliateUser: { id: 'u1', username: 'amani', displayName: 'Amani Diallo', avatar: '/avatars/amani.png', banner: '/banners/amani.jpg', ...user },
});

async function mountAt(url: string, validate: Validate): Promise<HTMLDivElement> {
  window.history.replaceState({}, '', url);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<SignupScreen referralDeps={{ validate }} />);
  });
  return container;
}

/** Le champ du code vit dans la carte d'identité : téléphone plausible, puis adresse valide. */
function openIdentity(el: HTMLElement) {
  const fill = (selector: string, value: string) => {
    const input = el.querySelector(selector) as HTMLInputElement;
    act(() => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  fill('#signup-phone', '612345678');
  fill('#signup-email', 'ada@meeshy.example');
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const hero = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-signup-inviter]');
const heroState = (el: HTMLElement) => hero(el)?.getAttribute('data-signup-inviter') ?? null;

describe('arriver par un lien d’affiliation montre qui invite', () => {
  test('nom affiché, pseudo, avatar et bannière — avant le formulaire', async () => {
    const el = await mountAt('/signup?ref=aff_abc', served(invited()));
    await settle();

    expect(heroState(el)).toBe('shown');
    const frame = hero(el) as HTMLElement;
    expect(frame.querySelector('#signup-inviter-title')?.textContent).toBe('⁨Amani Diallo⁩ t’invite sur Meeshy');
    expect(frame.querySelector('[data-signup-inviter-username]')?.textContent).toBe('@amani');
    expect(frame.querySelector('[data-signup-inviter-banner]')?.getAttribute('data-signup-inviter-banner')).toBe('image');
    expect(frame.querySelector<HTMLImageElement>('[data-signup-inviter-banner] img')?.getAttribute('src')).toContain('/banners/amani.jpg');
    expect(frame.querySelector<HTMLImageElement>('[data-signup-inviter-banner] img')?.getAttribute('alt')).toBe('');
    expect(frame.querySelector<HTMLImageElement>('[role="img"][aria-label="Amani Diallo"] img')?.getAttribute('src')).toContain('/avatars/amani.png');
    const form = el.querySelector('#signup-form') as HTMLElement;
    expect(frame.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('sans nom affiché : prénom et nom, avec le pseudo', async () => {
    const el = await mountAt('/signup?ref=aff_abc', served(invited({ displayName: '  ', firstName: 'Amani', lastName: 'Diallo' })));
    await settle();
    expect(hero(el)?.querySelector('#signup-inviter-title')?.textContent).toBe('⁨Amani Diallo⁩ t’invite sur Meeshy');
    expect(hero(el)?.querySelector('[data-signup-inviter-username]')?.textContent).toBe('@amani');
  });

  test('ni nom affiché ni prénom ni nom : le pseudo seul est le titre, sans se répéter', async () => {
    const el = await mountAt('/signup?ref=aff_abc', served(invited({ displayName: null, firstName: null, lastName: null })));
    await settle();
    expect(hero(el)?.querySelector('#signup-inviter-title')?.textContent).toBe('⁨amani⁩ t’invite sur Meeshy');
    expect(hero(el)?.querySelector('[data-signup-inviter-username]')).toBeNull();
  });

  test('sans bannière ni avatar : le dégradé de sa couleur et ses initiales', async () => {
    const el = await mountAt('/signup?ref=aff_abc', served(invited({ avatar: null, banner: null })));
    await settle();
    const frame = hero(el) as HTMLElement;
    expect(frame.querySelector('[data-signup-inviter-banner]')?.getAttribute('data-signup-inviter-banner')).toBe('gradient');
    expect(frame.querySelector('[data-signup-inviter-banner] img')).toBeNull();
    expect(frame.textContent).toContain('AD');
  });

  test('une bannière qui ne se charge pas laisse le dégradé, jamais une image cassée', async () => {
    const el = await mountAt('/signup?ref=aff_abc', served(invited()));
    await settle();
    const image = hero(el)?.querySelector('[data-signup-inviter-banner] img') as HTMLImageElement;
    act(() => {
      image.dispatchEvent(new Event('error'));
    });
    expect(hero(el)?.querySelector('[data-signup-inviter-banner]')?.getAttribute('data-signup-inviter-banner')).toBe('gradient');
  });
});

describe('les états du cadre', () => {
  test('le temps de la réponse : un squelette à la place du cadre, annoncé occupé', async () => {
    const el = await mountAt('/signup?ref=aff_abc', () => new Promise<ApiResult<ReferralValidation>>(() => {}));
    expect(heroState(el)).toBe('pending');
    expect(hero(el)?.getAttribute('aria-busy')).toBe('true');
    expect(hero(el)?.querySelector('#signup-inviter-title')).toBeNull();
  });

  test('jeton invalide ou expiré : pas de cadre, et l’inscription reste possible', async () => {
    const el = await mountAt('/signup?ref=aff_mort', served({ isValid: false }));
    await settle();
    expect(hero(el)).toBeNull();
    expect(el.querySelector('#signup-phone')).not.toBeNull();
    openIdentity(el);
    expect(el.querySelector('[data-signup-referral-status]')?.getAttribute('data-signup-referral-status')).toBe('invalid');
  });

  test('réseau en panne sans rien en mémoire : pas de cadre, pas de squelette qui reste', async () => {
    const el = await mountAt('/signup?ref=aff_abc', async () => ({ ok: false as const, status: 0, error: 'offline' }));
    await settle();
    expect(hero(el)).toBeNull();
    expect(el.querySelector('#signup-phone')).not.toBeNull();
  });

  test('sans code dans l’adresse ni en mémoire : aucun cadre, aucune requête', async () => {
    const calls: string[] = [];
    const el = await mountAt('/signup', async (code) => {
      calls.push(code);
      return { ok: true as const, status: 200, data: invited() };
    });
    await settle();
    expect(hero(el)).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('le cadre est servi par la mémoire d’abord', () => {
  const card = inviterCardOf(invited());

  test('un invitant déjà vu paraît à la première image, sans squelette', async () => {
    if (card === null) throw new Error('charge de témoin invalide');
    rememberReferralInviter('aff_abc', card);
    const el = await mountAt('/signup?ref=aff_abc', () => new Promise<ApiResult<ReferralValidation>>(() => {}));
    expect(heroState(el)).toBe('shown');
    expect(hero(el)?.querySelector('#signup-inviter-title')?.textContent).toContain('Amani Diallo');
  });

  test('la mémoire d’un AUTRE code ne nomme personne', async () => {
    if (card === null) throw new Error('charge de témoin invalide');
    rememberReferralInviter('aff_autre', card);
    const el = await mountAt('/signup?ref=aff_abc', () => new Promise<ApiResult<ReferralValidation>>(() => {}));
    expect(heroState(el)).toBe('pending');
  });

  test('la réponse rafraîchit la mémoire ; un jeton devenu invalide l’efface et retire le cadre', async () => {
    if (card === null) throw new Error('charge de témoin invalide');
    const fresh = await mountAt('/signup?ref=aff_abc', served(invited({ displayName: 'Amani D.' })));
    await settle();
    expect(recallReferralInviter('aff_abc')?.name).toBe('Amani D.');
    act(() => {
      root.unmount();
    });
    fresh.remove();

    const el = await mountAt('/signup?ref=aff_abc', served({ isValid: false }));
    await settle();
    expect(hero(el)).toBeNull();
    expect(recallReferralInviter('aff_abc')).toBeNull();
  });

  test('une panne de réseau garde l’invitant déjà connu', async () => {
    if (card === null) throw new Error('charge de témoin invalide');
    rememberReferralInviter('aff_abc', card);
    const el = await mountAt('/signup?ref=aff_abc', async () => ({ ok: false as const, status: 0, error: 'offline' }));
    await settle();
    expect(heroState(el)).toBe('shown');
  });

  test('ce qui est mémorisé ne porte que nom, pseudo, avatar et bannière', () => {
    if (card === null) throw new Error('charge de témoin invalide');
    rememberReferralInviter('aff_abc', card);
    const stored = JSON.parse(window.localStorage.getItem(REFERRAL_INVITER_KEY) ?? '{}') as { card?: Record<string, unknown> };
    expect(Object.keys(stored.card ?? {}).sort()).toEqual(['avatar', 'banner', 'name', 'username']);
  });
});

describe('changer de code à la main', () => {
  test('retire le cadre de l’ancien invitant tant que le nouveau code n’est pas vérifié', async () => {
    const el = await mountAt('/signup?ref=aff_abc', served(invited()));
    await settle();
    openIdentity(el);
    const input = el.querySelector('#signup-referral') as HTMLInputElement;
    act(() => {
      input.value = 'aff_autre';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(hero(el)).toBeNull();
  });
});
