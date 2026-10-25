import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { decodeE2eeDevice, loadE2eeDevices, retireE2eeDevice } from './e2ee-devices';

/**
 * LE PORT DE « MES APPAREILS CHIFFRÉS » (#13013) — `GET /e2ee/devices` et
 * `DELETE /e2ee/devices/:deviceId`. Le décodage est construit champ par champ :
 * rien de ce que la passerelle ajouterait (une clé, une session) ne traverse.
 */

const wire = (overrides: Record<string, unknown> = {}) => ({
  deviceId: 2,
  platform: 'ios',
  label: 'iPhone de Awa',
  enrolledAt: '2026-10-20T09:00:00.000Z',
  lastSeenAt: '2026-10-25T08:00:00.000Z',
  current: false,
  registrationId: 4242,
  ...overrides,
});

function recordingTransport(result: ApiResult<unknown>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => result) as unknown as HttpTransport;
  transport.request = (async (request: HttpRequest) => {
    requests.push(request);
    return result;
  }) as HttpTransport['request'];
  return { transport, requests };
}

describe('le décodage', () => {
  test('ne garde que les champs de l’écran, jamais ce qui voyage à côté', () => {
    const device = decodeE2eeDevice(wire({ identityKey: 'BXk=', sessionId: 'c3'.repeat(12) }));
    expect(device).toEqual({
      deviceId: 2,
      platform: 'ios',
      label: 'iPhone de Awa',
      enrolledAt: '2026-10-20T09:00:00.000Z',
      lastSeenAt: '2026-10-25T08:00:00.000Z',
      current: false,
    });
  });

  test('une plateforme hors contrat ne s’invente pas, un nom vide se tait', () => {
    expect(decodeE2eeDevice(wire({ platform: 'toaster', label: '   ' }))).toMatchObject({ platform: null, label: null });
    expect(decodeE2eeDevice(wire({ platform: 'unknown' }))?.platform).toBeNull();
  });

  test('un nom déclaré perd ses caractères de contrôle et de renversement d’orientation', () => {
    expect(decodeE2eeDevice(wire({ label: 'iPhone\u202E de Awa\u0007' }))?.label).toBe('iPhone de Awa');
  });

  test('une ligne sans numéro d’appareil valide est écartée', () => {
    expect(decodeE2eeDevice(wire({ deviceId: 0 }))).toBeNull();
    expect(decodeE2eeDevice(wire({ deviceId: 'deux' }))).toBeNull();
  });
});

describe('les appels', () => {
  test('la lecture vise GET /api/v1/e2ee/devices et rend la liste décodée', async () => {
    const { transport, requests } = recordingTransport({ ok: true, status: 200, data: { devices: [wire(), wire({ deviceId: 'x' })] } });
    const result = await loadE2eeDevices({ source: 'gateway', transport });
    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual(['GET /api/v1/e2ee/devices']);
    expect(result.ok && result.data.map((device) => device.deviceId)).toEqual([2]);
  });

  test('le retrait vise DELETE /api/v1/e2ee/devices/:deviceId', async () => {
    const { transport, requests } = recordingTransport({ ok: true, status: 200, data: { deviceId: 2, retired: true } });
    await retireE2eeDevice({ source: 'gateway', transport }, 2);
    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual(['DELETE /api/v1/e2ee/devices/2']);
  });
});
