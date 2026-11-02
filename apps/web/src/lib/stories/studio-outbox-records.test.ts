import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { memoryDeviceRecords } from '@/lib/send/device-records';

import { createStudioOutbox, type StudioOutboxIntent } from './studio-outbox';
import { eraseStudioOutbox } from './studio-outbox-records';

const intent: StudioOutboxIntent = { choice: { kind: 'POST', layout: null }, promoted: false, state: 'armed', keys: [] };
const slot = (name: string) => ({ pageId: 'page-1', door: 'visual' as const, meta: {}, file: new File([new Uint8Array([1])], name, { type: 'image/jpeg' }) });

describe('la fin d’un compte efface ses publications non envoyées sans charger le studio', () => {
  test('les médias et l’intention du compte qui part sont effacés, ceux d’un autre compte restent', async () => {
    const records = memoryDeviceRecords();
    const outbox = createStudioOutbox(records);
    await outbox.save('alice', { slots: [slot('a.jpg')], intent });
    await outbox.save('bruno', { slots: [slot('b.jpg')], intent });

    await eraseStudioOutbox('alice', records);

    expect(await createStudioOutbox(records).load('alice')).toBeNull();
    expect((await createStudioOutbox(records).load('bruno'))?.intent).toEqual(intent);
  });

  test('le module chargé à la déconnexion ne tire ni le studio ni la file d’envoi', () => {
    const source = readFileSync(new URL('./studio-outbox-records.ts', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
    expect(imports).toEqual(['@/lib/send/device-records']);
    const caches = readFileSync(new URL('../api/account-caches.ts', import.meta.url), 'utf8');
    expect(caches).not.toContain("import('../stories/studio-outbox')");
  });
});

describe('une publication confirmée n’est jamais réécrite sur l’appareil par une écriture en retard', () => {
  test('l’effacement annule les écritures demandées avant lui et pas encore faites', async () => {
    const rows = memoryDeviceRecords();
    const writes: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let first = true;
    const records = {
      load: rows.load,
      save: async (key: string, value: unknown) => {
        if (value !== undefined) writes.push(key);
        if (first && value !== undefined) {
          first = false;
          await gate;
        }
        await rows.save(key, value);
      },
    };
    const outbox = createStudioOutbox(records);
    const inFlight = outbox.save('alice', { slots: [slot('a.jpg')], intent });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const late = outbox.save('alice', { slots: [slot('b.jpg')], intent: { ...intent, state: 'failed' } });
    const cleared = outbox.clear('alice');
    release();
    await Promise.all([inFlight, late, cleared]);

    expect(writes.filter((key) => key.includes('alice'))).toHaveLength(2);
    expect(await createStudioOutbox(rows).load('alice')).toBeNull();
  });
});
