/**
 * #11267 — le job du miroir continu : éteint sans `MEDIA_S3_MIRROR_FOLLOW=on`
 * ni seau, un seul passage à la fois, toutes les minutes appliqué et une fois
 * par jour à blanc (un passage à blanc relit toute la base, son curseur
 * n'avançant pas).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { MediaMirrorFollowJob, followIntervalMs } from '../../../jobs/media-mirror-follow';

const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

afterEach(() => jest.useRealTimers());

describe('MediaMirrorFollowJob', () => {
  it('éteint : ne lance aucun passage', async () => {
    const pass = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const job = new MediaMirrorFollowJob({ mode: () => ({ kind: 'off', reason: 'not-enabled' }), pass, logger: silent, env: {} });
    job.start();
    await Promise.resolve();
    expect(pass).not.toHaveBeenCalled();
    job.stop();
  });

  it('un seul passage à la fois : un battement pendant un passage en cours est sauté', async () => {
    jest.useFakeTimers();
    let release: () => void = () => undefined;
    const pass = jest.fn<(apply: boolean) => Promise<void>>().mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    const job = new MediaMirrorFollowJob({ mode: () => ({ kind: 'apply' }), pass, logger: silent, env: { MEDIA_MIRROR_INTERVAL_MS: '1000' } });

    job.start();
    expect(pass).toHaveBeenCalledTimes(1);
    expect(pass).toHaveBeenCalledWith(true);
    jest.advanceTimersByTime(3000);
    expect(pass).toHaveBeenCalledTimes(1);

    release();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    expect(pass).toHaveBeenCalledTimes(2);
    job.stop();
  });

  it('à blanc, le passage ne s’applique pas', () => {
    const pass = jest.fn<(apply: boolean) => Promise<void>>().mockResolvedValue(undefined);
    const job = new MediaMirrorFollowJob({ mode: () => ({ kind: 'dry-run' }), pass, logger: silent, env: {} });
    job.start();
    expect(pass).toHaveBeenCalledWith(false);
    job.stop();
  });
});

describe('followIntervalMs', () => {
  it('appliqué : MEDIA_MIRROR_INTERVAL_MS, une minute par défaut ; à blanc : un jour', () => {
    expect(followIntervalMs({ kind: 'apply' }, {})).toBe(60_000);
    expect(followIntervalMs({ kind: 'apply' }, { MEDIA_MIRROR_INTERVAL_MS: '5000' })).toBe(5000);
    expect(followIntervalMs({ kind: 'apply' }, { MEDIA_MIRROR_INTERVAL_MS: 'abc' })).toBe(60_000);
    expect(followIntervalMs({ kind: 'dry-run' }, { MEDIA_MIRROR_INTERVAL_MS: '5000' })).toBe(24 * 60 * 60 * 1000);
  });
});
