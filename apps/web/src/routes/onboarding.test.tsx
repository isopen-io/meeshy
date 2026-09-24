import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { QueryClient } from '@tanstack/react-query';

import type { OnboardingPatchBody, OnboardingState, OnboardingStepId, OnboardingSuggestion } from '@meeshy/shared/types/onboarding';

import type { HttpRequest } from '@/lib/api/http';
import { ONBOARDING_QUERY_KEY } from '@/lib/api/onboarding';
import { sessionStore } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadOnboardingCatalog } from '@/lib/i18n-onboarding-catalog';
import { createJourneyProgressStore } from '@/lib/onboarding/progress-store';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { scriptedTransport } from '@/test-support/scripted-transport';

import type { GreetingSend } from './onboarding-cards';
import { OnboardingJourney, type OnboardingScreenDeps } from './onboarding';

/**
 * L'ACCUEIL POST-INSCRIPTION (#7729), MONTÉ — le parcours tel que le lecteur
 * le vit : la reprise, « Passer tout », le salut qui part VRAIMENT et ne
 * récompense qu'à l'accusé, la story ouverte avec la visibilité servie, les
 * demandes d'ami, la fenêtre de notifications demandée sur « Oui » SEULEMENT.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, type } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/onboarding' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadOnboardingCatalog('fr'), loadOnboardingCatalog('ar'), loadInterfaceCatalog('ar')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  document.documentElement.lang = 'fr';
  sessionStore.getState().clearSession();
});

const SUGGESTION: OnboardingSuggestion = { id: 'u-aicha', username: 'aicha', displayName: 'Aïcha', avatarUrl: null, languages: ['fr', 'ar'] };

const served = (overrides: Partial<OnboardingState> = {}): OnboardingState => ({
  eligible: true,
  completedAt: null,
  seenSteps: [],
  prefilledSteps: [],
  globalConversationId: 'g-global',
  protectedRegime: false,
  storyDefaultVisibility: 'public',
  suggestions: [SUGGESTION],
  ...overrides,
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function harness(
  options: {
    readonly state?: OnboardingState;
    readonly greeting?: GreetingSend;
    readonly askable?: boolean;
    readonly confirmed?: readonly OnboardingStepId[];
    /** Un cache PERSISTÉ vieux d'une heure : l'écran s'ouvre dessus, puis la relecture de `state` arrive quand le témoin la relâche. */
    readonly staleCache?: OnboardingState;
  } = {},
) {
  const state = options.state ?? served();
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const patches: OnboardingPatchBody[] = [];
  const greetings: { conversationId: string; content: string; language: string }[] = [];
  const friends: string[] = [];
  const visits: { path: string; replace: boolean }[] = [];
  const saves: unknown[] = [];
  let asked = 0;

  const { transport } = scriptedTransport({});
  transport.request = (async (request: HttpRequest) => {
    if (request.method === 'PATCH') {
      patches.push(request.body as OnboardingPatchBody);
      return { ok: true, data: state };
    }
    if (options.staleCache !== undefined) await held;
    return { ok: true, data: state };
  }) as typeof transport.request;

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (options.staleCache === undefined) queryClient.setQueryData(ONBOARDING_QUERY_KEY, state);
  else queryClient.setQueryData(ONBOARDING_QUERY_KEY, options.staleCache, { updatedAt: Date.now() - 60 * 60_000 });

  const progress = createJourneyProgressStore({ storage: memoryStorage() });
  progress.write('u-maya', { done: options.confirmed ?? [], friendRequests: [] });

  const deps: OnboardingScreenDeps = {
    api: { source: 'gateway', transport },
    queryClient,
    progress,
    sendGreeting: async (input) => {
      greetings.push({ conversationId: input.conversationId, content: input.content, language: input.language });
      return options.greeting ?? 'sent';
    },
    addFriend: async (suggestion) => {
      friends.push(suggestion.id);
      return 'done';
    },
    saveLanguages: async (patch) => {
      saves.push(patch);
      return 'saved';
    },
    notificationsAskable: () => options.askable ?? true,
    askNotifications: async () => {
      asked += 1;
    },
    loadRecap: async () => null,
    random: () => 0,
    navigate: (path, replace = false) => visits.push({ path, replace }),
  };
  const arrive = () => act(async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { deps, patches, greetings, friends, visits, saves, asked: () => asked, arrive };
}

const signIn = () =>
  sessionStore.getState().establish({
    user: { id: 'u-maya', username: 'maya', displayName: 'Maya', systemLanguage: 'fr' },
    token: 'jwt',
    sessionToken: 's',
    expiresIn: 3600,
  });

/** Le « +N » arrive à la pastille après son vol (850 ms) : on attend qu'il
 * se pose, en temps réel — c'est ce que le lecteur voit. */
const landed = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 950)));

