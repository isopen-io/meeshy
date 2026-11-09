import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { loadOnboardingCatalog } from '@/lib/i18n-onboarding-catalog';
import { loadOnboardingProfileCatalog } from '@/lib/i18n-onboarding-profile-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProfileCard, type ProfileImageUpload } from './onboarding-profile';
import type { ProfileImageKind } from '@/lib/api/profile';

/**
 * « MONTRE-TOI » (#17237) — la carte facultative de l'accueil qui conseille
 * une photo et une bannière : l'image choisie s'affiche AUSSITÔT, l'échec
 * revient à l'état d'avant avec « Réessayer », et le bouton principal dit
 * « Plus tard » tant que rien n'est posé.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/onboarding' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadOnboardingCatalog('fr'), loadOnboardingProfileCatalog('fr')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

type Call = { readonly kind: ProfileImageKind; readonly file: Blob; readonly resolve: (outcome: ProfileImageUpload) => void };

function bench() {
  const calls: Call[] = [];
  const outcomes: ('done' | 'skipped')[] = [];
  const upload = (kind: ProfileImageKind, file: Blob) =>
    new Promise<ProfileImageUpload>((resolve) => {
      calls.push({ kind, file, resolve });
    });
  const element = (
    <ProfileCard
      host={{ lang: 'fr', online: true, points: 0 }}
      userId="u-maya"
      name="Maya"
      handle="maya"
      avatar={null}
      banner={null}
      upload={upload}
      preview={async () => 'blob:local'}
      onDone={() => outcomes.push('done')}
      onLater={() => outcomes.push('skipped')}
    />
  );
  return { calls, outcomes, element };
}

const action = (host: ParentNode, id: string) => host.querySelector<HTMLButtonElement>(`[data-onb-action="${id}"]`);
const picker = (host: ParentNode, kind: ProfileImageKind) => host.querySelector<HTMLButtonElement>(`[data-onb-profile-pick="${kind}"]`);
const shown = (host: ParentNode, kind: ProfileImageKind) =>
  host.querySelector<HTMLImageElement>(`[data-onb-profile-pick="${kind}"] img`)?.getAttribute('src') ?? null;

async function choose(host: ParentNode, kind: ProfileImageKind) {
  const input = host.querySelector<HTMLInputElement>(`[data-onb-profile-input="${kind}"]`);
  if (input === null) throw new Error(`champ ${kind} absent`);
  const file = new File(['x'], `${kind}.jpg`, { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
  return file;
}

describe('« Montre-toi » — le conseil et l’aperçu', () => {
  test('la carte conseille, montre les deux bénéfices et nomme ses cibles pour le lecteur d’écran', async () => {
    const { element } = bench();
    const host = await mount(element);
    expect(host.querySelector('[data-onb-card]')?.getAttribute('data-onb-card')).toBe('profile');
    expect(host.textContent).toContain('Montre-toi');
    expect(host.textContent).toContain('Plus de visibilité');
    expect(host.textContent).toContain('Plus de contacts');
    expect(host.textContent).toContain('@maya');
    expect(picker(host, 'banner')?.getAttribute('aria-label')).toBe('Choisir une bannière');
    expect(picker(host, 'avatar')?.getAttribute('aria-label')).toBe('Choisir une photo de profil');
  });

  test('rien de posé : le bouton principal dit « Plus tard » et vaut « passée », sans second « Plus tard »', async () => {
    const { element, outcomes } = bench();
    const host = await mount(element);
    expect(action(host, 'profile.continue')?.textContent).toBe('Plus tard');
    expect(action(host, 'profile.later')).toBeNull();
    await click(action(host, 'profile.continue'));
    expect(outcomes).toEqual(['skipped']);
  });
});

describe('« Montre-toi » — le téléversement optimiste', () => {
  test('la bannière choisie s’affiche AUSSITÔT, puis l’image servie ; « Continuer » vaut « faite »', async () => {
    const { element, calls, outcomes } = bench();
    const host = await mount(element);
    const file = await choose(host, 'banner');
    expect(calls.map((call) => ({ kind: call.kind, file: call.file }))).toEqual([{ kind: 'banner', file }]);
    expect(shown(host, 'banner')).toBe('blob:local');
    expect(host.querySelector('[data-onb-profile-pending="banner"]')).not.toBeNull();
    expect(action(host, 'profile.continue')?.textContent).toBe('Continuer');
    await act(async () => calls[0]?.resolve({ status: 'saved', url: 'https://cdn/banner.jpg' }));
    await settle();
    expect(shown(host, 'banner')).toBe('https://cdn/banner.jpg');
    expect(host.querySelector('[data-onb-profile-pending]')).toBeNull();
    await click(action(host, 'profile.continue'));
    expect(outcomes).toEqual(['done']);
  });

  test('une fois une image posée, « Plus tard » reste offert et vaut « passée »', async () => {
    const { element, calls, outcomes } = bench();
    const host = await mount(element);
    await choose(host, 'avatar');
    await act(async () => calls[0]?.resolve({ status: 'saved', url: 'https://cdn/a.jpg' }));
    await settle();
    expect(shown(host, 'avatar')).toBe('https://cdn/a.jpg');
    await click(action(host, 'profile.later'));
    expect(outcomes).toEqual(['skipped']);
  });

  test('l’échec rend l’état d’avant, le dit, et « Réessayer » renvoie le MÊME fichier', async () => {
    const { element, calls } = bench();
    const host = await mount(element);
    const file = await choose(host, 'avatar');
    expect(shown(host, 'avatar')).toBe('blob:local');
    await act(async () => calls[0]?.resolve({ status: 'failed' }));
    await settle();
    expect(shown(host, 'avatar')).toBeNull();
    expect(action(host, 'profile.continue')?.textContent).toBe('Plus tard');
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Ton image n’a pas été enregistrée.');
    await click(action(host, 'profile.retry'));
    expect(calls.map((call) => call.file)).toEqual([file, file]);
    expect(shown(host, 'avatar')).toBe('blob:local');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  test('un envoi annulé rend l’état d’avant sans message d’erreur', async () => {
    const { element, calls } = bench();
    const host = await mount(element);
    await choose(host, 'banner');
    await act(async () => calls[0]?.resolve({ status: 'cancelled' }));
    await settle();
    expect(shown(host, 'banner')).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
