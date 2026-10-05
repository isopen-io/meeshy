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