const card = (host: ParentNode): string | null => host.querySelector('[data-onb-card]')?.getAttribute('data-onb-card') ?? null;
const action = (host: ParentNode, id: string) => host.querySelector<HTMLElement>(`[data-onb-action="${id}"]`);

describe('la reprise — la première étape manquante, « Passer tout » dès la carte 1', () => {
  test('un compte neuf commence aux langues, et « Passer tout » est là', async () => {
    signIn();
    const { deps } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    expect(card(host)).toBe('languages');
    expect(action(host, 'skipAll')?.textContent).toBe('Passer tout');
  });

  test('les étapes vues ou pré-cochées sont sautées', async () => {
    signIn();
    const { deps } = harness({ state: served({ seenSteps: ['languages'], prefilledSteps: ['global'] }) });
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    expect(card(host)).toBe('story');
  });

  test('« Passer tout » clôt le parcours et rend l’accueil, sans détour', async () => {
    signIn();
    const { deps, patches, visits } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    await click(action(host, 'skipAll'));
    expect(patches).toEqual([{ finish: true }]);
    expect(visits).toEqual([{ path: '/', replace: true }]);
  });

  test('aucun texte de perte ni de compte à rebours sur aucune carte', async () => {
    signIn();
    const { deps } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    expect(host.textContent ?? '').not.toMatch(/perdre|perdu|expire|dernière chance|plus que/i);
  });
});

describe('le serveur arbitre à CHAQUE relecture, pas seulement sur le cache', () => {
  test('cache périmé éligible, serveur non éligible (plus de sept jours, ou fini sur iOS) : l’écran rend l’accueil', async () => {
    signIn();
    const closed = served({ eligible: false, completedAt: '2026-09-24T09:00:00.000Z' });
    const { deps, visits, arrive } = harness({ staleCache: served(), state: closed });
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    expect(card(host)).toBe('languages');
    expect(visits).toEqual([]);
    await arrive();
    expect(visits).toEqual([{ path: '/', replace: true }]);
  });

  test('cache sans « global », serveur qui le pré-coche (salut envoyé depuis iOS) : aucun second « Envoyer »', async () => {
    signIn();
    const { deps, greetings, arrive } = harness({
      staleCache: served({ seenSteps: ['languages'] }),
      state: served({ seenSteps: ['languages'], prefilledSteps: ['global'] }),
    });
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    expect(card(host)).toBe('global');
    await arrive();
    expect(action(host, 'global.send')).toBeNull();
    expect(card(host)).toBe('story');
    expect(greetings).toEqual([]);
  });

  test('la carte du salut rouverte par son adresse alors que le serveur l’a pré-cochée se montre ENVOYÉE', async () => {
    signIn();
    const { deps } = harness({ state: served({ seenSteps: ['languages'], prefilledSteps: ['global'] }) });
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams('step=global')} clearSearch={() => undefined} />);
    expect(action(host, 'global.send')).toBeNull();
    expect(host.querySelector('[data-onb-sent]')).not.toBeNull();
  });

  test('« Passer tout » ne rend l’accueil qu’UNE fois, même quand la fin arrive dans le cache', async () => {
    signIn();
    const finished = served({ eligible: false, completedAt: '2026-09-24T10:00:00.000Z' });
    const { deps, visits, arrive } = harness({ staleCache: served(), state: finished });
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    await click(action(host, 'skipAll'));
    await arrive();
    expect(visits).toEqual([{ path: '/', replace: true }]);
  });
});

