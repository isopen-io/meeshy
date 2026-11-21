import { describe, expect, test } from 'bun:test';

import { createPillAnnouncementStore } from '@/lib/view/sync-pill-announcements';

import { announcePhoneCallOnPill } from './phone-call-pill';

/**
 * « EN APPEL » SUR LA PASTILLE (#18753) — ni alarme ni rouge : être en appel n'est pas une alerte. Une annonce de la
 * même personne remplace celle qui attend. La pastille ne range rien et ne persiste jamais.
 */

const T0 = 1_700_000_000_000;
const JACQUES = 'b'.repeat(24);

describe('« en appel » sur la pastille', () => {
  test('le début se dit sur le ton neutre, avec le combiné', () => {
    const store = createPillAnnouncementStore();
    announcePhoneCallOnPill({ store, userId: JACQUES, text: 'Jacques est en appel', kind: 'started', now: T0 });
    expect(store.getState().queue).toEqual([
      { id: `call:${JACQUES}:started:${T0}`, key: `call:${JACQUES}`, text: 'Jacques est en appel', tone: 'good', icon: { kind: 'call', active: true }, at: T0 },
    ]);
  });

  test('la fin remplace le début qui attend', () => {
    const store = createPillAnnouncementStore();
    announcePhoneCallOnPill({ store, userId: JACQUES, text: 'Jacques est en appel', kind: 'started', now: T0 });
    announcePhoneCallOnPill({ store, userId: JACQUES, text: 'Jacques a raccroché', kind: 'ended', now: T0 + 1 });
    expect(store.getState().queue.map((entry) => [entry.text, entry.icon])).toEqual([['Jacques a raccroché', { kind: 'call', active: false }]]);
  });
});
