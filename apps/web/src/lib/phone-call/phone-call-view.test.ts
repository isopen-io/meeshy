import { beforeAll, describe, expect, test } from 'bun:test';

import { loadPhoneCallCatalog } from '@/lib/i18n-phone-call-catalog';

import { phoneCallAnnouncementText, phoneCallHeadline } from './phone-call-view';

/**
 * CE QU’« EN APPEL » DIT (#18753) — « En appel depuis 12 min » tant que l’appel a moins d’une heure, puis « En appel
 * depuis 14:00 » à l’horloge LOCALE du lecteur ; la pastille dit « Jacques est en appel » / « Jacques a raccroché ».
 * Jamais d’interlocuteur.
 */

const PARIS = { timeZone: 'Europe/Paris' } as const;
const SINCE = '2026-11-19T13:00:00.000Z';
const at = (iso: string): number => Date.parse(iso);

beforeAll(async () => {
  await loadPhoneCallCatalog('fr');
  await loadPhoneCallCatalog('en');
});

describe('phoneCallHeadline', () => {
  test('moins d’une heure : la durée en minutes', () => {
    expect(phoneCallHeadline({ since: SINCE }, 'fr', { now: at('2026-11-19T13:12:40.000Z'), ...PARIS })).toBe('En appel depuis 12 min');
  });

  test('un appel tout juste commencé dit « 1 min », jamais « 0 min »', () => {
    expect(phoneCallHeadline({ since: SINCE }, 'fr', { now: at('2026-11-19T13:00:20.000Z'), ...PARIS })).toBe('En appel depuis 1 min');
  });

  test('une heure et plus : l’heure locale du début', () => {
    expect(phoneCallHeadline({ since: SINCE }, 'fr', { now: at('2026-11-19T14:00:00.000Z'), ...PARIS })).toBe('En appel depuis 14:00');
    expect(phoneCallHeadline({ since: SINCE }, 'en', { now: at('2026-11-19T15:30:00.000Z'), timeZone: 'America/New_York' })).toBe('On a call since 08:00 AM');
  });
});

describe('phoneCallAnnouncementText', () => {
  test('le début et la fin, nommés', () => {
    expect(phoneCallAnnouncementText('fr', { name: 'Jacques', announcement: { kind: 'started', at: SINCE } })).toBe('Jacques est en appel');
    expect(phoneCallAnnouncementText('fr', { name: 'Jacques', announcement: { kind: 'ended', at: SINCE } })).toBe('Jacques a raccroché');
  });

  test('sans nom connu, un Sang', () => {
    expect(phoneCallAnnouncementText('fr', { name: null, announcement: { kind: 'started', at: SINCE } })).toBe('Un Sang est en appel');
    expect(phoneCallAnnouncementText('fr', { name: null, announcement: { kind: 'ended', at: SINCE } })).toBe('Un Sang a raccroché');
  });
});