describe('carte 1 — les langues', () => {
  test('une langue inchangée ne réécrit pas le profil, et l’étape part « done »', async () => {
    signIn();
    const { deps, saves, patches } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    expect(host.querySelector('[data-onb-gauge]')?.getAttribute('aria-label')).toBe('0 / 10 pts pour ton niveau 1');
    await click(action(host, 'languages.confirm'));
    expect(saves).toEqual([]);
    expect(patches).toEqual([{ step: 'languages', outcome: 'done' }]);
    expect(card(host)).toBe('global');
  });

  test('une seconde langue choisie s’enregistre sur le profil', async () => {
    signIn();
    const { deps, saves } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    const english = [...host.querySelectorAll<HTMLButtonElement>('.onb-chip')].find((chip) => chip.textContent?.includes('anglais')) ?? null;
    await click(english);
    expect(english?.getAttribute('aria-pressed')).toBe('true');
    await click(action(host, 'languages.confirm'));
    expect(saves).toEqual([{ systemLanguage: 'fr', regionalLanguage: 'en' }]);
  });
});

describe('carte 2 — le salut part VRAIMENT dans Meeshy Global', () => {
  const atGlobal = () => new URLSearchParams('step=global');

  test('le salut pré-rempli porte le pseudo, part en un tap, et +14 n’arrive qu’à l’accusé', async () => {
    signIn();
    const { deps, greetings } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={atGlobal()} clearSearch={() => undefined} />);
    const field = host.querySelector<HTMLTextAreaElement>('[data-onb-greeting]');
    expect(field?.value).toContain('Maya');
    expect(host.querySelector('[data-onb-pill]')?.textContent).toBe('0');

    await click(action(host, 'global.send'));

    expect(greetings).toHaveLength(1);
    expect(greetings[0]?.conversationId).toBe('g-global');
    expect(greetings[0]?.content).toContain('Maya');
    expect(host.querySelector('[data-onb-sent]')).not.toBeNull();
    expect(host.querySelector('[data-onb-flight]')?.textContent).toBe('+14');
    expect(host.querySelector('[data-onb-announce]')?.textContent).toBe('Tu gagnes 14 points.');
    expect(host.querySelector('[data-onb-pill]')?.textContent).toBe('0');
    await landed();
    expect(host.querySelector('[data-onb-pill]')?.textContent).toBe('14');
  });

  test('le texte modifié est celui qui part', async () => {
    signIn();
    const { deps, greetings } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={atGlobal()} clearSearch={() => undefined} />);
    type(host, '[data-onb-greeting]', 'Salut, moi c’est Maya de Dakar !');
    await click(action(host, 'global.send'));
    expect(greetings[0]?.content).toBe('Salut, moi c’est Maya de Dakar !');
  });

  test('un envoi refusé ne crédite rien et le dit', async () => {
    signIn();
    const { deps } = harness({ greeting: 'failed' });
    const host = await mount(<OnboardingJourney deps={deps} search={atGlobal()} clearSearch={() => undefined} />);
    await click(action(host, 'global.send'));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Ton salut n’est pas parti. Réessaie.');
    expect(host.querySelector('[data-onb-pill]')?.textContent).toBe('0');
  });

  test('Continuer après l’envoi enregistre l’étape faite et ouvre la story', async () => {
    signIn();
    const { deps, patches } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={atGlobal()} clearSearch={() => undefined} />);
    await click(action(host, 'global.send'));
    await click(action(host, 'global.continue'));
    expect(patches).toEqual([{ step: 'global', outcome: 'done' }]);
    expect(card(host)).toBe('story');
  });
});

