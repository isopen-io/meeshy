/**
 * L'ÉTAT DE BATTERIE au repos (#14147) : l'épisode d'un émetteur, scellé, 24 h, sans
 * historique ; la mémoire « a reçu le push critique » par épisode ; le verrou du relevé à
 * la demande par paire ; le marqueur que le balayage d'extinction relit.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { BATTERY_CONFIG } from '@meeshy/shared/types/battery';
import {
  claimBatteryPull,
  clearBatteryRecord,
  forgetCriticalReaders,
  readBatteryRecord,
  readCriticalReaders,
  rememberCriticalReaders,
  storeBatteryRecord,
  watchBatteryEmitter,
  watchedBatteryEmitters,
  withBatteryLock,
  type BatteryRecord,
} from '../../../../services/battery/batteryStore';
import { batteryCacheInMemory } from './batteryWorld';

const EMETTEUR = '6200000000000000000000e1';
const AUTRE = '6200000000000000000000e2';
const LECTEUR = '6200000000000000000000b1';
const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

const record = (): BatteryRecord => ({
  episode: {
    phase: 'low',
    announcedThresholds: [30],
    criticalFloor: null,
    closedAt: null,
    lastReading: { level: 28, charging: false, lowPower: true, measuredAt: '2026-11-15T10:00:00.000Z' },
    lastSeenAt: '2026-11-15T10:00:00.000Z',
  },
  anchor: { level: 28, charging: false, lowPower: true, measuredAt: '2026-11-15T10:00:00.000Z' },
  deviceLabel: 'iPhone',
  servedTo: [LECTEUR],
});

afterEach(() => {
  delete process.env.SECRETS_AT_REST_KEY;
});

describe('l\'épisode d\'un émetteur', () => {
  it('se relit tel qu\'il a été rangé, avec la durée de vie de 24 h', async () => {
    const cache = batteryCacheInMemory();
    await storeBatteryRecord(cache, EMETTEUR, record());

    expect(await readBatteryRecord(cache, EMETTEUR)).toEqual(record());
    expect([...cache.entries.values()][0].ttl).toBe(BATTERY_CONFIG.stateTtlSeconds);
  });

  it('est scellé : le niveau ne se lit pas en clair, et ne s\'ouvre pas sous la clé d\'un autre', async () => {
    process.env.SECRETS_AT_REST_KEY = KEY;
    const cache = batteryCacheInMemory();
    await storeBatteryRecord(cache, EMETTEUR, record());
    const [[, entry]] = [...cache.entries.entries()];

    expect(entry.value.startsWith('v1:')).toBe(true);
    expect(entry.value).not.toContain('iPhone');
    cache.entries.set(`battery:state:${AUTRE}`, entry);
    expect(await readBatteryRecord(cache, AUTRE)).toBeNull();
  });

  it('une valeur illisible vaut « rien », et l\'effacement retire l\'épisode', async () => {
    const cache = batteryCacheInMemory();
    cache.entries.set(`battery:state:${EMETTEUR}`, { value: '{"episode":{"phase":"boom"}}' });
    expect(await readBatteryRecord(cache, EMETTEUR)).toBeNull();

    await storeBatteryRecord(cache, EMETTEUR, record());
    await clearBatteryRecord(cache, EMETTEUR);
    expect(await readBatteryRecord(cache, EMETTEUR)).toBeNull();
  });
});

describe('la mémoire « a reçu le push critique »', () => {
  it('s\'accumule lecteur par lecteur, puis s\'oublie à la fin de l\'épisode', async () => {
    const cache = batteryCacheInMemory();
    await rememberCriticalReaders(cache, EMETTEUR, [LECTEUR]);
    await rememberCriticalReaders(cache, EMETTEUR, [AUTRE, LECTEUR]);

    expect([...(await readCriticalReaders(cache, EMETTEUR))].sort()).toEqual([AUTRE, LECTEUR].sort());
    await forgetCriticalReaders(cache, EMETTEUR);
    expect((await readCriticalReaders(cache, EMETTEUR)).size).toBe(0);
  });
});

describe('le relevé à la demande', () => {
  it('se réserve une fois par paire et par fenêtre de 5 min', async () => {
    const cache = batteryCacheInMemory();

    expect(await claimBatteryPull(cache, { emitterId: EMETTEUR, readerId: LECTEUR })).toBe(true);
    expect(await claimBatteryPull(cache, { emitterId: EMETTEUR, readerId: LECTEUR })).toBe(false);
    expect(await claimBatteryPull(cache, { emitterId: EMETTEUR, readerId: AUTRE })).toBe(true);
    expect([...cache.entries.entries()].find(([key]) => key.startsWith('battery:pull:'))?.[1].ttl).toBe(BATTERY_CONFIG.pullCooldownMinutes * 60);
  });
});

describe('l\'ensemble du balayage d\'extinction', () => {
  it('liste les émetteurs surveillés dans UN ensemble, jamais par motif de clés, et se retire', async () => {
    const cache = batteryCacheInMemory();
    await watchBatteryEmitter(cache, EMETTEUR, true);
    await watchBatteryEmitter(cache, AUTRE, true);
    await watchBatteryEmitter(cache, AUTRE, false);

    expect(await watchedBatteryEmitters(cache)).toEqual([EMETTEUR]);
    expect([...cache.sets.keys()]).toEqual(['battery:watched']);
    expect('keys' in cache).toBe(false);
  });
});

describe('le verrou d\'un émetteur', () => {
  it('sérialise deux pas qui se croisent, et se libère', async () => {
    const cache = batteryCacheInMemory();
    const ordre: string[] = [];
    await Promise.all([
      withBatteryLock(cache, EMETTEUR, async () => {
        ordre.push('a:début');
        await new Promise((resolve) => setTimeout(resolve, 30));
        ordre.push('a:fin');
      }),
      withBatteryLock(cache, EMETTEUR, async () => {
        ordre.push('b:début');
        ordre.push('b:fin');
      }),
    ]);

    expect(ordre).toEqual(['a:début', 'a:fin', 'b:début', 'b:fin']);
    expect(cache.entries.size).toBe(0);
  });
});
