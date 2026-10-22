import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { GloryAtmosphere } from '@meeshy/shared/types/glory-atmospheres';

import { GamePhotoFlow } from '@/components/game-photo-flow';
import { atmosphereTilesOf, type AtmosphereGate } from '@/lib/game/atmosphere';
import { bumpGloryCatalogEpoch } from '@/lib/game-photo/glory-catalog-epoch';
import type { PhotoEnv } from '@/lib/game-photo/env';
import type { GloryScene, GloryStep } from '@/lib/game-photo/glory/glory-scene';
import { rankMoment } from '@/lib/game-photo/moments';
import { choose, env, rank, settle, setupGamePhotoFlowTests } from '@/test-support/game-photo-flow-harness';

const { mount, click, rerender } = setupGamePhotoFlowTests();

/**
 * L'ATMOSPHÈRE DANS LE DÉROULÉ (#10163, L10b ; D7 #10182) : à la première photo de rang dès Ambassadeur, sans
 * atmosphère, l'écran de choix précède « On immortalise ? » ; choisir ferme l'écran et la scène se relit dans
 * l'atmosphère choisie ; « Choisir plus tard » laisse partir la photo dans l'Afrique éternelle (atmosphère nulle
 * pour la loi) ; une étape d'avant Ambassadeur n'ouvre jamais l'écran ; l'époque du catalogue rouvre la scène.
 */
const ambassador = rankMoment({ rank: 'ambassadeur', division: 1 });
const tiles = atmosphereTilesOf({ catalogue: [], installed: [], origin: 'https://gate.example' });

const gate = (current: GloryAtmosphere | null, log: { chosen: GloryAtmosphere[]; deferred: number }, offers = true): AtmosphereGate => ({
  current,
  tiles,
  offers: () => offers && current === null,
  choose: async (atmosphere) => {
    log.chosen.push(atmosphere);
    return { status: 'saved', packInstalled: true };
  },
  defer: () => void (log.deferred += 1),
});

const scenic = () => {
  const steps: GloryStep[] = [];
  const { env: base, log } = env();
  const value: PhotoEnv = {
    ...base,
    glory: async ({ step }) => {
      steps.push(step);
      return null as GloryScene | null;
    },
  };
  return { env: value, log, steps };
};

describe('l’atmosphère dans le déroulé (#10163)', () => {
  test('sans atmosphère à Ambassadeur : l’écran de choix d’abord ; choisir appelle le geste, ferme l’écran, et la scène se relit dans l’atmosphère du compte', async () => {
    const log = { chosen: [] as GloryAtmosphere[], deferred: 0 };
    const { env: e, log: flow, steps } = scenic();
    const host = await mount(<GamePhotoFlow moment={ambassador} env={e} atmosphere={gate(null, log)} onClose={(result) => flow.closed.push(result)} />);
    expect(host.querySelector('[data-atmosphere-choice]')).not.toBeNull();
    expect(choose(host, 'selfie')).toBeNull();
    expect(host.querySelector('[data-atmosphere-choice]')?.textContent).toContain('Ambassadeur');
    await click(host.querySelector<HTMLElement>('[data-atmosphere-option="olympe"]'));
    await click(host.querySelector<HTMLElement>('[data-atmosphere-continue]'));
    expect(log.chosen).toEqual(['olympe']);
    expect(host.querySelector('[data-atmosphere-choice]')).toBeNull();
    expect(choose(host, 'selfie')).not.toBeNull();
    await rerender(host, <GamePhotoFlow moment={ambassador} env={e} atmosphere={gate('olympe', log)} onClose={(result) => flow.closed.push(result)} />);
    await settle();
    expect(steps.at(-1)).toMatchObject({ stepId: 'rank:ambassadeur:1', atmosphere: 'olympe' });
    expect(host.querySelector('[data-atmosphere-choice]')).toBeNull();
  });

  test('« Choisir plus tard » compte un report, n’enregistre rien, et la photo part dans l’Afrique éternelle (atmosphère nulle pour la loi)', async () => {
    const log = { chosen: [] as GloryAtmosphere[], deferred: 0 };
    const { env: e, log: flow, steps } = scenic();
    const host = await mount(<GamePhotoFlow moment={ambassador} env={e} atmosphere={gate(null, log)} onClose={(result) => flow.closed.push(result)} />);
    await click(host.querySelector<HTMLElement>('[data-atmosphere-later]'));
    await settle();
    expect(log).toEqual({ chosen: [], deferred: 1 });
    expect(choose(host, 'selfie')).not.toBeNull();
    expect(steps.at(-1)).toMatchObject({ atmosphere: null });
  });

  test('une étape que la porte ne vise pas (Voix II), ou aucune porte : le déroulé s’ouvre directement', async () => {
    const log = { chosen: [] as GloryAtmosphere[], deferred: 0 };
    const { env: e, log: flow } = scenic();
    const host = await mount(<GamePhotoFlow moment={rank} env={e} atmosphere={gate(null, log, false)} onClose={(result) => flow.closed.push(result)} />);
    expect(host.querySelector('[data-atmosphere-choice]')).toBeNull();
    expect(choose(host, 'selfie')).not.toBeNull();
    const bare = await mount(<GamePhotoFlow moment={ambassador} env={e} onClose={(result) => flow.closed.push(result)} />);
    expect(bare.querySelector('[data-atmosphere-choice]')).toBeNull();
  });

  test('fermer l’écran de choix ferme le déroulé sans choisir ni reporter', async () => {
    const log = { chosen: [] as GloryAtmosphere[], deferred: 0 };
    const { env: e, log: flow } = scenic();
    const host = await mount(<GamePhotoFlow moment={ambassador} env={e} atmosphere={gate(null, log)} onClose={(result) => flow.closed.push(result)} />);
    await click(host.querySelector<HTMLElement>('[data-atmosphere-close]'));
    await settle();
    expect(flow.closed).toHaveLength(1);
    expect(log).toEqual({ chosen: [], deferred: 0 });
  });

  test('l’époque du catalogue rouvre la scène de l’aperçu : le pack installé par le choix se lit sans rouvrir le déroulé', async () => {
    const { env: e, log: flow, steps } = scenic();
    const host = await mount(<GamePhotoFlow moment={rank} env={e} onClose={(result) => flow.closed.push(result)} />);
    await click(choose(host, 'selfie'));
    await settle();
    const before = steps.length;
    expect(before).toBeGreaterThan(0);
    await act(async () => bumpGloryCatalogEpoch());
    await settle();
    expect(steps.length).toBe(before + 1);
  });
});