describe('ce qui s’est confirmé ne se rejoue pas — ni second salut, ni seconde story', () => {
  test('l’étape s’écrit sur le serveur à l’ACCUSÉ du salut, pas au tap « Continuer »', async () => {
    signIn();
    const { deps, patches } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams('step=global')} clearSearch={() => undefined} />);
    await click(action(host, 'global.send'));
    expect(patches).toEqual([{ step: 'global', outcome: 'done' }]);
  });

  test('un salut accusé puis un rechargement avant « Continuer » : la reprise ne rouvre pas le composeur', async () => {
    signIn();
    const { deps, greetings } = harness({ state: served({ seenSteps: ['languages'] }), confirmed: ['global'] });
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    expect(card(host)).toBe('story');
    expect(host.querySelector('[data-onb-greeting]')).toBeNull();
    expect(greetings).toEqual([]);
  });

  test('la carte du salut rouverte par son adresse se montre ENVOYÉE, sans « Envoyer »', async () => {
    signIn();
    const { deps, greetings } = harness({ state: served({ seenSteps: ['languages'] }), confirmed: ['global'] });
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams('step=global')} clearSearch={() => undefined} />);
    expect(host.querySelector('[data-onb-greeting]')).toBeNull();
    expect(action(host, 'global.send')).toBeNull();
    expect(host.querySelector('[data-onb-sent]')).not.toBeNull();
    await click(action(host, 'global.continue'));
    expect(greetings).toEqual([]);
    expect(card(host)).toBe('story');
  });

  test('au retour d’une publication, l’étape story s’écrit tout de suite', async () => {
    signIn();
    const { deps, patches } = harness();
    await mount(<OnboardingJourney deps={deps} search={new URLSearchParams('story=published')} clearSearch={() => undefined} />);
    expect(patches).toEqual([{ step: 'story', outcome: 'done' }]);
  });

  test('une story publiée puis un rechargement : la carte 3 se montre publiée, sans « Créer ma story »', async () => {
    signIn();
    const { deps, patches } = harness({ state: served({ seenSteps: ['languages', 'global'] }), confirmed: ['story'] });
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams('step=story')} clearSearch={() => undefined} />);
    expect(action(host, 'story.create')).toBeNull();
    expect(host.querySelector('[data-onb-sent]')).not.toBeNull();
    await click(action(host, 'story.continue'));
    expect(patches).toEqual([{ step: 'story', outcome: 'done' }]);
    expect(card(host)).toBe('friends');
  });
});

describe('carte 3 — la première story, visibilité servie', () => {
  test('un régime protégé ouvre le studio en « amis », et le studio ramène au parcours', async () => {
    signIn();
    const { deps, visits } = harness({ state: served({ protectedRegime: true, storyDefaultVisibility: 'friends' }) });
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams('step=story')} clearSearch={() => undefined} />);
    expect(host.querySelector('[data-audience]')?.getAttribute('data-audience')).toBe('friends');
    await click(action(host, 'story.create'));
    expect(visits).toEqual([{ path: '/stories/new?audience=friends&from=onboarding', replace: false }]);
  });

  test('au retour d’une publication : +10, et l’adresse est nettoyée', async () => {
    signIn();
    const { deps } = harness();
    let cleared = 0;
    const host = await mount(
      <OnboardingJourney deps={deps} search={new URLSearchParams('story=published')} clearSearch={() => (cleared += 1)} />,
    );
    expect(card(host)).toBe('story');
    expect(host.querySelector('[data-onb-sent]')).not.toBeNull();
    await landed();
    expect(host.querySelector('[data-onb-pill]')?.textContent).toBe('10');
    expect(cleared).toBe(1);
  });
});

