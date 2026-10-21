import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MagicLinkFlow } from './magic-link-flow';
import { MagicLinkPanel, type MagicLinkPanelDeps } from './magic-link-panel';
import { MagicLinkValidation } from './magic-link-validation';

/**
 * LE FLUX DE CONNEXION PAR LIEN MAGIQUE PARLE LA LANGUE DU LECTEUR (iter-74w).
 * La validation du lien (`magic-link-validation.tsx`), le panneau d'attente
 * (`magic-link-panel.tsx`) et le chrome de l'écran plein (`magic-link-flow.tsx`)
 * écrivaient leurs textes EN DUR EN FRANÇAIS, quelle que soit l'interface — sur
 * un chemin de PREMIÈRE connexion, qu'un lecteur non francophone atteint avant
 * tout autre écran. Le témoin monte chaque surface avec l'interface en anglais
 * et prouve que le texte servi est celui du catalogue, jamais le littéral
 * français.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  document.documentElement.lang = 'en';
  await loadInterfaceCatalog('en');
});

afterAll(async () => {
  document.documentElement.lang = 'fr';
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const pending = <T,>(): Promise<T> => new Promise<T>(() => undefined);

describe('MagicLinkValidation — l’anglais, jamais le français en dur', () => {
  test('lien absent ⇒ l’état « invalide » sert le catalogue anglais', async () => {
    const host = await mounter.mount(<MagicLinkValidation token={null} returnUrl={null} go={() => undefined} />);
    expect(host.textContent).toContain(translate('en', 'magicLink.invalid.title'));
    expect(host.textContent).toContain(translate('en', 'magicLink.invalid.body'));
    expect(host.textContent).toContain(translate('en', 'magicLink.requestNew'));
    expect(host.textContent).toContain(translate('en', 'magicLink.backToLogin'));
    expect(host.textContent).not.toContain('Lien invalide ou expiré');
    expect(host.textContent).not.toContain('Demander un nouveau lien');
  });

  test('validation en cours ⇒ le libellé anglais, pas « Vérification du lien… »', async () => {
    const host = await mounter.mount(
      <MagicLinkValidation token="tok" returnUrl={null} validate={pending} go={() => undefined} />,
    );
    expect(host.textContent).toContain(translate('en', 'magicLink.validating'));
    expect(host.textContent).not.toContain('Vérification du lien');
  });

  test('réseau coupé ⇒ le bouton « Réessayer » est en anglais', async () => {
    const offline = async (): Promise<ApiResult<never>> => ({ ok: false, status: 0, error: 'offline' });
    const host = await mounter.mount(
      <MagicLinkValidation token="tok" returnUrl={null} validate={offline} go={() => undefined} />,
    );
    await mounter.settle();
    const retry = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === translate('en', 'magicLink.retry'));
    expect(retry).not.toBeNull();
    expect(host.textContent).not.toContain('Réessayer');
  });
});

describe('MagicLinkPanel — l’attente parle anglais', () => {
  test('lien expiré ⇒ bannière, renvoi et annulation du catalogue anglais', async () => {
    const deps: MagicLinkPanelDeps = {
      request: (async () => ({ ok: true, status: 200, data: { expiresInSeconds: 0 } })) as MagicLinkPanelDeps['request'],
      clock: { subscribe: () => () => undefined },
      now: () => 1000,
    };
    const host = await mounter.mount(<MagicLinkPanel deps={deps} />);
    mounter.type(host, '#magic-link-email', 'reader@example.com');
    await mounter.submit(host);
    await mounter.settle();

    expect(host.textContent).toContain(translate('en', 'magicLink.linkExpired'));
    expect(host.textContent).toContain(translate('en', 'magicLink.resend'));
    expect(host.textContent).toContain(translate('en', 'magicLink.cancel'));
    const resend = host.querySelector(`[aria-label="${translate('en', 'magicLink.resend.label')}"]`);
    expect(resend).not.toBeNull();
    expect(host.textContent).not.toContain('Lien expiré, renvoyez-en un nouveau');
    expect(host.textContent).not.toContain('Annuler');
  });
});

describe('MagicLinkFlow — le titre de l’écran plein parle anglais', () => {
  test('en-tête traduit, pas « Connexion par e-mail » en dur', async () => {
    const host = await mounter.mount(<MagicLinkFlow />);
    expect(host.textContent).toContain(translate('en', 'magicLink.flowTitle'));
    expect(host.textContent).not.toContain('Connexion par e-mail');
  });
});
