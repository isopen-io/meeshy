import { describe, expect, test } from 'bun:test';

import { scriptedGateway, scriptedTransport } from '@/test-support/scripted-transport';

import { emailNotificationsFailureOf, loadEmailNotifications, saveEmailNotifications } from './email-notifications';

/**
 * LE DÉSABONNEMENT DES E-MAILS (#6715) — `notification.emailEnabled`, le seul
 * réglage que lisent les diffusions (`jobs/broadcast-sender.ts`), le digest
 * (`jobs/notification-digest.ts`) et les e-mails de notification
 * (`NotificationService`). Les alertes de sécurité n'en dépendent pas.
 */

const LOAD = 'GET /api/v1/me/preferences?fields=notification.emailEnabled';
const SAVE = 'PATCH /api/v1/me/preferences';

describe('loadEmailNotifications — GET /me/preferences', () => {
  test('ne demande que ce réglage', async () => {
    const { deps, calls } = scriptedGateway({ [LOAD]: { ok: true, data: { notification: { emailEnabled: false } } } });

    expect(await loadEmailNotifications(deps)).toEqual({ ok: true, data: false });
    expect(calls()).toEqual([{ method: 'GET', path: '/api/v1/me/preferences?fields=notification.emailEnabled' }]);
  });

  test('une valeur illisible est un échec, jamais « abonné » par défaut', async () => {
    const { deps } = scriptedGateway({ [LOAD]: { ok: true, data: { notification: {} } } });
    const result = await loadEmailNotifications(deps);
    expect(result.ok ? null : result.code).toBe('UNREADABLE');
  });
});

describe('saveEmailNotifications — PATCH /me/preferences', () => {
  test('n’écrit que ce réglage, et rend la valeur que la passerelle a gardée', async () => {
    const { deps, calls } = scriptedGateway({
      [SAVE]: { ok: true, data: { notification: { emailEnabled: false, pushEnabled: true, soundEnabled: true } } },
    });

    expect(await saveEmailNotifications(deps, false)).toEqual({ ok: true, data: false });
    expect(calls()).toEqual([{ method: 'PATCH', path: '/api/v1/me/preferences', body: { notification: { emailEnabled: false } } }]);
  });

  test('les fixtures ne touchent pas le réseau', async () => {
    const { transport, calls } = scriptedTransport({});
    const deps = { source: 'fixtures' as const, transport };
    expect(await loadEmailNotifications(deps)).toEqual({ ok: true, data: true });
    expect(await saveEmailNotifications(deps, false)).toEqual({ ok: true, data: false });
    expect(calls()).toEqual([]);
  });
});

describe('emailNotificationsFailureOf', () => {
  test('sans session, hors ligne, panne', () => {
    expect(emailNotificationsFailureOf({ ok: false, status: 401, error: 'x' })).toBe('signed-out');
    expect(emailNotificationsFailureOf({ ok: false, status: 0, error: 'x' })).toBe('offline');
    expect(emailNotificationsFailureOf({ ok: false, status: 500, error: 'x' })).toBe('unavailable');
  });
});
