import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { authColumnIn, strayFromAuthColumn } from '@/test-support/auth-column';
import { arriveByEmailLink, leaveEmailLink, tokenInHistory } from '@/test-support/email-link-arrival';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { perceivableText } from '@/test-support/perceivable-text';
import type { ApiResult } from '@/lib/api/http';
import { loadAccountRecoveryCatalog } from '@/lib/i18n-account-recovery-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { ResetPasswordFlow, type ResetPasswordFlowDeps } from './reset-password-flow';

/**
 * LE FLUX DE RÉINITIALISATION, RENDU (T-reset, #5672) — patron
 * `magic-link-validation` : le jeton se vérifie AVANT de montrer le
 * formulaire (`checking` → `form`/`invalid`/`offline-check`), et le reset
 * lui-même se conclut par `done`, jamais une session.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all(
    (['fr', 'en', 'it'] as const).flatMap((language) => [loadInterfaceCatalog(language), loadAccountRecoveryCatalog(language)]),
  );
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
  document.documentElement.lang = 'fr';
});

type VerifyTokenData = { readonly valid: boolean; readonly requires2FA?: boolean };
type ResetData = { readonly message: string };

function verifyTokenStub(response: ApiResult<VerifyTokenData>) {
  const calls: string[] = [];
  const verifyResetToken = async (token: string) => {
    calls.push(token);
    return response;
  };
  return { calls, verifyResetToken };
}

type ResetRequest = { token: string; newPassword: string; confirmPassword: string; twoFactorCode?: string };

function resetStub(responses: ReadonlyArray<ApiResult<ResetData>>) {
  const calls: ResetRequest[] = [];
  let i = 0;
  const resetPassword = async (request: ResetRequest) => {
    calls.push(request);
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return r ?? { ok: false as const, status: 0, error: 'aucune réponse programmée' };
  };
  return { calls, resetPassword };
}

async function mount(token: string | null, deps: ResetPasswordFlowDeps): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ResetPasswordFlow token={token} deps={deps} />);
    await Promise.resolve();
  });
  return container;
}

function fill(el: HTMLDivElement, id: string, value: string) {
  const input = el.querySelector(`#${id}`) as HTMLInputElement;
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

/**
 * « NOUVEAU MOT DE PASSE », JAMAIS « RÉINITIALISER » (#6643). Le même lien sert
 * à un compte qui n'a JAMAIS eu de mot de passe (#6642) : pour lui, rien n'est
 * « réinitialisé », il en CHOISIT un. Le vocabulaire est celui des trois
 * clients : titre « Nouveau mot de passe », bouton « Enregistrer le mot de
 * passe », succès « Mot de passe enregistré ».
 */
describe('ResetPasswordFlow — « Nouveau mot de passe », dans la colonne de la connexion (#6643)', () => {
  const valid = () => ({
    verifyResetToken: verifyTokenStub({ ok: true, data: { valid: true }, status: 200 }).verifyResetToken,
    resetPassword: resetStub([{ ok: true, data: { message: 'ok' }, status: 200 }]).resetPassword,
  });

  test('saisie : le titre dit « Nouveau mot de passe », le bouton « Enregistrer le mot de passe »', async () => {
    const el = await mount('abc123', valid());
    expect(el.querySelector('h1')?.textContent).toBe('Nouveau mot de passe');
    expect(el.querySelector('button[type="submit"]')?.textContent).toBe('Enregistrer le mot de passe');
    expect(perceivableText(el)).not.toMatch(/r[ée]initialis/iu);
    expect(authColumnIn(el)?.querySelector('a[aria-label="Fermer"]')).not.toBeNull();
    expect(strayFromAuthColumn(el)).toEqual([]);
  });

  test('enregistré : « Mot de passe enregistré », sans « réinitialisé »', async () => {
    const el = await mount('abc123', valid());
    fill(el, 'reset-password', 'Sup3r!Secret1');
    fill(el, 'reset-password-confirm', 'Sup3r!Secret1');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
    expect(el.querySelector('h2')?.textContent).toBe('Mot de passe enregistré');
    expect(perceivableText(el)).not.toMatch(/r[ée]initialis/iu);
    expect(strayFromAuthColumn(el)).toEqual([]);
  });

  test('lien invalide : aucun « réinitialisation » perçu', async () => {
    const el = await mount(null, valid());
    expect(el.textContent).toContain('Lien invalide ou expiré');
    expect(perceivableText(el)).not.toMatch(/r[ée]initialis/iu);
    expect(strayFromAuthColumn(el)).toEqual([]);
  });
});

