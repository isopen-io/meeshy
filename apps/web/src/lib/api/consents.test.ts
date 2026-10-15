import { describe, expect, test } from 'bun:test';

import { decodeGrantedConsents, loadGrantedConsents } from './consents';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * `GET /me/consents` (`services/gateway/src/routes/me/consents.ts`) — le web
 * n'en garde que les `purpose` ACCORDÉS par la passerelle, miroir de
 * `UserPreferencesManager.grantedConsents` (iOS). Rien d'autre n'entre dans
 * le cache persisté : ni date, ni version de politique, ni bloc dérivé.
 */

const entry = (purpose: string, granted: boolean) =>
  granted
    ? { purpose, granted, grantedAt: '2026-10-01T00:00:00.000Z', policyVersion: '2026-08-30', source: 'server' }
    : { purpose, granted, revokedAt: null, policyVersion: '2026-08-30', source: 'server' };

const served = (consents: readonly unknown[]) => ({
  consents,
  gameConsents: [entry('public-league', true)],
  derived: { canTranscribeAudio: true, canTranslateAudio: false, canUseVoiceCloning: false, canCollectAnalytics: true },
});

describe('decodeGrantedConsents — les purpose accordés, et eux seuls', () => {
  test('ne garde que les purpose accordés', () => {
    expect(decodeGrantedConsents(served([entry('data-processing', true), entry('analytics', true), entry('voice-data', false)]))).toEqual([
      'data-processing',
      'analytics',
    ]);
  });

  test('un purpose inconnu (serveur plus récent) est ignoré, la liste reste lisible', () => {
    expect(decodeGrantedConsents(served([entry('analytics', true), entry('purpose-de-demain', true)]))).toEqual(['analytics']);
  });

  test('les consentements du jeu ne se mêlent pas à la liste', () => {
    expect(decodeGrantedConsents(served([entry('analytics', false)]))).toEqual([]);
  });

  test('une charge mal formée est illisible, jamais un accord deviné', () => {
    expect(decodeGrantedConsents({ consents: [{ purpose: 'analytics', granted: 'oui' }] })).toBeNull();
    expect(decodeGrantedConsents({})).toBeNull();
    expect(decodeGrantedConsents(null)).toBeNull();
  });
});

describe('loadGrantedConsents — une lecture de /me/consents', () => {
  const transportAnswering = (answer: ApiResult<unknown>) => {
    const calls: HttpRequest[] = [];
    const transport = {
      request: async (request: HttpRequest) => {
        calls.push(request);
        return answer;
      },
    } as unknown as HttpTransport;
    return { calls, transport };
  };

  test('lit GET /api/v1/me/consents et rend les purpose accordés', async () => {
    const { calls, transport } = transportAnswering({ ok: true, data: served([entry('analytics', true)]) });
    expect(await loadGrantedConsents({ transport })).toEqual({ ok: true, data: ['analytics'] });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.path).toBe('/api/v1/me/consents');
  });

  test('une charge illisible est un ÉCHEC', async () => {
    const { transport } = transportAnswering({ ok: true, data: { consents: 'non' } });
    expect((await loadGrantedConsents({ transport })).ok).toBe(false);
  });

  test('un refus de la passerelle remonte tel quel', async () => {
    const refusal: ApiResult<unknown> = { ok: false, status: 503, error: 'Indisponible' };
    const { transport } = transportAnswering(refusal);
    expect(await loadGrantedConsents({ transport })).toEqual(refusal);
  });
});
