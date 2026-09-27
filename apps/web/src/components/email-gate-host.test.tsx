import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Activation, MyActivation } from '@/lib/api/activation';
import type { ApiResult } from '@/lib/api/http';
import type { VerifyEmailData, VerifyEmailRequest } from '@/lib/api/verify-email';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { ActivationInviteDeps } from './activation-invite-dialog';
import { EmailGateHost } from './email-gate-host';

/**
 * **PUBLIER SANS ADRESSE PROUVÉE MÈNE À SA VALIDATION** (#8365) — la vue
 * s'ouvre avec la phrase qui dit POURQUOI, le code déjà envoyé, et le code
 * validé tranche la demande : l'action retenue repart. Fermer la vue la
 * tranche aussi, dans l'autre sens. C'est la modal de #8239, jamais une
 * seconde machine.
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

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const UNPROVEN: Activation = { phase: 'quiet', deadline: null, missing: ['email', 'phone'] };

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
    requestPhoneCode: async () => ({ ok: true, data: {} }),
    verifyPhoneCode: async () => ({ ok: true, data: {} }),
    ...over,
  };
  return { deps, calls };
}

async function monter({
  reason = 'publish',
  served = { ok: true, data: { activation: UNPROVEN, email: 'amina@example.test' } },
  over = {},
}: {
  readonly reason?: 'publish' | 'invite' | 'link';
  readonly served?: ApiResult<MyActivation>;
  readonly over?: Partial<ActivationInviteDeps>;
} = {}) {
  const { deps, calls } = recorder(over);
  const settled: boolean[] = [];
  const host = await mounter.mount(
    <EmailGateHost
      reason={reason}
      load={async () => served}
      dialogDeps={deps}
      language="fr"
      now={() => NOW}
      onSettle={(verified) => settled.push(verified)}
    />,
  );
  await mounter.settle();
  return { host, calls, settled };
}

const dialogOf = (host: ParentNode) => host.querySelector<HTMLDialogElement>('dialog[data-activation-invite]');
const describedText = (host: ParentNode) =>
  host.querySelector(`[id="${dialogOf(host)?.getAttribute('aria-describedby') ?? ''}"]`)?.textContent ?? '';

describe('la vue s’ouvre, dit pourquoi, et le code est déjà parti', () => {
  test('publier ⇒ « Pour publier, validez votre adresse », code envoyé sans geste', async () => {
    const { host, calls } = await monter();

    expect(dialogOf(host)).not.toBeNull();
    expect(describedText(host)).toContain('Pour publier, validez votre adresse');
    expect(calls).toEqual(['resend:amina@example.test']);
    expect(host.querySelector('#verify-email-code')).not.toBeNull();
  });

  test('inviter par e-mail et créer un lien disent leur propre raison', async () => {
    expect(describedText((await monter({ reason: 'invite' })).host)).toContain('Pour inviter par e-mail');
    mounter.unmountAll();
    expect(describedText((await monter({ reason: 'link' })).host)).toContain('Pour créer un lien');
  });

  test('seule l’adresse est demandée : le numéro n’encombre pas la vue', async () => {
    const { host } = await monter();
    expect(buttonNamed(host, 'Ajouter mon numéro')).toBeNull();
  });
});

describe('la vue tranche la demande', () => {
  test('code validé ⇒ `true` : l’action retenue repart', async () => {
    const { host, calls, settled } = await monter();

    mounter.type(host, '#verify-email-code', '123456');
    await mounter.submit(host);

    expect(calls).toEqual(['resend:amina@example.test', 'verify:123456']);
    expect(settled).toEqual([true]);
  });

  test('« Plus tard » ⇒ `false`, rien n’est rejoué', async () => {
    const { host, settled } = await monter();
    await mounter.click(buttonNamed(host, 'Plus tard'));
    expect(settled).toEqual([false]);
  });

  test('adresse déjà prouvée entre-temps ⇒ `true` sans vue ni code', async () => {
    const { host, calls, settled } = await monter({
      served: { ok: true, data: { activation: { phase: 'done', deadline: null, missing: ['phone'] }, email: 'amina@example.test' } },
    });
    expect(dialogOf(host)).toBeNull();
    expect(calls).toEqual([]);
    expect(settled).toEqual([true]);
  });

  test('état illisible ⇒ `false` : le refus d’origine se dit', async () => {
    const { host, settled } = await monter({ served: { ok: false, status: 0, error: 'offline' } });
    expect(dialogOf(host)).toBeNull();
    expect(settled).toEqual([false]);
  });

  test('envoi du code refusé ⇒ la vue le dit et offre de réessayer', async () => {
    const { host } = await monter({ over: { resendVerification: async () => ({ ok: false, status: 500, error: 'down' }) } });
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Le code n’a pas pu être envoyé. Réessayez.');
    expect(buttonNamed(host, 'Recevoir le code')).not.toBeNull();
  });
});