describe('ResetPasswordFlow — `?token=` absent', () => {
  test('état invalide dès le montage, AUCUN appel réseau', async () => {
    const verify = verifyTokenStub({ ok: true, data: { valid: true }, status: 200 });
    const el = await mount(null, { verifyResetToken: verify.verifyResetToken, resetPassword: resetStub([]).resetPassword });
    expect(verify.calls).toEqual([]);
    expect(el.textContent).toContain('Lien invalide ou expiré');
    expect(el.querySelector('form')).toBeNull();
  });
});

describe('ResetPasswordFlow — jeton valide', () => {
  test('UN appel avec le jeton, le formulaire apparaît', async () => {
    const verify = verifyTokenStub({ ok: true, data: { valid: true }, status: 200 });
    const el = await mount('abc123', { verifyResetToken: verify.verifyResetToken, resetPassword: resetStub([]).resetPassword });
    expect(verify.calls).toEqual(['abc123']);
    expect(el.querySelector('form')).not.toBeNull();
    expect(el.textContent).not.toContain('Vérification du lien');
  });
});

describe('ResetPasswordFlow — jeton EXPIRÉ/consommé (`valid:false` en 200)', () => {
  test('⇒ état invalide, JAMAIS le formulaire', async () => {
    const verify = verifyTokenStub({ ok: true, data: { valid: false }, status: 200 });
    const el = await mount('perime', { verifyResetToken: verify.verifyResetToken, resetPassword: resetStub([]).resetPassword });
    expect(el.textContent).toContain('Lien invalide ou expiré');
    expect(el.querySelector('form')).toBeNull();
  });
});

describe('ResetPasswordFlow — hors-ligne À LA VÉRIFICATION du jeton', () => {
  test('⇒ bandeau + Réessayer, distinct de « invalide »', async () => {
    const verify = verifyTokenStub({ ok: false, status: 0, error: 'Failed to fetch' });
    const el = await mount('abc123', { verifyResetToken: verify.verifyResetToken, resetPassword: resetStub([]).resetPassword });
    expect(el.textContent).toContain('Pas de connexion');
    expect(el.querySelector('button')?.textContent).toBe('Réessayer');
  });
});

describe('ResetPasswordFlow — soumission', () => {
  test('bouton désactivé sous 12 caractères ou si dépareillé ; actif quand les deux correspondent', async () => {
    const verify = verifyTokenStub({ ok: true, data: { valid: true }, status: 200 });
    const el = await mount('abc123', { verifyResetToken: verify.verifyResetToken, resetPassword: resetStub([]).resetPassword });
    const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;

    fill(el, 'reset-password', 'court');
    fill(el, 'reset-password-confirm', 'court');
    expect(button.disabled).toBe(true);

    fill(el, 'reset-password', 'Sup3r!Secret1');
    fill(el, 'reset-password-confirm', 'AUTRE!Secret1');
    expect(button.disabled).toBe(true);
    expect(el.textContent).toContain('ne correspondent pas');

    fill(el, 'reset-password-confirm', 'Sup3r!Secret1');
    expect(button.disabled).toBe(false);
  });

  test('succès ⇒ état "done", jamais de session établie (le port ne fait qu’appeler resetPassword)', async () => {
    const verify = verifyTokenStub({ ok: true, data: { valid: true }, status: 200 });
    const reset = resetStub([{ ok: true, data: { message: 'ok' }, status: 200 }]);
    const el = await mount('abc123', { verifyResetToken: verify.verifyResetToken, resetPassword: reset.resetPassword });
    fill(el, 'reset-password', 'Sup3r!Secret1');
    fill(el, 'reset-password-confirm', 'Sup3r!Secret1');

    await act(async () => {
      submit(el);
      await Promise.resolve();
    });

    expect(reset.calls).toEqual([{ token: 'abc123', newPassword: 'Sup3r!Secret1', confirmPassword: 'Sup3r!Secret1' }]);
    expect(el.textContent).toContain('Mot de passe enregistré');
    expect(el.querySelector('form')).toBeNull();
  });

  test('jeton invalide/expiré à l’ENVOI (400) ⇒ retombe sur l’état invalide, sortie vers /forgot-password', async () => {
    const verify = verifyTokenStub({ ok: true, data: { valid: true }, status: 200 });
    const reset = resetStub([{ ok: false, status: 400, error: 'Invalid or expired reset token' }]);
    const el = await mount('abc123', { verifyResetToken: verify.verifyResetToken, resetPassword: reset.resetPassword });
    fill(el, 'reset-password', 'Sup3r!Secret1');
    fill(el, 'reset-password-confirm', 'Sup3r!Secret1');

    await act(async () => {
      submit(el);
      await Promise.resolve();
    });

    expect(el.textContent).toContain('Lien invalide ou expiré');
    const anchors = Array.from(el.querySelectorAll('a'));
    expect(anchors.some((a) => a.getAttribute('href') === '/forgot-password')).toBe(true);
  });
});

