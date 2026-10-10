import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { ageBlockedNotice } from '@/components/age-blocked';
import { sessionStore } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadOnboardingCatalog } from '@/lib/i18n-onboarding-catalog';
import { createActMounter, typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { harness, served, signIn } from '@/test-support/onboarding-harness';

import { OnboardingJourney } from './onboarding';

/**
 * LA CARTE DE L'ÂGE (#9928), MONTÉE — une passerelle qui sait les âges la
 * propose après les langues ; « Passer » enregistre l'étape passée ; la date
 * part une fois, et la réponse décide : Global proposée ou non, l'étape faite
 * même si la date était déjà posée, l'écran des moins de 13 ans puis la
 * déconnexion.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/onboarding' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadOnboardingCatalog('fr'), loadInterfaceCatalog('fr')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  sessionStore.getState().clearSession();
});

const card = (host: ParentNode): string | null => host.querySelector('[data-onb-card]')?.getAttribute('data-onb-card') ?? null;
const action = (host: ParentNode, id: string) => host.querySelector<HTMLButtonElement>(`[data-onb-action="${id}"]`);
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const knowsAges = served({ seenSteps: ['languages'], viewerWriteRestriction: null });

const open = async (options: Parameters<typeof harness>[0]) => {
  signIn();
  const bench = harness(options);
  const host = await mount(<OnboardingJourney deps={bench.deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
  return { host, ...bench };
};

describe('la carte de l’âge — proposée, accessible, facultative', () => {
  test('une passerelle qui sait les âges la propose, avec sa raison et un champ de date nommé', async () => {
    const { host } = await open({ state: knowsAges });
    expect(card(host)).toBe('age');
    expect(host.textContent).toContain('Pour te proposer les bons espaces. Tu peux passer.');
    const input = host.querySelector<HTMLInputElement>('[data-onb-age-input]');
    expect(input?.type).toBe('date');
    expect(host.querySelector(`label[for="${input?.id}"]`)?.textContent).toBe('Date de naissance');
    expect(action(host, 'age.confirm')?.disabled).toBe(true);
  });

  test('une passerelle antérieure ne la propose pas : le salut suit les langues', async () => {
    const { host } = await open({ state: served({ seenSteps: ['languages'] }) });
    expect(card(host)).toBe('global');
  });

  test('« Passer » enregistre l’étape passée, sans rien envoyer d’autre', async () => {
    const { host, patches, declared } = await open({ state: knowsAges });
    await click(action(host, 'age.skip'));
    expect(patches).toEqual([{ step: 'age', outcome: 'skipped' }]);
    expect(declared).toEqual([]);
    expect(card(host)).toBe('global');
  });

  test('une date à venir est signalée sous le champ, et rien ne part', async () => {
    const { host, declared } = await open({ state: knowsAges });
    typeInto(host.querySelector<HTMLInputElement>('[data-onb-age-input]'), '2999-01-01');
    await click(action(host, 'age.confirm'));
    expect(host.querySelector('[data-onb-age-error]')?.getAttribute('data-onb-age-error')).toBe('future');
    expect(host.querySelector('[data-onb-age-input]')?.getAttribute('aria-invalid')).toBe('true');
    expect(declared).toEqual([]);
  });
});

describe('la date part, la passerelle tranche', () => {
  test('un majeur : l’étape est faite, Meeshy Global suit', async () => {
    const { host, patches, declared } = await open({ state: knowsAges });
    typeInto(host.querySelector<HTMLInputElement>('[data-onb-age-input]'), '1990-05-04');
    await click(action(host, 'age.confirm'));
    await settle();
    expect(declared).toEqual([{ birthDate: '1990-05-04' }]);
    expect(patches).toEqual([{ step: 'age', outcome: 'done' }]);
    expect(card(host)).toBe('global');
  });

  test('un mineur : Meeshy Global n’est pas proposée, la story suit', async () => {
    const { host } = await open({
      state: knowsAges,
      birthDate: { ok: true, data: { ageClass: 'minor', viewerWriteRestrictionGlobal: true } },
    });
    typeInto(host.querySelector<HTMLInputElement>('[data-onb-age-input]'), '2011-03-02');
    await click(action(host, 'age.confirm'));
    await settle();
    expect(card(host)).toBe('story');
  });

  test('une date déjà posée (409) : l’étape est considérée faite', async () => {
    const { host, patches } = await open({
      state: knowsAges,
      birthDate: { ok: false, status: 409, error: 'déjà', code: 'BIRTH_DATE_ALREADY_SET' },
    });
    typeInto(host.querySelector<HTMLInputElement>('[data-onb-age-input]'), '1990-05-04');
    await click(action(host, 'age.confirm'));
    await settle();
    expect(patches).toEqual([{ step: 'age', outcome: 'done' }]);
    expect(card(host)).toBe('global');
  });

  test('une panne : la carte reste, dit l’échec, et le geste peut être refait', async () => {
    const { host, patches } = await open({ state: knowsAges, birthDate: { ok: false, status: 503, error: 'indisponible' } });
    typeInto(host.querySelector<HTMLInputElement>('[data-onb-age-input]'), '1990-05-04');
    await click(action(host, 'age.confirm'));
    await settle();
    expect(card(host)).toBe('age');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Ta date n’a pas été enregistrée. Réessaie.');
    expect(action(host, 'age.confirm')?.disabled).toBe(false);
    expect(patches).toEqual([]);
  });

  test('moins de 13 ans (422) : l’écran le dit, sans « Passer tout », et « Compris » déconnecte', async () => {
    const { host, patches, signOuts } = await open({
      state: knowsAges,
      birthDate: { ok: false, status: 422, error: 'trop jeune', code: 'AGE_BELOW_MINIMUM' },
    });
    typeInto(host.querySelector<HTMLInputElement>('[data-onb-age-input]'), '2018-01-01');
    await click(action(host, 'age.confirm'));
    await settle();
    expect(card(host)).toBe('age-refused');
    expect(host.querySelector('h1')?.textContent).toBe('Meeshy est réservé aux 13 ans et plus');
    expect(action(host, 'skipAll')).toBeNull();
    expect(signOuts()).toBe(0);
    expect(ageBlockedNotice.pending()).toBe(true);
    await click(action(host, 'age.refused.confirm'));
    expect(signOuts()).toBe(1);
    expect(ageBlockedNotice.pending()).toBe(false);
    expect(patches).toEqual([]);
  });
});
