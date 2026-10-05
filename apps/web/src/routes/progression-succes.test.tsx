import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { ENGAGEMENT_ACHIEVEMENT_KEYS } from '@meeshy/shared/types/engagement';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SuccesBody } from './progression-succes';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/succes' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 15)));
const progress = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);

const env = {
  notebook: { defer: async () => true, keep: async () => true, list: async () => [], remove: async () => true },
  referral: async () => 'https://meeshy.me/signup/affiliate/aff_abc',
  now: () => new Date('2026-10-05T10:00:00.000Z'),
  playOptions: { reducedMotion: false, haptics: false, schedule: (run: () => void) => (run(), () => undefined) },
} as unknown as PhotoEnv;

/**
 * LA RÉVÉLATION D'UN SUCCÈS SE PHOTOGRAPHIE (#7742) — conception XII.3 : « toute
 * image partagée depuis un moment photo ou une révélation de succès porte le
 * lien de parrainage ». Un succès obtenu propose la MÊME carte ; un succès
 * verrouillé n'a rien à immortaliser.
 */
describe('les succès proposent la carte', () => {
  const unlocked = progress.achievements.filter((a) => a.unlocked);
  const locked = progress.achievements.filter((a) => !a.unlocked);

  test('un bouton par succès obtenu, aucun sur un succès verrouillé', async () => {
    const host = await mount(<SuccesBody progress={progress} env={env} />);
    await settle();
    expect(host.querySelectorAll('[data-achievement-photo]')).toHaveLength(unlocked.length);
    for (const achievement of locked) expect(host.querySelector(`[data-achievement-photo="${achievement.key}"]`)).toBeNull();
    expect(ENGAGEMENT_ACHIEVEMENT_KEYS.length).toBe(progress.achievements.length);
  });

  test('toucher le bouton ouvre le déroulé sur ce succès, et le fermer le rend', async () => {
    const first = unlocked[0];
    if (first === undefined) throw new Error('un succès obtenu attendu');
    const host = await mount(<SuccesBody progress={progress} env={env} />);
    await settle();
    await click(host.querySelector(`[data-achievement-photo="${first.key}"]`));
    await settle();
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Succès débloqué');
    await click(host.querySelector('[data-photo-close]'));
    await settle();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
});

/**
 * LA RARETÉ D'UN SUCCÈS (#9390) — un liseré par rareté, une règle de vie privée :
 * sous 20 titulaires ou 1 000 comptes, aucun liseré, « rareté en cours de mesure ».
 */
describe('la rareté sur les succès', () => {
  const key = progress.achievements[0]?.key ?? 'x';

  test('une rareté mesurée assez large : le liseré, le nom, la part des comptes', async () => {
    const host = await mount(<SuccesBody progress={progress} env={env} rarities={{ [key]: { rarity: 'epic', holders: 60, population: 1500 } }} />);
    await settle();
    const row = host.querySelector('[data-game-rim="epic"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('Épique');
    expect(row?.textContent).toContain('4 % des comptes');
  });

  test('sous le seuil de titulaires : AUCUN liseré, la rareté se dit en cours de mesure', async () => {
    const host = await mount(<SuccesBody progress={progress} env={env} rarities={{ [key]: { rarity: 'mythic', holders: 2, population: 5000 } }} />);
    await settle();
    expect(host.querySelector('[data-game-rim]')).toBeNull();
    expect(host.textContent).toContain('Rareté en cours de mesure');
    expect(host.textContent).not.toContain('Mythique');
  });

  test('un serveur qui ne sert pas la rareté : l’écran d’avant, intact', async () => {
    const host = await mount(<SuccesBody progress={progress} env={env} />);
    await settle();
    expect(host.querySelector('[data-game-rim]')).toBeNull();
    expect(host.querySelector('[data-game-rarity]')).toBeNull();
  });

  test('le nom de la rareté est lu en toutes lettres, la couleur n’est jamais la seule information', async () => {
    const host = await mount(<SuccesBody progress={progress} env={env} rarities={{ [key]: { rarity: 'legendary', holders: 25, population: 5000 } }} />);
    await settle();
    expect(host.querySelector('[data-game-rarity="legendary"]')?.getAttribute('aria-label')).toContain('Légendaire');
  });
});
