import { afterEach, describe, expect, test } from 'bun:test';

import * as jobs from './scene-export-jobs';

afterEach(() => {
  for (const job of jobs.getSnapshot().jobs) jobs.cancel(job.key);
});

describe('les exports en cours — suivis et annulables de partout', () => {
  test('un export se montre, avance, et quitte la liste quand il finit', () => {
    const handle = jobs.start('post:a');
    expect(jobs.getSnapshot().jobs).toEqual([{ key: 'post:a', progress: null, cancellable: true, choosing: null }]);
    handle?.report(0.42);
    expect(jobs.getSnapshot().jobs[0]?.progress).toBe(0.42);
    handle?.finish();
    expect(jobs.getSnapshot().jobs).toEqual([]);
  });

  test('un second départ sur la même publication est refusé tant que le premier tourne', () => {
    expect(jobs.start('post:a')).not.toBeNull();
    expect(jobs.start('post:a')).toBeNull();
  });

  test('annuler coupe le signal du job et le retire', () => {
    const handle = jobs.start('post:a');
    jobs.cancel('post:a');
    expect(handle?.signal.aborted).toBe(true);
    expect(jobs.getSnapshot().jobs).toEqual([]);
  });

  test('la livraison commencée ne s’annule plus', () => {
    const handle = jobs.start('post:a');
    handle?.lockDelivery();
    jobs.cancel('post:a');
    expect(handle?.signal.aborted).toBe(false);
    expect(jobs.getSnapshot().jobs[0]).toMatchObject({ progress: 1, cancellable: false });
    handle?.finish();
  });

  test('« Imager » attend la part choisie dans le bandeau', async () => {
    const handle = jobs.start('post:a');
    const choices = [1, 2, 3, 4].map((quarter) => ({ quarter: quarter as 1 | 2 | 3 | 4, durationMs: quarter * 60_000 }));
    const answer = handle?.chooseLength(choices);
    expect(jobs.getSnapshot().jobs[0]?.choosing).toEqual(choices);
    jobs.choose('post:a', 2);
    expect(await answer).toBe(2);
    expect(jobs.getSnapshot().jobs[0]?.choosing).toBeNull();
  });

  test('annuler pendant le choix répond « renoncer »', async () => {
    const handle = jobs.start('post:a');
    const answer = handle?.chooseLength([{ quarter: 1, durationMs: 60_000 }]);
    jobs.cancel('post:a');
    expect(await answer).toBeNull();
  });

  test('une issue se dit une fois, puis se retire', () => {
    jobs.announce('saved');
    const notice = jobs.getSnapshot().notice;
    expect(notice?.notice).toBe('saved');
    jobs.dismissNotice(notice?.id ?? -1);
    expect(jobs.getSnapshot().notice).toBeNull();
  });
});