/** UNE SEULE LANGUE D'INTERFACE (#10823) — chaque état du flux suit la langue d'interface. */
describe('ResetPasswordFlow parle la langue d’interface', () => {
  const valid = () => ({
    verifyResetToken: verifyTokenStub({ ok: true, data: { valid: true }, status: 200 }).verifyResetToken,
    resetPassword: resetStub([{ ok: true, data: { message: 'ok' }, status: 200 }]).resetPassword,
  });

  test('interface en : titre, champs, erreurs et bouton en anglais', async () => {
    document.documentElement.lang = 'en';
    const el = await mount('abc123', valid());
    expect(el.querySelector('h1')?.textContent).toBe('New password');
    expect(el.textContent).toContain('Choose a new password.');
    expect(el.textContent).toContain('Confirm password');
    expect(el.querySelector('button[type="submit"]')?.textContent).toBe('Save password');
    fill(el, 'reset-password', 'short');
    fill(el, 'reset-password-confirm', 'other');
    expect(el.textContent).toContain('Password too short (min');
    expect(el.textContent).toContain('Passwords do not match');
    expect(el.textContent).not.toMatch(/Nouveau|Confirmer|Enregistrer|trop court|correspondent/u);
  });

  test('interface en : lien invalide et succès', async () => {
    document.documentElement.lang = 'en';
    const invalid = await mount(null, valid());
    expect(invalid.querySelector('h2')?.textContent).toBe('Invalid or expired link');
    expect(invalid.textContent).toContain('Request a new link');
    act(() => root.unmount());
    invalid.remove();

    const el = await mount('abc123', valid());
    fill(el, 'reset-password', 'Sup3r!Secret1');
    fill(el, 'reset-password-confirm', 'Sup3r!Secret1');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
    expect(el.querySelector('h2')?.textContent).toBe('Password saved');
    expect(el.textContent).toContain('You can now sign in with your new password.');
    expect(el.textContent).not.toMatch(/Mot de passe|connecter/u);
  });

  test('interface it : le titre vient du catalogue italien', async () => {
    document.documentElement.lang = 'it';
    const el = await mount('abc123', valid());
    expect(el.querySelector('h1')?.textContent).toBe('Nuova password');
    expect(el.querySelector('button[type="submit"]')?.textContent).toBe('Salva password');
  });
});

