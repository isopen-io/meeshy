import { describe, expect, test } from 'bun:test';

import { createImageJobClient, IMAGE_JOB_IDLE_MS, IMAGE_JOB_WATCHDOG_MS, type ImageJobWorker, type WorkerSignal } from './image-job-client';
import type { ImageJob, ImageJobRequest } from './image-job';

/**
 * LE CLIENT DU WORKER D'IMAGE (#11310) — un seul worker, créé à la première
 * photo, qui répond par identifiant et s'éteint quand il n'a plus rien à
 * faire (une image de 12 Mpx coûte des dizaines de Mo : on ne la garde pas
 * en mémoire pour rien, dimension 3).
 */

const job = (type = 'image/png'): ImageJob => ({
  input: { kind: 'file', blob: new Blob(['x'], { type }) },
  maxEdge: 2560,
  look: null,
  output: { kind: 'efficient', quality: 0.85 },
});

type Rig = {
  readonly worker: ImageJobWorker;
  readonly sent: ImageJobRequest[];
  readonly transfers: Array<readonly Transferable[]>;
  readonly reply: (signal: WorkerSignal) => void;
  terminated: number;
};

const rig = (): Rig => {
  let handler: (signal: WorkerSignal) => void = () => undefined;
  const state: Rig = {
    sent: [],
    transfers: [],
    terminated: 0,
    reply: (signal) => handler(signal),
    worker: {
      post: (request, transfer) => {
        state.sent.push(request);
        state.transfers.push(transfer);
      },
      listen: (next) => void (handler = next),
      terminate: () => void (state.terminated += 1),
    },
  };
  return state;
};

const timers = () => {
  const pending = new Map<number, { readonly run: () => void; readonly ms: number }>();
  let next = 1;
  return {
    set: (run: () => void, ms: number) => {
      pending.set(next, { run, ms });
      return next++;
    },
    clear: (handle: number) => void pending.delete(handle),
    /** Les minuteries d'un délai donné — l'extinction par défaut. */
    fire: (ms: number = IMAGE_JOB_IDLE_MS) => [...pending.entries()].filter(([, timer]) => timer.ms === ms).forEach(([handle, timer]) => (pending.delete(handle), timer.run())),
    count: () => pending.size,
  };
};

describe('sans worker', () => {
  test('le client le dit (undefined) : l’appelant garde son chemin d’avant', () => {
    const client = createImageJobClient({ spawn: null });
    expect(client.run(job())).toBeUndefined();
  });
});

describe('le multiplexage', () => {
  test('chaque demande reçoit SA réponse, même dans le désordre', async () => {
    const worker = rig();
    const client = createImageJobClient({ spawn: () => worker.worker });
    const first = client.run(job());
    const second = client.run(job());
    const [a, b] = worker.sent.map((request) => request.id);
    const blobA = new Blob(['a']);
    const blobB = new Blob(['b']);
    worker.reply({ id: b ?? -1, blob: blobB });
    worker.reply({ id: a ?? -1, blob: blobA });
    expect(await first).toBe(blobA);
    expect(await second).toBe(blobB);
  });

  test('un cadre capturé est TRANSFÉRÉ, jamais copié', () => {
    const worker = rig();
    const client = createImageJobClient({ spawn: () => worker.worker });
    const bitmap = { width: 2, height: 2, close: () => undefined } as unknown as ImageBitmap;
    void client.run({ ...job(), input: { kind: 'frame', bitmap } });
    expect(worker.transfers[0]).toEqual([bitmap]);
  });

  test('le worker n’est créé qu’une fois pour plusieurs photos', () => {
    const worker = rig();
    let spawned = 0;
    const client = createImageJobClient({ spawn: () => (spawned += 1, worker.worker) });
    void client.run(job());
    void client.run(job());
    expect(spawned).toBe(1);
  });
});

describe('l’extinction', () => {
  test('inactif, le worker s’éteint ; la photo suivante en crée un neuf', async () => {
    const worker = rig();
    const clock = timers();
    let spawned = 0;
    const client = createImageJobClient({ spawn: () => (spawned += 1, worker.worker), timers: clock });
    const pending = client.run(job());
    worker.reply({ id: worker.sent[0]?.id ?? -1, blob: null });
    await pending;
    clock.fire();
    expect(worker.terminated).toBe(1);
    void client.run(job());
    expect(spawned).toBe(2);
  });

  test('pas d’extinction tant qu’une photo est en cours', async () => {
    const worker = rig();
    const clock = timers();
    const client = createImageJobClient({ spawn: () => worker.worker, timers: clock });
    void client.run(job());
    clock.fire();
    expect(worker.terminated).toBe(0);
  });
});

describe('la panne du worker', () => {
  test('les photos en cours rendent null, et la suivante repart sur un worker neuf', async () => {
    const worker = rig();
    let spawned = 0;
    const client = createImageJobClient({ spawn: () => (spawned += 1, worker.worker) });
    const pending = client.run(job());
    worker.reply({ failed: true });
    expect(await pending).toBeNull();
    expect(worker.terminated).toBe(1);
    void client.run(job());
    expect(spawned).toBe(2);
  });
});

describe('le worker muet ou impossible à créer (jamais une promesse pendante)', () => {
  test('aucune réponse pendant le délai de garde : les photos en cours rendent null et le worker est éteint', async () => {
    const worker = rig();
    const clock = timers();
    const client = createImageJobClient({ spawn: () => worker.worker, timers: clock });
    const pending = client.run(job());
    clock.fire(IMAGE_JOB_WATCHDOG_MS);
    expect(await pending).toBeNull();
    expect(worker.terminated).toBe(1);
  });

  test('un worker qui avance n’est pas tenu pour muet : chaque réponse réarme la garde', async () => {
    const worker = rig();
    const clock = timers();
    const client = createImageJobClient({ spawn: () => worker.worker, timers: clock });
    const first = client.run(job());
    const second = client.run(job());
    const blob = new Blob(['a']);
    worker.reply({ id: worker.sent[0]?.id ?? -1, blob });
    expect(await first).toBe(blob);
    expect(clock.count()).toBe(1);
    worker.reply({ id: worker.sent[1]?.id ?? -1, blob });
    expect(await second).toBe(blob);
    clock.fire(IMAGE_JOB_WATCHDOG_MS);
    expect(worker.terminated).toBe(0);
  });

  test('le navigateur refuse de créer le worker : null, jamais une promesse rejetée', async () => {
    const client = createImageJobClient({
      spawn: () => {
        throw new Error('SecurityError');
      },
    });
    expect(await client.run(job())).toBeNull();
  });

  test('le worker refuse la demande (cadre déjà transféré) : null, et la suivante repart sur un worker neuf', async () => {
    const worker = rig();
    let spawned = 0;
    const refusing: ImageJobWorker = {
      ...worker.worker,
      post: () => {
        throw new Error('DataCloneError');
      },
    };
    const client = createImageJobClient({ spawn: () => (spawned += 1, spawned === 1 ? refusing : worker.worker) });
    expect(await client.run(job())).toBeNull();
    void client.run(job());
    expect(spawned).toBe(2);
    expect(worker.sent).toHaveLength(1);
  });
});
