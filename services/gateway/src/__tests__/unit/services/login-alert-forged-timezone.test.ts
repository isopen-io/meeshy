/**
 * Audit L2-1 (élevée) — **un fuseau forgé ne fait plus taire l'alerte
 * « nouvelle connexion ».**
 *
 * `X-Meeshy-Timezone: Foo/Bar` était recopié brut par `mergeClientHeaders`,
 * puis `toLocaleString(locale, { timeZone })` levait une `RangeError` dans la
 * composition de l'alerte, et le `.catch` du login l'avalait : un voleur de mot
 * de passe éteignait l'alerte avec un en-tête. Le fuseau se valide désormais au
 * point d'entrée (`Intl.DateTimeFormat`), et la composition ne peut plus lever
 * à cause d'un fuseau : au pire, la date part en UTC.
 *
 * Et L2-8 — un champ texte client (modèle, nom d'appareil) est nettoyé partout,
 * contrôles bidirectionnels compris.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { mergeClientHeaders } from '../../../services/GeoIPService';
import { createLoginNewDeviceNotification } from '../../../services/notifications/builders/account-security';
import { formatInTimeZone } from '../../../utils/time-zone-format';

const AT = new Date('2026-10-08T12:34:00.000Z');

describe('formatInTimeZone', () => {
  it('formate dans le fuseau demandé', () => {
    expect(formatInTimeZone(AT, 'fr-FR', 'Asia/Tokyo', { timeStyle: 'short' })).toBe('21:34');
  });

  it('un fuseau inconnu ne lève pas : la date part en UTC', () => {
    expect(() => formatInTimeZone(AT, 'fr-FR', 'Foo/Bar', { timeStyle: 'short' })).not.toThrow();
    expect(formatInTimeZone(AT, 'fr-FR', 'Foo/Bar', { timeStyle: 'short' })).toBe('12:34');
  });

  it('pas de fuseau : UTC', () => {
    expect(formatInTimeZone(AT, 'fr-FR', null, { timeStyle: 'short' })).toBe('12:34');
  });
});

describe('mergeClientHeaders — le relevé nettoyé, jamais l’en-tête brut', () => {
  it('un fuseau forgé n’entre pas dans le contexte', () => {
    const { geoData } = mergeClientHeaders(null, null, { 'x-meeshy-timezone': 'Foo/Bar' });
    expect(geoData?.timezone ?? null).toBeNull();
  });

  it('un fuseau réel entre', () => {
    const { geoData } = mergeClientHeaders(null, null, { 'x-meeshy-timezone': 'Europe/Paris' });
    expect(geoData?.timezone).toBe('Europe/Paris');
  });

  it('le modèle déclaré est borné et débarrassé des contrôles, bidirectionnels compris', () => {
    const { deviceInfo } = mergeClientHeaders(null, null, { 'x-meeshy-device': `iPhone‮16,1\u0007${'x'.repeat(300)}` });
    expect(deviceInfo?.model).not.toMatch(/[‮\u0007]/);
    expect(deviceInfo?.model?.length).toBeLessThanOrEqual(64);
    expect(deviceInfo?.model?.startsWith('iPhone16,1')).toBe(true);
  });
});

describe('createLoginNewDeviceNotification — un fuseau forgé ne tait pas l’alerte', () => {
  it('l’alerte part, datée en UTC', async () => {
    const createNotification = jest.fn(async (_input: unknown) => ({ id: 'n-1' }));
    const deps = {
      prisma: { user: { findUnique: jest.fn(async () => null) } },
      createNotification,
    };

    await expect(createLoginNewDeviceNotification(deps as never, {
      recipientUserId: 'u-1',
      deviceInfo: { type: 'mobile', vendor: 'Apple', model: 'iPhone', os: 'iOS' },
      ipAddress: '5.5.5.5',
      geoData: { country: 'DE', city: 'Berlin', timezone: 'Foo/Bar' },
    })).resolves.toBeDefined();

    expect(createNotification).toHaveBeenCalledTimes(1);
    const sent = createNotification.mock.calls[0][0] as { content: string; _loginAlertData: { timezone: string | null } };
    expect(sent.content).toMatch(/\d/);
    expect(sent._loginAlertData.timezone).toBe('UTC');
  });
});
