import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { sessionStore } from '@/lib/api/session';
import { loadOnboardingCatalog } from '@/lib/i18n-onboarding-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { harness, served, signIn } from '@/test-support/onboarding-harness';

import { OnboardingJourney } from './onboarding';

/**
 * LES DÉFAUTS DE LA RECETTE STAGING DU 2026-09-25 (#7729), MONTÉS :
 * - #7907 — un courriel non vérifié : une carte pour le confirmer, et une
 *   carte Story qui ne promet pas ce que la passerelle refuserait ;
 * - #7908 — les points annoncés et gagnés sont ceux du serveur, élan compris ;
 * - #7909 — le récapitulatif n'invente ni série ni badges ;
 * - #7910 — les demandes « en route » et la carte Amis suivent le serveur.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/onboarding' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadOnboardingCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  sessionStore.getState().clearSession();
});

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
const landed = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 950)));
const card = (host: ParentNode): string | null => host.querySelector('[data-onb-card]')?.getAttribute('data-onb-card') ?? null;
const action = (host: ParentNode, id: string) => host.querySelector<HTMLElement>(`[data-onb-action="${id}"]`);
const text = (host: ParentNode, selector: string) => host.querySelector(selector)?.textContent ?? null;
const at = (step: string) => new URLSearchParams(`step=${step}`);

describe('#7907 — la carte du courriel, proposée au seul courriel non vérifié', () => {
  test('après les langues vient « Confirme ton adresse e-mail », comptée dans les étapes', async () => {
    signIn();
    const { deps } = harness({ state: served({ emailVerified: false, canPublishStory: true }) });
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe('Étape 1 sur 5');
    await click(action(host, 'languages.confirm'));
    expect(card(host)).toBe('email');
    expect(text(host, '[data-onb-card="email"] h1')).toBe('Confirme ton adresse e-mail');
  });

  test('« Renvoyer le lien » renvoie le lien au compte, et le dit', async () => {
    signIn();
    const { deps, resent } = harness({ state: served({ emailVerified: false }) });
    const host = await mount(<OnboardingJourney deps={deps} search={at('email')} clearSearch={() => undefined} />);
    await click(action(host, 'email.resend'));
    expect(resent()).toBe(1);
    expect(text(host, '[data-onb-resend-status]')).toBe('Lien envoyé. Ouvre-le, puis reviens ici.');
  });

  test('« Plus tard » passe l’étape et mène au salut', async () => {
    signIn();
    const { deps, patches } = harness({ state: served({ emailVerified: false }) });
    const host = await mount(<OnboardingJourney deps={deps} search={at('email')} clearSearch={() => undefined} />);
    await click(action(host, 'email.later'));
    expect(patches).toEqual([{ step: 'email', outcome: 'skipped' }]);
    expect(card(host)).toBe('global');
  });

  test('le lien cliqué ailleurs : au retour sur l’onglet, la relecture valide l’étape et la carte cède au salut', async () => {
    signIn();
    const { deps, serve } = harness({ state: served({ emailVerified: false, seenSteps: ['languages'] }) });
    const host = await mount(<OnboardingJourney deps={deps} search={at('email')} clearSearch={() => undefined} />);
    await settle();
    expect(card(host)).toBe('email');
    serve(served({ emailVerified: true, seenSteps: ['languages'], prefilledSteps: ['email'] }));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(card(host)).toBe('global');
  });

  test('un courriel vérifié ne voit jamais la carte', async () => {
    signIn();
    const { deps } = harness({ state: served({ emailVerified: true, prefilledSteps: ['email'] }) });
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe('Étape 1 sur 4');
    await click(action(host, 'languages.confirm'));
    expect(card(host)).toBe('global');
  });
});

describe('#7907 — la carte Story ne promet pas ce que la passerelle refuserait', () => {
  test('non vérifié, première story encore permise : la carte Story publie normalement', async () => {
    signIn();
    const { deps } = harness({ state: served({ emailVerified: false, canPublishStory: true }) });
    const host = await mount(<OnboardingJourney deps={deps} search={at('story')} clearSearch={() => undefined} />);
    expect(action(host, 'story.create')).not.toBeNull();
    expect(host.querySelector('[data-onb-story-verify]')).toBeNull();
  });

  test('exception consommée : « confirme ton adresse », renvoi du lien, et aucun « Créer ma story »', async () => {
    signIn();
    const { deps, resent } = harness({ state: served({ emailVerified: false, canPublishStory: false }) });
    const host = await mount(<OnboardingJourney deps={deps} search={at('story')} clearSearch={() => undefined} />);
    expect(action(host, 'story.create')).toBeNull();
    expect(text(host, '[data-onb-story-verify]')).toBe('Pour publier ta story, confirme d’abord ton adresse e-mail.');
    expect(text(host, '[data-onb-card="story"] .onb-reward-hint')).toBeNull();
    await click(action(host, 'email.resend'));
    expect(resent()).toBe(1);
  });

  test('l’adresse vérifiée entre-temps : à la relecture, la carte redevient la carte Story', async () => {
    signIn();
    const { deps, serve } = harness({ state: served({ emailVerified: false, canPublishStory: false }) });
    const host = await mount(<OnboardingJourney deps={deps} search={at('story')} clearSearch={() => undefined} />);
    await settle();
    serve(served({ emailVerified: true, canPublishStory: true, prefilledSteps: ['email'] }));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(action(host, 'story.create')).not.toBeNull();
  });
});

describe('#7908 — les points sont ceux du serveur, élan compris', () => {
  test('l’annonce avant le geste est la valeur servie à l’élan courant', async () => {
    signIn();
    const { deps } = harness({ state: served({ stepRewards: { global: 28, story: 20, friendship: 14 } }) });
    const global = await mount(<OnboardingJourney deps={deps} search={at('global')} clearSearch={() => undefined} />);
    expect(text(global, '[data-onb-card="global"] .onb-reward-hint')).toBe('+28 pts à l’envoi');
  });

  test('élan à 2 : le salut crédite 28 — le « +N » dit 28, la pastille aussi, jamais le barème', async () => {
    signIn();
    const { deps } = harness({ serverScore: 40, greetingCredit: 28, state: served({ stepRewards: { global: 28, story: 20, friendship: 14 } }) });
    const host = await mount(<OnboardingJourney deps={deps} search={at('global')} clearSearch={() => undefined} />);
    await settle();
    await click(action(host, 'global.send'));
    await settle();
    expect(text(host, '[data-onb-flight]')).toBe('+28');
    expect(text(host, '[data-onb-announce]')).toBe('Tu gagnes 28 points.');
    await landed();
    expect(text(host, '[data-onb-pill]')).toBe('28');
  });

  test('au retour du studio, la story crédite ce que le serveur a crédité depuis le départ', async () => {
    signIn();
    const { deps } = harness({ publishedStory: 'story-1', mark: { baseline: 40, last: 68 }, serverScore: 89 });
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams('story=story-1')} clearSearch={() => undefined} />);
    await settle();
    expect(text(host, '[data-onb-flight]')).toBe('+21');
    await landed();
    expect(text(host, '[data-onb-pill]')).toBe('49');
  });

  test('le score n’a pas pu être relu : aucun « +N » inventé', async () => {
    signIn();
    const { deps } = harness({ scoreUnavailable: true });
    const host = await mount(<OnboardingJourney deps={deps} search={at('global')} clearSearch={() => undefined} />);
    await click(action(host, 'global.send'));
    await settle();
    expect(host.querySelector('[data-onb-sent]')).not.toBeNull();
    expect(host.querySelector('[data-onb-flight]')).toBeNull();
    expect(text(host, '[data-onb-pill]')).toBe('0');
  });

  test('la carte Amis annonce un plancher, jamais un « +7 » promis', async () => {
    signIn();
    const { deps } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={at('friends')} clearSearch={() => undefined} />);
    expect(text(host, '[data-onb-card="friends"] .onb-reward-hint')).toBe('Au moins +7 chacun quand elle accepte');
  });
});

describe('#7909 — le récapitulatif ne montre que les chiffres du serveur', () => {
  test('tant que le serveur n’a pas répondu : un emplacement stable, aucun chiffre', async () => {
    signIn();
    const { deps } = harness({ recap: 'hold', confirmed: ['global', 'story'], askable: false });
    const host = await mount(<OnboardingJourney deps={deps} search={at('friends')} clearSearch={() => undefined} />);
    await click(action(host, 'friends.later'));
    expect(card(host)).toBe('recap');
    expect(host.querySelector('[data-onb-recap-loading]')).not.toBeNull();
    expect(host.querySelector('[data-tile="streak"]')).toBeNull();
    expect(host.querySelector('[data-tile="badges"]')).toBeNull();
  });

  test('le serveur a échoué : les points de la session SEULS — ni série, ni niveau, ni badges', async () => {
    signIn();
    const { deps } = harness({ recap: null, confirmed: ['global', 'story'], mark: { baseline: 0, last: 24 }, serverScore: 24, askable: false });
    const host = await mount(<OnboardingJourney deps={deps} search={at('friends')} clearSearch={() => undefined} />);
    await click(action(host, 'friends.later'));
    await settle();
    expect(host.querySelector('[data-onb-recap-loading]')).toBeNull();
    expect([...host.querySelectorAll('[data-tile]')].map((tile) => tile.getAttribute('data-tile'))).toEqual(['points']);
    expect(text(host, '[data-tile="points"]')).toBe('24 pts');
  });

  test('le serveur a répondu : ses chiffres, tels quels', async () => {
    signIn();
    const { deps } = harness({ recap: { points: 35, level: 1, streakDays: 1, badges: 3 } });
    const host = await mount(<OnboardingJourney deps={deps} search={at('friends')} clearSearch={() => undefined} />);
    await click(action(host, 'friends.later'));
    await settle();
    expect(text(host, '[data-tile="points"]')).toBe('35 pts');
    expect(text(host, '[data-tile="badges"]')).toBe('Badges : 3');
  });
});

describe('#7910 — les demandes d’ami suivent le serveur', () => {
  test('une demande acceptée ailleurs n’est plus « en route » au récapitulatif', async () => {
    signIn();
    const { deps } = harness({ recap: { points: 21, level: 1, streakDays: 0, badges: 0 }, state: served({ pendingFriendRequests: 0 }) });
    const host = await mount(<OnboardingJourney deps={deps} search={at('friends')} clearSearch={() => undefined} />);
    await click(host.querySelector<HTMLElement>('[data-onb-person="u-aicha"] [data-onb-action="friends.add"]'));
    await click(action(host, 'friends.continue'));
    await click(action(host, 'notifications.no'));
    await settle();
    expect(card(host)).toBe('recap');
    expect(host.querySelector('[data-tile="friends"]')).toBeNull();
  });

  test('une demande toujours en attente côté serveur reste « en route »', async () => {
    signIn();
    const { deps } = harness({ recap: { points: 0, level: 0, streakDays: 0, badges: 0 }, state: served({ pendingFriendRequests: 1 }) });
    const host = await mount(<OnboardingJourney deps={deps} search={at('friends')} clearSearch={() => undefined} />);
    await click(action(host, 'friends.later'));
    await settle();
    expect(text(host, '[data-tile="friends"]')).toBe('Demandes en route : 1');
  });

  test('la carte Amis reprise depuis le cache cède dès que le serveur dit l’amitié acceptée', async () => {
    signIn();
    const cached = served({ seenSteps: ['languages', 'global', 'story'] });
    const { deps, onboardingReads } = harness({
      state: served({ seenSteps: ['languages', 'global', 'story'], prefilledSteps: ['friends'] }),
      askable: false,
      recap: null,
    });
    deps.queryClient.setQueryData(['me', 'onboarding'], cached);
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    await settle();
    expect(onboardingReads()).toBeGreaterThan(0);
    expect(card(host)).toBe('recap');
  });
});
