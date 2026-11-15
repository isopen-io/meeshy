import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MagicLinkPanel, type MagicLinkPanelDeps } from './magic-link-panel';

/**
 * LE PANNEAU DU LIEN MAGIQUE CHANGE D'ÉTAPE EN FONDU (#18322) — comme
 * `withAnimation(MeeshyAnimation.springDefault)` de `MagicLinkView.swift` :
 * « Recevoir un lien » fait entrer l'écran « e-mail envoyé » en fondu, et
 * Annuler fait revenir la saisie de même. La première peinture, elle, n'est
 * pas un changement d'étape : elle ne joue rien. Un refus entre en glissant
 * depuis le haut.
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

const depsAnswering = (reply: ApiResult<{ expiresInSeconds: number }>): MagicLinkPanelDeps => ({
  request: (async () => reply) as MagicLinkPanelDeps['request'],
  clock: { subscribe: () => () => undefined },
  now: () => 1000,
});

const form = (host: ParentNode) => host.querySelector('form') as HTMLFormElement;

describe('MagicLinkPanel — le passage d’une étape à l’autre est animé', () => {
  test('à l’ouverture, la saisie paraît sans mouvement', async () => {
    const host = await mounter.mount(<MagicLinkPanel deps={depsAnswering({ ok: true, status: 200, data: { expiresInSeconds: 600 } })} />);
    expect(form(host).hasAttribute('data-layer-motion')).toBe(false);
  });

  test('« Recevoir un lien » fait entrer « e-mail envoyé » en fondu, Annuler fait revenir la saisie de même', async () => {
    const host = await mounter.mount(<MagicLinkPanel deps={depsAnswering({ ok: true, status: 200, data: { expiresInSeconds: 600 } })} />);
    mounter.type(host, '#magic-link-email', 'reader@example.com');
    await mounter.submit(host);
    await mounter.settle();

    const sent = [...host.querySelectorAll('h2')].find((title) => title.textContent === translate('fr', 'emailSent.title'));
    expect(sent?.closest('[data-layer-motion]')).not.toBeNull();

    const cancel = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === translate('fr', 'magicLink.cancel'));
    await mounter.click(cancel ?? null);
    expect(form(host).hasAttribute('data-layer-motion')).toBe(true);
  });

  test('un refus entre en glissant depuis le haut', async () => {
    const host = await mounter.mount(<MagicLinkPanel deps={depsAnswering({ ok: false, status: 500, error: 'boom' })} />);
    mounter.type(host, '#magic-link-email', 'reader@example.com');
    await mounter.submit(host);
    await mounter.settle();

    const refusal = host.querySelector('[role="alert"]') as HTMLElement;
    expect(refusal.hasAttribute('data-layer-motion')).toBe(true);
    expect(refusal.style.getPropertyValue('--layer-shift')).toMatch(/^0 -/);
  });
});
