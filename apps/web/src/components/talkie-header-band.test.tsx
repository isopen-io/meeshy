import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { LAYER_MOTION_MS } from '@/lib/view/dialog-exit';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { TalkieHeaderBand, type ThreadTalkieLive } from './talkie-header-band';

/**
 * LA BANDE DU TALKIE CHANGE DE HALO SANS REPEINDRE UNE OMBRE (#18320, contrat M6) — en direct, le halo est
 * fort ; relayée ou enregistrée, il est faible. Le passage de l'un à l'autre fond l'OPACITÉ de deux couches
 * qui portent chacune son ombre, sur le fondu de 200 ms des couches : aucune ombre ne s'anime.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadCirclesCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const band = (live: ThreadTalkieLive): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<TalkieHeaderBand language="fr" live={live} accent="#6366F1" secondary="#8B5CF6" meter={{ level: () => 0 }} />);
  return host;
};

const haloOpacity = (host: HTMLElement, halo: 'live' | 'quiet'): string | undefined =>
  host.querySelector<HTMLElement>(`[data-talkie-halo="${halo}"]`)?.style.opacity;

describe('le halo de la bande du talkie', () => {
  test('en direct, le halo fort est seul visible ; relayée, le halo faible', () => {
    const live = band({ voice: 'incoming', delivery: 'live' });
    expect([haloOpacity(live, 'live'), haloOpacity(live, 'quiet')]).toEqual(['1', '0']);
    const relayed = band({ voice: 'incoming', delivery: 'relayed' });
    expect([haloOpacity(relayed, 'live'), haloOpacity(relayed, 'quiet')]).toEqual(['0', '1']);
  });

  test('le passage fond l’opacité sur la durée des couches, et aucune ombre ne s’anime', () => {
    const host = band({ voice: 'incoming', delivery: 'live' });
    const halo = host.querySelector<HTMLElement>('[data-talkie-halo="live"]');
    expect(halo?.style.transition).toBe(`opacity ${LAYER_MOTION_MS}ms`);
    const animatesShadow = [...host.querySelectorAll<HTMLElement>('*')].some(
      (node) => /box-shadow/.test(node.className.toString()) || /box-shadow/.test(node.style.transition),
    );
    expect(animatesShadow).toBe(false);
  });
});