describe('ResetPasswordFlow — le jeton quitte l’historique une fois servi (#10864)', () => {
  afterEach(leaveEmailLink);

  test('jeton valide, formulaire ouvert : l’entrée le garde (un rechargement doit pouvoir le reprendre)', async () => {
    arriveByEmailLink('/reset-password', 'tok-form');
    const verify = verifyTokenStub({ ok: true, data: { valid: true }, status: 200 });
    await mount('tok-form', { verifyResetToken: verify.verifyResetToken, resetPassword: resetStub([]).resetPassword });
    expect(tokenInHistory()).toBe('tok-form');
  });

  test('mot de passe enregistré : l’entrée ne porte plus le jeton', async () => {
    arriveByEmailLink('/reset-password', 'tok-done');
    const verify = verifyTokenStub({ ok: true, data: { valid: true }, status: 200 });
    const reset = resetStub([{ ok: true, data: { message: 'ok' }, status: 200 }]);
    const el = await mount('tok-done', { verifyResetToken: verify.verifyResetToken, resetPassword: reset.resetPassword });
    fill(el, 'reset-password', 'Sup3r!Secret1');
    fill(el, 'reset-password-confirm', 'Sup3r!Secret1');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
    expect(el.querySelector('h2')?.textContent).toBe('Mot de passe enregistré');
    expect(tokenInHistory()).toBeNull();
  });

  test('jeton refusé à la vérification : l’entrée ne le porte plus', async () => {
    arriveByEmailLink('/reset-password', 'tok-dead');
    const verify = verifyTokenStub({ ok: true, data: { valid: false }, status: 200 });
    await mount('tok-dead', { verifyResetToken: verify.verifyResetToken, resetPassword: resetStub([]).resetPassword });
    expect(tokenInHistory()).toBeNull();
  });

  for (const status of [429, 500]) {
    test(`vérification refusée en ${status} (débit, panne) : le jeton n’est pas prouvé mort, l’entrée le garde`, async () => {
      arriveByEmailLink('/reset-password', `tok-${status}`);
      const verify = verifyTokenStub({ ok: false, status, error: 'Too many requests' });
      await mount(`tok-${status}`, { verifyResetToken: verify.verifyResetToken, resetPassword: resetStub([]).resetPassword });
      expect(tokenInHistory()).toBe(`tok-${status}`);
    });
  }

  async function submitWith(token: string, reply: ApiResult<ResetData>) {
    arriveByEmailLink('/reset-password', token);
    const verify = verifyTokenStub({ ok: true, data: { valid: true }, status: 200 });
    const el = await mount(token, { verifyResetToken: verify.verifyResetToken, resetPassword: resetStub([reply]).resetPassword });
    fill(el, 'reset-password', 'Sup3r!Secret1');
    fill(el, 'reset-password-confirm', 'Sup3r!Secret1');
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
  }

  test('envoi refusé pour le JETON : l’entrée ne le porte plus', async () => {
    await submitWith('tok-spent', { ok: false, status: 400, error: 'Invalid or expired reset token' });
    expect(tokenInHistory()).toBeNull();
  });

  test('envoi refusé pour le MOT DE PASSE (le jeton n’a pas servi) : l’entrée le garde', async () => {
    await submitWith('tok-weak', { ok: false, status: 400, error: 'Password requirements: too guessable' });
    expect(tokenInHistory()).toBe('tok-weak');
  });

  test('hors ligne à la vérification : l’entrée le garde, « Réessayer » en a besoin', async () => {
    arriveByEmailLink('/reset-password', 'tok-offline');
    const verify = verifyTokenStub({ ok: false, status: 0, error: 'Failed to fetch' });
    await mount('tok-offline', { verifyResetToken: verify.verifyResetToken, resetPassword: resetStub([]).resetPassword });
    expect(tokenInHistory()).toBe('tok-offline');
  });
});

/**
 * #10866 — un compte protégé par la double authentification peut enfin
 * réinitialiser depuis le web : le code est demandé quand la passerelle
 * l'exige, et chaque refus de l'envoi garde sa raison au lieu de tomber sur
 * « lien invalide ».
 */
