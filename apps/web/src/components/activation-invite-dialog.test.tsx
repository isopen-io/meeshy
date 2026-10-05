import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Activation } from '@/lib/api/activation';
import type { ApiResult } from '@/lib/api/http';
import type { VerifyEmailData, VerifyEmailRequest } from '@/lib/api/verify-email';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ActivationInviteDialog, type ActivationInviteDeps } from './activation-invite-dialog';

/**
 * **« VALIDEZ VOTRE COMPTE »** (#8239) — la modal de J7 à J28. Ce qu'elle
 * offre dépend de ce qui MANQUE : « Recevoir le code » (et sa saisie, SUR
 * PLACE) pour l'adresse, « Ajouter mon numéro » pour le téléphone ; « Plus
 * tard » et Échap ferment. Le code validé fait passer le compte à `done`.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const INVITE: Activation = { phase: 'invite', deadline: new Date(NOW + 12 * DAY).toISOString(), missing: ['email', 'phone'] };

function recorder(over: Partial<ActivationInviteDeps> = {}) {
  const calls: string[] = [];
  const deps: ActivationInviteDeps = {
    resendVerification: async (email) => {
      calls.push(`resend:${email}`);
      return { ok: true, data: { message: 'sent' } };
    },
    verifyEmail: async (request: VerifyEmailRequest): Promise<ApiResult<VerifyEmailData>> => {
      calls.push(`verify:${'code' in request ? request.code : ''}`);
      return { ok: true, data: { message: 'verified' } as VerifyEmailData };
    },
    requestPhoneCode: async (phone) => {
      calls.push(`phone:${phone}`);
      return { ok: true, data: {} };
    },
    verifyPhoneCode: async (code) => {
      calls.push(`phone-code:${code}`);
      return { ok: true, data: {} };
    },
    ...over,
  };
  return { deps, calls };
}

async function monter(activation: Activation = INVITE, over: Partial<ActivationInviteDeps> = {}) {
  const { deps, calls } = recorder(over);
  const closed: string[] = [];
  const changes: Activation[] = [];
  const host = await mounter.mount(
    <ActivationInviteDialog
      activation={activation}
      email="amina@example.test"
      now={NOW}
      language="fr"
      deps={deps}
      onActivationChange={(next) => changes.push(next)}
      onClose={() => closed.push('closed')}
    />,
  );
  return { host, calls, closed, changes };
}

const dialogOf = (host: ParentNode) => host.querySelector<HTMLDialogElement>('dialog[data-activation-invite]');

describe('la modal est nommée et dit le temps qui reste', () => {
  test('titre « Validez votre compte », jours restants, nommée et décrite', async () => {
    const { host } = await monter();
    const dialog = dialogOf(host);
    expect(dialog).not.toBeNull();
    const title = host.querySelector(`[id="${dialog?.getAttribute('aria-labelledby') ?? ''}"]`);
    expect(title?.textContent).toBe('Validez votre compte');
    expect(host.querySelector(`[id="${dialog?.getAttribute('aria-describedby') ?? ''}"]`)?.textContent).toContain('12 jours');
  });

  test('un seul jour restant se dit au singulier', async () => {
    const { host } = await monter({ ...INVITE, deadline: new Date(NOW + 3_600_000).toISOString() });
    expect(host.textContent).toContain('1 jour ');
  });
});

describe('ce qui est offert suit ce qui manque', () => {
  test('les deux manquent ⇒ « Recevoir le code » ET « Ajouter mon numéro », et « Plus tard »', async () => {
    const { host } = await monter();
    expect(buttonNamed(host, 'Recevoir le code')).not.toBeNull();
    expect(buttonNamed(host, 'Ajouter mon numéro')).not.toBeNull();
    expect(buttonNamed(host, 'Plus tard')).not.toBeNull();
  });

  test('seul le numéro manque ⇒ pas de code d’adresse', async () => {
    const { host } = await monter({ ...INVITE, missing: ['phone'] });
    expect(buttonNamed(host, 'Recevoir le code')).toBeNull();
    expect(buttonNamed(host, 'Ajouter mon numéro')).not.toBeNull();
  });

  test('seule l’adresse manque ⇒ pas de numéro', async () => {
    const { host } = await monter({ ...INVITE, missing: ['email'] });
    expect(buttonNamed(host, 'Ajouter mon numéro')).toBeNull();
  });
});

describe('fermer', () => {
  test('« Plus tard » ferme', async () => {
    const { host, closed } = await monter();
    await mounter.click(buttonNamed(host, 'Plus tard'));
    expect(closed).toEqual(['closed']);
  });

  test('Échap (l’événement close du dialogue) ferme par le même chemin', async () => {
    const { host, closed } = await monter();
    dialogOf(host)?.dispatchEvent(new Event('close'));
    expect(closed).toEqual(['closed']);
  });
});

describe('l’adresse se valide SANS quitter la modal', () => {
  test('« Recevoir le code » envoie le code, puis le code saisi passe le compte à done', async () => {
    const { host, calls, changes } = await monter({ ...INVITE, missing: ['email'] });

    await mounter.click(buttonNamed(host, 'Recevoir le code'));
    expect(calls).toEqual(['resend:amina@example.test']);
    expect(host.textContent).toContain('amina@example.test');

    mounter.type(host, '#verify-email-code', '123456');
    await mounter.submit(host);

    expect(calls).toEqual(['resend:amina@example.test', 'verify:123456']);
    expect(changes.at(-1)).toEqual({ phase: 'done', deadline: null, missing: [] });
    expect(host.querySelector('[data-activation-complete]')).not.toBeNull();
  });

  test('l’adresse prouvée, le numéro reste offert', async () => {
    const { host, changes } = await monter();
    await mounter.click(buttonNamed(host, 'Recevoir le code'));
    mounter.type(host, '#verify-email-code', '123456');
    await mounter.submit(host);

    expect(changes.at(-1)).toEqual({ phase: 'done', deadline: null, missing: ['phone'] });
    expect(buttonNamed(host, 'Ajouter mon numéro')).not.toBeNull();
    expect(host.textContent).toContain('Adresse vérifiée');
  });

  test('un envoi refusé se dit, et le bouton reste', async () => {
    const { host } = await monter({ ...INVITE, missing: ['email'] }, { resendVerification: async () => ({ ok: false, status: 500, error: 'down' }) });
    await mounter.click(buttonNamed(host, 'Recevoir le code'));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Le code n’a pas pu être envoyé. Réessayez.');
    expect(buttonNamed(host, 'Recevoir le code')).not.toBeNull();
  });
});

describe('le numéro, par le parcours existant', () => {
  test('« Ajouter mon numéro » ⇒ numéro ⇒ code SMS ⇒ vérifié', async () => {
    const { host, calls, changes } = await monter({ ...INVITE, missing: ['phone'] });

    await mounter.click(buttonNamed(host, 'Ajouter mon numéro'));
    mounter.type(host, '#activation-phone', '+33 6 12 34 56 78');
    await mounter.click(buttonNamed(host, 'Envoyer le code'));
    expect(calls).toEqual(['phone:+33 6 12 34 56 78']);

    mounter.type(host, '#activation-phone-code', '654321');
    await mounter.click(buttonNamed(host, 'Valider'));

    expect(calls).toEqual(['phone:+33 6 12 34 56 78', 'phone-code:654321']);
    expect(changes.at(-1)?.missing).toEqual([]);
    expect(host.querySelector('[data-activation-complete]')).not.toBeNull();
  });

  test('un numéro refusé se dit sous le champ', async () => {
    const { host } = await monter({ ...INVITE, missing: ['phone'] }, { requestPhoneCode: async () => ({ ok: false, status: 0, error: 'x', code: 'INVALID_PHONE' }) });
    await mounter.click(buttonNamed(host, 'Ajouter mon numéro'));
    mounter.type(host, '#activation-phone', '0612');
    await mounter.click(buttonNamed(host, 'Envoyer le code'));
    expect(host.querySelector('#activation-phone')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.textContent).toContain('format international');
  });

  test('un code SMS refusé se dit', async () => {
    const { host } = await monter({ ...INVITE, missing: ['phone'] }, { verifyPhoneCode: async () => ({ ok: false, status: 400, error: 'Invalid code' }) });
    await mounter.click(buttonNamed(host, 'Ajouter mon numéro'));
    mounter.type(host, '#activation-phone', '+33612345678');
    await mounter.click(buttonNamed(host, 'Envoyer le code'));
    mounter.type(host, '#activation-phone-code', '000000');
    await mounter.click(buttonNamed(host, 'Valider'));
    expect(host.textContent).toContain('Code invalide ou expiré');
  });
});
