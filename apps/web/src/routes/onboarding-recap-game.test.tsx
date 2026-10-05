import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadOnboardingCatalog } from '@/lib/i18n-onboarding-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { RecapCard } from './onboarding-recap';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/onboarding' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadOnboardingCatalog(language)));
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const base = {
  host: { lang: 'fr', online: true, points: 14 } as const,
  session: { points: 14, pendingFriends: 0 } as never,
  load: async () => null,
  onExplore: () => undefined,
  onDone: () => undefined,
};
const action = (host: ParentNode, id: string) => host.querySelector<HTMLElement>(`[data-onb-action="${id}"]`);

/**
 * L'ACCUEIL ET LE JEU (#9379, #7729) — les sept cartes de l'intégration du
 * jeu se branchent sur l'accueil existant : à la fin du parcours, une porte
 * mène à Progression, où Mee ouvre la première carte. Le parcours d'accueil
 * garde ses deux sorties ; la porte du jeu s'AJOUTE, elle ne remplace rien.
 */
describe('la porte vers le jeu, sur le récapitulatif', () => {
  test('quand l’hôte la fournit, un bouton mène au jeu — traduit', async () => {
    let opened = 0;
    const host = await mount(<RecapCard {...base} onGame={() => (opened += 1)} />);
    const button = action(host, 'recap.game');
    expect(button?.textContent).toBe('Découvrir le jeu avec Mee et Meo');
    await click(button);
    expect(opened).toBe(1);
  });

  test('les deux sorties d’origine restent', async () => {
    const host = await mount(<RecapCard {...base} onGame={() => undefined} />);
    expect(action(host, 'recap.explore')).not.toBeNull();
    expect(action(host, 'recap.done')).not.toBeNull();
  });

  test('sans porte fournie (un hôte plus ancien) : le récapitulatif est celui d’avant', async () => {
    const host = await mount(<RecapCard {...base} />);
    expect(action(host, 'recap.game')).toBeNull();
  });

  test('chaque langue du produit dit la porte', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const catalog = await loadOnboardingCatalog(language);
      expect({ language, text: catalog['onboarding.recap.game'].length > 3 }).toEqual({ language, text: true });
    }
  });
});
