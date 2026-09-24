import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { scriptedGateway, scriptedTransport } from '@/test-support/scripted-transport';

import { downloadJsonFile, exportFileName, requestDataExport } from './data-export';

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

describe('downloadJsonFile', () => {
  test('crée un lien de téléchargement, le déclenche, puis nettoie ses traces', () => {
    const clicked: string[] = [];
    const anchor = document.createElement('a');
    const originalClick = anchor.click.bind(anchor);
    anchor.click = () => {
      clicked.push(anchor.download);
      originalClick();
    };
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = ((tag: string) => (tag === 'a' ? anchor : originalCreateElement(tag))) as typeof document.createElement;

    try {
      downloadJsonFile('meeshy-export-2026-09-16.json', '{"a":1}');
      expect(clicked).toEqual(['meeshy-export-2026-09-16.json']);
      expect(document.body.contains(anchor)).toBe(false);
    } finally {
      document.createElement = originalCreateElement;
    }
  });
});
