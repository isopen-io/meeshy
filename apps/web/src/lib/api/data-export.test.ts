import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { FileDeliveryHost } from '@/lib/media/file-delivery-host';
import { scriptedGateway, scriptedTransport } from '@/test-support/scripted-transport';

import { deliverJsonFile, exportFileName, requestDataExport } from './data-export';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

/**
 * L'EXPORT DE DONNÉES (#6725) — `GET /me/export`, servie et testée côté
 * gateway depuis #3633. Ce port ne revalide pas la forme des dix sections :
 * il vérifie une date lisible et restitue le reste tel que servi, pour que
 * le fichier téléchargé ne perde rien de ce que la route a produit.
 */

const REQUEST = 'GET /api/v1/me/export?format=json';

describe('requestDataExport — GET /me/export', () => {
  test('demande le JSON complet, et restitue la charge telle que servie', async () => {
    const served = { exportDate: '2026-09-16T08:00:00.000Z', format: 'json', requestedTypes: ['profile'], profile: { username: 'awa' } };
    const { deps, calls } = scriptedGateway({ [REQUEST]: { ok: true, data: served } });

    const result = await requestDataExport(deps);

    expect(result).toEqual({ ok: true, data: { raw: served, exportDate: '2026-09-16T08:00:00.000Z' } });
    expect(calls()).toEqual([{ method: 'GET', path: '/api/v1/me/export?format=json' }]);
  });

  test('sans date lisible, un échec nommé — jamais une charge devinée', async () => {
    const { deps } = scriptedGateway({ [REQUEST]: { ok: true, data: { format: 'json' } } });
    const result = await requestDataExport(deps);
    expect(result.ok ? null : result.code).toBe('UNREADABLE');
  });

  test('un échec réseau traverse tel quel', async () => {
    const { deps } = scriptedGateway({ [REQUEST]: { ok: false, status: 0, error: 'x' } });
    expect(await requestDataExport(deps)).toEqual({ ok: false, status: 0, error: 'x' });
  });

  test('les fixtures ne touchent pas le réseau', async () => {
    const { transport, calls } = scriptedTransport({});
    const deps = { source: 'fixtures' as const, transport };
    const result = await requestDataExport(deps);
    expect(result.ok).toBe(true);
    expect(calls()).toEqual([]);
  });
});

describe('exportFileName', () => {
  test('date le fichier au jour de l’export, sans heure', () => {
    expect(exportFileName('2026-09-16T08:00:00.000Z')).toBe('meeshy-export-2026-09-16.json');
  });

  test('une date illisible se replie sur les dix premiers caractères — jamais une levée', () => {
    expect(exportFileName('pas-une-date')).toBe('meeshy-export-pas-une-da.json');
  });
});

/**
 * L'export passe par le portail de livraison (#7864) : la coque Android n'a
 * que le pont `MeeshyShare.shareFile`, et l'ancre `<a download>` n'y fait rien.
 */
describe('deliverJsonFile', () => {
  test('une coque sans ancre livre le JSON par le partage de fichier', async () => {
    const shared: File[] = [];
    const host: FileDeliveryHost = {
      canShareFiles: ({ files }) => files.length === 1,
      shareFiles: async ({ files }) => {
        shared.push(...files);
      },
    };

    const outcome = await deliverJsonFile('meeshy-export-2026-09-16.json', '{"a":1}', host);

    expect(outcome).toBe('delivered');
    expect(shared.map((file) => [file.name, file.type])).toEqual([['meeshy-export-2026-09-16.json', 'application/json']]);
    expect(await shared[0]?.text()).toBe('{"a":1}');
  });

  test('un hôte sans porte rend « indisponible », jamais « livré »', async () => {
    expect(await deliverJsonFile('meeshy-export-2026-09-16.json', '{"a":1}', {})).toBe('unavailable');
  });
});
