import { describe, expect, test } from 'bun:test';

import type { Outcome } from '@/lib/api/outcome';

import { CAPTURE_JOB_LIFETIME_MS, createCaptureOutbox, retryDelay, type CaptureJob, type CaptureJobInput } from './capture-outbox';

/* UNE DÉCLARATION DE CAPTURE NE SE PERD PAS (#9617) — persistée, rejouée avec
   recul jusqu'à un verdict final de la passerelle, jamais en boucle. */

const job = (id: string): CaptureJobInput => ({ id, conversationId: 'c-1', messageIds: ['m1'], kind: 'screenshot', captureId: 'cap-1' });

function memoryStorage() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
}

function outbox(params: { readonly outcomes: Outcome[]; readonly storage?: ReturnType<typeof memoryStorage> }) {
  const clock = { now: 1_000 };
  const sent: CaptureJob[] = [];
  const timers: { run: () => void; ms: number }[] = [];
  const storage = params.storage ?? memoryStorage();
  const box = createCaptureOutbox({
    storage,
    key: 'k',
    now: () => clock.now,
    send: async (item) => {
      sent.push(item);
      return params.outcomes.shift() ?? 'success';
    },
    schedule: (run, ms) => {
      const timer = { run, ms };
      timers.push(timer);
      return () => void timers.splice(timers.indexOf(timer), 1);
    },
  });
  return { box, clock, sent, timers, storage };
}

describe('la file des déclarations de capture', () => {
  test('un succès retire la déclaration', async () => {
    const { box, sent } = outbox({ outcomes: ['success'] });
    box.enqueue([job('j1')]);
    await box.flush();
    expect(sent).toHaveLength(1);
    expect(box.pending()).toEqual([]);
  });

  test('un échec réseau garde la déclaration, la reprise la renvoie et l’annonce a lieu', async () => {
    const { box, sent, clock, timers } = outbox({ outcomes: ['transient', 'success'] });
    box.enqueue([job('j1')]);
    await box.flush();
    expect(box.pending()).toHaveLength(1);
    expect(timers.at(-1)?.ms).toBe(retryDelay(0));
    clock.now += retryDelay(0);
    await box.flush();
    expect(sent).toHaveLength(2);
    expect(box.pending()).toEqual([]);
  });

  test('un refus final retire la déclaration sans boucler', async () => {
    const { box, sent, timers } = outbox({ outcomes: ['permanent'] });
    box.enqueue([job('j1')]);
    await box.flush();
    await box.flush();
    expect(sent).toHaveLength(1);
    expect(box.pending()).toEqual([]);
    expect(timers).toHaveLength(0);
  });

  test('le recul double à chaque échec, plafonné à cinq minutes', () => {
    expect([0, 1, 2, 3].map(retryDelay)).toEqual([2_000, 4_000, 8_000, 16_000]);
    expect(retryDelay(20)).toBe(300_000);
  });

  test('une déclaration survit à la coque tuée : une nouvelle file la reprend', async () => {
    const storage = memoryStorage();
    const first = outbox({ outcomes: ['transient'], storage });
    first.box.enqueue([job('j1')]);
    await first.box.flush();
    first.box.stop();
    const second = outbox({ outcomes: ['success'], storage });
    second.clock.now += retryDelay(0);
    await second.box.flush();
    expect(second.sent.map((item) => item.id)).toEqual(['j1']);
    expect(second.box.pending()).toEqual([]);
  });

  test('après 24 h, la passerelle ne peut plus rien annoncer : abandonnée', async () => {
    const { box, sent, clock } = outbox({ outcomes: ['transient'] });
    box.enqueue([job('j1')]);
    await box.flush();
    clock.now += CAPTURE_JOB_LIFETIME_MS + 1;
    await box.flush();
    expect(sent).toHaveLength(1);
    expect(box.pending()).toEqual([]);
  });

  test('une même déclaration n’entre qu’une fois', () => {
    const { box } = outbox({ outcomes: [] });
    box.enqueue([job('j1'), job('j1')]);
    box.enqueue([job('j1')]);
    expect(box.pending()).toHaveLength(1);
  });
});
