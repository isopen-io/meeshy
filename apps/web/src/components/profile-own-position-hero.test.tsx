import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createStore } from 'zustand/vanilla';

import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { EMPTY_ROSTER, type SharedLocationRoster } from '@/lib/shared-locations/shared-location-roster';
import type { SharedLocationSharingState } from '@/lib/shared-locations/shared-location-sharing';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProfileOwnPositionHero, type OwnLastPosition } from './profile-own-position-hero';

/**
 * MA FICHE MONTRE MA DERNIÈRE POSITION CONNUE (#20242, iso `ProfileOwnPositionPreview`) — seulement quand ma position
 * PART (au moins une personne la voit) et que le navigateur en connaît une sans rien demander : le bloc héros, avec
 * son heure, quel que soit son âge. Sinon rien, jamais une carte vide.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadCirclesCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

const SHARING: SharedLocationRoster = {
  ...EMPTY_ROSTER,
  entries: { ['b'.repeat(24)]: { precision: 'exact', until: Date.now() + 3_600_000 } },
};

const storeOf = (roster: SharedLocationRoster) => createStore<SharedLocationSharingState>(() => ({ roster, busy: false }));

const known = (ageMs: number): OwnLastPosition => ({ fix: { latitude: 48.85, longitude: 2.35, accuracy: 30 }, at: Date.now() - ageMs });

describe('le bloc héros de ma dernière position', () => {
  test('ma position part et le navigateur en connaît une : la carte et son heure, même ancienne', async () => {
    const node = await mount(<ProfileOwnPositionHero language="fr" name="Moi" sharing={storeOf(SHARING)} locate={async () => known(3 * 3_600_000)} />);
    await settle();
    await act(async () => undefined);
    const hero = node.querySelector('[data-profile-where-hero]');
    expect(hero).not.toBeNull();
    expect(hero?.textContent).toContain('Dernière position · à ');
  });

  test('une position toute récente : « à l’instant »', async () => {
    const node = await mount(<ProfileOwnPositionHero language="fr" name="Moi" sharing={storeOf(SHARING)} locate={async () => known(10_000)} />);
    await settle();
    expect(node.querySelector('[data-profile-where-hero]')?.textContent).toContain('Dernière position · à l’instant');
  });

  test('ma position ne part pas : rien, et on ne demande même pas où je suis', async () => {
    let asked = 0;
    const node = await mount(
      <ProfileOwnPositionHero
        language="fr"
        name="Moi"
        sharing={storeOf(EMPTY_ROSTER)}
        locate={async () => {
          asked += 1;
          return known(0);
        }}
      />,
    );
    await settle();
    expect(node.querySelector('[data-profile-where-hero]')).toBeNull();
    expect(asked).toBe(0);
  });

  test('le navigateur ne connaît aucune position : rien, jamais une carte vide', async () => {
    const node = await mount(<ProfileOwnPositionHero language="fr" name="Moi" sharing={storeOf(SHARING)} locate={async () => null} />);
    await settle();
    expect(node.querySelector('[data-profile-where-hero]')).toBeNull();
  });
});
