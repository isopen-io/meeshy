import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, Suspense, type ComponentType } from 'react';

import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import AtlasScreen from './progression-atlas';
import LigueScreen from './progression-ligue';
import PrestigeScreen from './progression-prestige';
import ReglagesScreen from './progression-reglages';
import SaisonScreen from './progression-saison';
import VitrineScreen from './progression-vitrine';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadGameCatalog('fr');
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
};

async function open(Screen: ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const host = await mount(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
    </QueryClientProvider>,
  );
  await settle();
  return host;
}

/**
 * LES SIX ÉCRANS DE LA VAGUE 2, MONTÉS DE BOUT EN BOUT (#9481) — la page, son
 * cadre (retour, titre, compte), la lecture de la progression depuis le cache de
 * requêtes, et le corps. Sur la source de démonstration : la loi partagée bâtit
 * le bloc et le classement, les écrans les peignent.
 */
describe('chaque écran se peint depuis la progression de démonstration', () => {
  test('la Ligue : le titre, le classement du groupe, la mission en duo', async () => {
    const host = await open(LigueScreen);
    expect(host.querySelector('h1')?.textContent).toBe('Ligue');
    expect(host.querySelector('[data-game-standings]')).not.toBeNull();
    expect(host.querySelector('#game-duo')).not.toBeNull();
  });

  test('la Saison : ses quarante étapes et le compte en haut à droite', async () => {
    const host = await open(SaisonScreen);
    expect(host.querySelector('h1')?.textContent).toBe('Saison');
    expect(host.querySelectorAll('[data-game-season-step]')).toHaveLength(40);
    expect(host.textContent).toContain('14 / 40');
  });

  test('la Vitrine : les trois trophées', async () => {
    const host = await open(VitrineScreen);
    expect(host.querySelector('h1')?.textContent).toBe('Vitrine de trophées');
    expect(host.querySelectorAll('[data-game-trophy-shelf] > li')).toHaveLength(3);
  });

  test('l’Atlas : ses tampons et le compte', async () => {
    const host = await open(AtlasScreen);
    expect(host.querySelector('h1')?.textContent).toBe('Atlas des langues');
    expect(host.querySelectorAll('[data-game-atlas-language]')).toHaveLength(4);
  });

  test('le Prestige : l’anneau et les étoiles, pas d’offre sous le niveau 100', async () => {
    const host = await open(PrestigeScreen);
    expect(host.querySelector('h1')?.textContent).toBe('Prestige');
    expect(host.querySelector('[data-game-prestige-scene]')).not.toBeNull();
    expect(host.querySelector('[data-game-prestige-go]')).toBeNull();
  });

  test('les Réglages du jeu : célébrations, jeu masqué, visibilité', async () => {
    const host = await open(ReglagesScreen);
    expect(host.querySelector('h1')?.textContent).toBe('Réglages du jeu');
    expect(host.querySelector('[data-game-setting-celebrations]')).not.toBeNull();
    expect(host.querySelector('[data-game-setting-hidden]')).not.toBeNull();
    expect(host.querySelectorAll('[data-game-visibility]')).toHaveLength(4);
  });
});