describe('ResetPasswordFlow — le code 2FA quand la passerelle l’exige (#10866)', () => {
  afterEach(leaveEmailLink);

  async function mountWith(params: { requires2FA?: boolean; replies: ReadonlyArray<ApiResult<ResetData>>; token?: string }) {
    const token = params.token ?? 'tok-2fa';
    arriveByEmailLink('/reset-password', token);
    const verify = verifyTokenStub({ ok: true, data: { valid: true, requires2FA: params.requires2FA ?? false }, status: 200 });
    const reset = resetStub(params.replies);
    const el = await mount(token, { verifyResetToken: verify.verifyResetToken, resetPassword: reset.resetPassword });
    fill(el, 'reset-password', 'Sup3r!Secret1');
    fill(el, 'reset-password-confirm', 'Sup3r!Secret1');
    return { el, reset };
  }

  async function send(el: HTMLDivElement) {
    await act(async () => {
      submit(el);
      await Promise.resolve();
    });
  }

  const codeField = (el: HTMLDivElement) => el.querySelector('#reset-2fa-code') as HTMLInputElement | null;
  const submitButton = (el: HTMLDivElement) => el.querySelector('button[type="submit"]') as HTMLButtonElement;

  test('requires2FA à la vérification : le champ du code est là, l’envoi attend six chiffres et les transmet', async () => {
    const { el, reset } = await mountWith({ requires2FA: true, replies: [{ ok: true, data: { message: 'ok' }, status: 200 }] });
    expect(codeField(el)).not.toBeNull();
    expect(codeField(el)?.getAttribute('autocomplete')).toBe('one-time-code');
    expect(submitButton(el).disabled).toBe(true);

    fill(el, 'reset-2fa-code', '12 34a56');
    expect(codeField(el)?.value).toBe('123456');
    expect(submitButton(el).disabled).toBe(false);
    await send(el);

    expect(reset.calls).toEqual([{ token: 'tok-2fa', newPassword: 'Sup3r!Secret1', confirmPassword: 'Sup3r!Secret1', twoFactorCode: '123456' }]);
    expect(el.textContent).toContain('Mot de passe enregistré');
  });

  test('sans requires2FA : aucun champ de code, aucun code envoyé', async () => {
    const { el, reset } = await mountWith({ replies: [{ ok: true, data: { message: 'ok' }, status: 200 }] });
    expect(codeField(el)).toBeNull();
    await send(el);
    expect('twoFactorCode' in (reset.calls[0] ?? {})).toBe(false);
  });

  test('la passerelle exige le code à l’envoi : le champ apparaît, le formulaire reste, le jeton aussi', async () => {
    const { el } = await mountWith({ replies: [{ ok: false, status: 400, error: '2FA code required', code: 'TWO_FACTOR_REQUIRED' }] });
    await send(el);
    expect(el.querySelector('form')).not.toBeNull();
    expect(codeField(el)).not.toBeNull();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('code de vérification');
    expect(el.textContent).not.toContain('Lien invalide');
    expect(tokenInHistory()).toBe('tok-2fa');
  });

  test('code faux : « code incorrect », le champ se vide, on reste sur le formulaire', async () => {
    const { el } = await mountWith({
      requires2FA: true,
      replies: [{ ok: false, status: 400, error: 'Invalid 2FA code', code: 'TWO_FACTOR_INVALID' }],
    });
    fill(el, 'reset-2fa-code', '000000');
    await send(el);
    expect(el.querySelector('[role="alert"]')?.textContent).toBe('Code de vérification incorrect.');
    expect(codeField(el)?.value).toBe('');
    expect(el.textContent).not.toContain('Lien invalide');
    expect(tokenInHistory()).toBe('tok-2fa');
  });

  test('trop de codes faux : écran dédié, sortie vers un nouveau lien, le jeton quitte l’historique', async () => {
    const { el } = await mountWith({
      requires2FA: true,
      replies: [{ ok: false, status: 400, error: 'Too many invalid 2FA codes. Please request a new reset link.', code: 'TWO_FACTOR_ATTEMPTS_EXHAUSTED' }],
    });
    fill(el, 'reset-2fa-code', '000000');
    await send(el);
    expect(el.querySelector('h2')?.textContent).toBe('Trop de codes incorrects');
    expect(el.querySelector('form')).toBeNull();
    expect(Array.from(el.querySelectorAll('a')).some((a) => a.getAttribute('href') === '/forgot-password')).toBe(true);
    expect(tokenInHistory()).toBeNull();
  });

  test('mot de passe refusé par la passerelle : sa raison, pas « lien invalide »', async () => {
    const { el } = await mountWith({
      replies: [{ ok: false, status: 400, error: 'Password requirements: too guessable', code: 'RESET_PASSWORD_WEAK' }],
    });
    await send(el);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('trop facile à deviner');
    expect(el.querySelector('form')).not.toBeNull();
  });

  test('mot de passe déjà utilisé : sa raison', async () => {
    const { el } = await mountWith({
      replies: [{ ok: false, status: 400, error: 'Password was used recently. Please choose a different password.', code: 'RESET_PASSWORD_REUSED' }],
    });
    await send(el);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('déjà utilisé');
  });

  test('429 : trop d’essais, le formulaire reste', async () => {
    const { el } = await mountWith({ replies: [{ ok: false, status: 429, error: 'RATE_LIMIT_EXCEEDED' }] });
    await send(el);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Trop de tentatives');
    expect(el.querySelector('form')).not.toBeNull();
    expect(tokenInHistory()).toBe('tok-2fa');
  });

  test('interface en : le code et ses refus parlent anglais', async () => {
    document.documentElement.lang = 'en';
    const { el } = await mountWith({
      requires2FA: true,
      replies: [{ ok: false, status: 400, error: 'Invalid 2FA code', code: 'TWO_FACTOR_INVALID' }],
    });
    expect(el.textContent).toContain('Verification code');
    fill(el, 'reset-2fa-code', '000000');
    await send(el);
    expect(el.querySelector('[role="alert"]')?.textContent).toBe('Incorrect verification code.');
  });
});
