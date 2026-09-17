import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { authColumnIn, strayFromAuthColumn } from '@/test-support/auth-column';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { perceivableText } from '@/test-support/perceivable-text';
import type { ApiResult } from '@/lib/api/http';

import { ResetPasswordFlow, type ResetPasswordFlowDeps } from './reset-password-flow';

/**
 * LE FLUX DE RÉINITIALISATION, RENDU (T-reset, #5672) — patron
 * `magic-link-validation` : le jeton se vérifie AVANT de montrer le
 * formulaire (`checking` → `form`/`invalid`/`offline-check`), et le reset
 * lui-même se conclut par `done`, jamais une session.
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

function resetStub(responses: ReadonlyArray<ApiResult<ResetData>>) {
  const calls: { token: string; newPassword: string; confirmPassword: string }[] = [];
  let i = 0;
  const resetPassword = async (request: { token: string; newPassword: string; confirmPassword: string }) => {
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
