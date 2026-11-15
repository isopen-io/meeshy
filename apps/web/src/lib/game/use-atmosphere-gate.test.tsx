import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { GameBlock } from '@meeshy/shared/types/game';

import { gameBlockFixture } from '@/lib/api/game-fixture';
import { packQueryKeys } from '@/lib/api/pack-query-keys';
import { appQueryClient } from '@/lib/api/query-client';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useAtmosphereGate } from './use-atmosphere-gate';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();
const FRAME_KEYS = packQueryKeys('glory-frame');

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
/* `appQueryClient` est un singleton de module : une suite voisine peut y avoir laissé le port déjà lu. */
const forget = (): void => {
  appQueryClient.removeQueries({ queryKey: FRAME_KEYS.catalogue });
  appQueryClient.removeQueries({ queryKey: FRAME_KEYS.installed });
};
beforeEach(forget);
afterEach(() => {
  unmountAll();
  forget();
});

function Probe({ game, tiles }: { readonly game: GameBlock | null; readonly tiles?: boolean }) {
  useAtmosphereGate(game, tiles === undefined ? {} : { tiles });
  return null;
}

const fetched = (): { readonly catalogue: boolean; readonly installed: boolean } => ({
  catalogue: (appQueryClient.getQueryState(FRAME_KEYS.catalogue)?.dataUpdatedAt ?? 0) > 0,
  installed: (appQueryClient.getQueryState(FRAME_KEYS.installed)?.dataUpdatedAt ?? 0) > 0,
});

/**
 * LA PORTE NE PAIE LA BOUTIQUE QUE SI L'ÉCRAN PEUT S'OUVRIR (#10163, revue) : l'écran de choix n'existe qu'à une
 * étape de rang dès Ambassadeur. Pour tout compte d'avant (Murmure à Polyglotte — aujourd'hui la totalité), monter
 * le hub, le carnet, une fiche ou les succès ne doit lancer NI le catalogue NI l'étagère du port `glory-frame`.
 */
describe('useAtmosphereGate : les tuiles se chargent seulement quand l’écran peut se montrer', () => {
  test('un compte d’avant Ambassadeur, sans atmosphère : aucune lecture du port glory-frame', async () => {
    const voix = gameBlockFixture({ glory: 6_500 });
    expect(voix.glory.rank).toBe('voix');
    await mount(<Probe game={voix} />);
    expect(fetched()).toEqual({ catalogue: false, installed: false });
  });

  test('un compte Ambassadeur sans atmosphère : catalogue et étagère se lisent (l’écran peut s’ouvrir)', async () => {
    const ambassador = gameBlockFixture({ glory: 130_000 });
    expect(ambassador.glory.rank).toBe('ambassadeur');
    await mount(<Probe game={ambassador} />);
    expect(fetched()).toEqual({ catalogue: true, installed: true });
  });

  test('les réglages les demandent explicitement : elles se lisent quel que soit le rang', async () => {
    await mount(<Probe game={gameBlockFixture({ glory: 6_500 })} tiles />);
    expect(fetched()).toEqual({ catalogue: true, installed: true });
  });
});