describe('carte 4 — de vraies demandes d’ami', () => {
  test('Ajouter envoie la demande, et le compteur avance', async () => {
    signIn();
    const { deps, friends } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams('step=friends')} clearSearch={() => undefined} />);
    await click(host.querySelector<HTMLElement>('[data-onb-person="u-aicha"] [data-onb-action="friends.add"]'));
    expect(friends).toEqual(['u-aicha']);
    expect(host.querySelector('.onb-friends-count')?.textContent).toBe('1 / 3 demandes');
  });

  test('rien envoyé : les notifications ne sont PAS proposées, on va au récapitulatif', async () => {
    signIn();
    const { deps, asked } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams('step=friends')} clearSearch={() => undefined} />);
    await click(action(host, 'friends.later'));
    expect(card(host)).toBe('recap');
    expect(asked()).toBe(0);
  });

  test('une demande envoyée appelle l’étape 5', async () => {
    signIn();
    const { deps } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams('step=friends')} clearSearch={() => undefined} />);
    await click(host.querySelector<HTMLElement>('[data-onb-person="u-aicha"] [data-onb-action="friends.add"]'));
    await click(action(host, 'friends.continue'));
    expect(card(host)).toBe('notifications');
  });
});

describe('carte 5 — la fenêtre système ne s’ouvre que sur « Oui »', () => {
  test('« Pas maintenant » ne la déclenche jamais', async () => {
    signIn();
    const { deps, asked, patches } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams('step=notifications')} clearSearch={() => undefined} />);
    await click(action(host, 'notifications.no'));
    expect(asked()).toBe(0);
    expect(patches).toEqual([{ step: 'notifications', outcome: 'skipped' }]);
    expect(card(host)).toBe('recap');
  });

  test('« Oui » l’ouvre, une fois', async () => {
    signIn();
    const { deps, asked } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams('step=notifications')} clearSearch={() => undefined} />);
    await click(action(host, 'notifications.yes'));
    expect(asked()).toBe(1);
    expect(card(host)).toBe('recap');
  });
});

describe('le récapitulatif — deux sorties, toujours la possibilité de s’arrêter', () => {
  test('« C’est bon pour aujourd’hui » clôt et rend l’accueil ; « Continuer à explorer » mène à Global', async () => {
    signIn();
    const first = harness();
    const host = await mount(<OnboardingJourney deps={first.deps} search={new URLSearchParams('step=friends')} clearSearch={() => undefined} />);
    await click(action(host, 'friends.later'));
    await click(action(host, 'recap.done'));
    expect(first.patches.at(-1)).toEqual({ finish: true });
    expect(first.visits.at(-1)).toEqual({ path: '/', replace: true });

    const second = harness();
    const again = await mount(<OnboardingJourney deps={second.deps} search={new URLSearchParams('step=friends')} clearSearch={() => undefined} />);
    await click(action(again, 'friends.later'));
    await click(action(again, 'recap.explore'));
    expect(second.visits.at(-1)).toEqual({ path: '/c/g-global', replace: true });
  });
});

describe('accessibilité et langue', () => {
  test('chaque carte est UN conteneur nommé par son titre', async () => {
    signIn();
    const { deps } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    const group = host.querySelector('[data-onb-card]');
    expect(group?.getAttribute('role')).toBe('group');
    const title = document.getElementById(group?.getAttribute('aria-labelledby') ?? '');
    expect(title?.textContent).toBe('Ta langue, ton monde');
  });

  test('en arabe, la mise en page passe en RTL', async () => {
    signIn();
    document.documentElement.lang = 'ar';
    const { deps } = harness();
    const host = await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    expect(host.querySelector('[data-onboarding]')?.getAttribute('dir')).toBe('rtl');
    expect(action(host, 'skipAll')?.textContent).toBe('تخطَّ الكل');
  });

  test('un parcours déjà clos ne se rejoue pas : retour à l’accueil', async () => {
    signIn();
    const { deps, visits } = harness({ state: served({ eligible: false, completedAt: '2026-09-24T10:00:00.000Z' }) });
    await mount(<OnboardingJourney deps={deps} search={new URLSearchParams()} clearSearch={() => undefined} />);
    expect(visits).toEqual([{ path: '/', replace: true }]);
  });
});
