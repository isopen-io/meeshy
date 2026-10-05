import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PhoneAddPrompt } from './phone-add-prompt';
import type { PhoneCodeDeps } from './phone-code-form';

/**
 * **« AJOUTEZ VOTRE NUMÉRO », LÀ OÙ IL SERT** (#8843) — demande porteur
 * 2026-09-30 : quand on cherche des gens et que le profil n'a pas de numéro,
 * on dit À QUOI il sert, on permet de l'ajouter par le parcours SMS EXISTANT
 * (`phone-code-form.tsx`, extrait du dialogue d'activation), et « Plus tard »
 * laisse continuer — jamais bloquant.
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

function recorder() {
  const calls: string[] = [];
  const deps: PhoneCodeDeps = {
    requestPhoneCode: async (phone) => {
      calls.push(`phone:${phone}`);
      return { ok: true, data: {} };
    },
    verifyPhoneCode: async (code) => {
      calls.push(`code:${code}`);
      return { ok: true, data: {} };
    },
  };
  return { calls, deps };
}

describe('la proposition d’ajouter son numéro (#8843)', () => {
  test('elle dit à quoi sert le numéro, avant de le demander', async () => {
    const { deps } = recorder();
    const host = await mounter.mount(<PhoneAddPrompt language="fr" deps={deps} onDismiss={() => undefined} onVerified={() => undefined} />);
    const prompt = host.querySelector('[data-phone-add-prompt]');
    expect(prompt?.textContent).toContain('Ajoutez votre numéro');
    expect(prompt?.textContent).toContain('vous retrouveront');
    expect(buttonNamed(host, 'Ajouter mon numéro')).not.toBeNull();
  });

  test('« Ajouter mon numéro » ⇒ numéro ⇒ code SMS ⇒ vérifié, par le parcours existant', async () => {
    const { calls, deps } = recorder();
    const verified: string[] = [];
    const host = await mounter.mount(<PhoneAddPrompt language="fr" deps={deps} onDismiss={() => undefined} onVerified={() => verified.push('ok')} />);
    await mounter.click(buttonNamed(host, 'Ajouter mon numéro'));
    mounter.type(host, '#activation-phone', '+33 6 12 34 56 78');
    await mounter.click(buttonNamed(host, 'Envoyer le code'));
    mounter.type(host, '#activation-phone-code', '654321');
    await mounter.click(buttonNamed(host, 'Valider'));
    expect(calls).toEqual(['phone:+33 6 12 34 56 78', 'code:654321']);
    expect(verified).toEqual(['ok']);
  });

  test('« Plus tard » la ferme sans rien envoyer — jamais bloquant', async () => {
    const { calls, deps } = recorder();
    const dismissed: string[] = [];
    const host = await mounter.mount(<PhoneAddPrompt language="fr" deps={deps} onDismiss={() => dismissed.push('later')} onVerified={() => undefined} />);
    await mounter.click(buttonNamed(host, 'Plus tard'));
    expect(dismissed).toEqual(['later']);
    expect(calls).toEqual([]);
  });
});
