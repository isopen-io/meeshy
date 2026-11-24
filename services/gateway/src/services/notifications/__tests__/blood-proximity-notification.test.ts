/**
 * « Quand un Sang s'approche » (#20540) — la préférence `notification.bloodProximityEnabled`
 * gouverne `blood_proximity` (absente = reçue), le blocage le refuse dans les deux sens, et la
 * charge `data` du push porte l'autre Sang sous `userId`, rien d'autre de propre au type.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { NOTIFICATION_PREFERENCE_DEFAULTS, type NotificationPreference } from '@meeshy/shared/types/preferences';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isNotificationTypeEnabledByPreference } from '../type-preference';
import { ACTOR_CONTENT_TYPES, refusesActorContent } from '../blocked-actor-content';
import { metadataPushFields } from '../push-metadata-fields';

const prefs = (over: Partial<NotificationPreference>): NotificationPreference => ({ ...NOTIFICATION_PREFERENCE_DEFAULTS, ...over });
const LINA = '6400000000000000000000b1';
const MOI = '6400000000000000000000a1';

describe('notification.bloodProximityEnabled', () => {
  it('coupée, elle ferme blood_proximity, et rien d\'autre', () => {
    const off = prefs({ bloodProximityEnabled: false });
    expect(isNotificationTypeEnabledByPreference(off, 'blood_proximity')).toBe(false);
    for (const type of ['contact_recently_active', 'location_share_started', 'new_message'] as const) {
      expect(isNotificationTypeEnabledByPreference(off, type)).toBe(true);
    }
  });

  it('activée par défaut, et ABSENTE d\'un document antérieur : reçue', () => {
    expect(isNotificationTypeEnabledByPreference(prefs({}), 'blood_proximity')).toBe(true);
    const legacy = { ...prefs({}), bloodProximityEnabled: undefined } as unknown as NotificationPreference;
    expect(isNotificationTypeEnabledByPreference(legacy, 'blood_proximity')).toBe(true);
  });
});

describe('blood_proximity et le blocage', () => {
  it('rangée parmi les contenus d\'acteur : refusée entre bloqués, et refusée sans acteur', async () => {
    expect(ACTOR_CONTENT_TYPES.has('blood_proximity')).toBe(true);
    await expect(refusesActorContent({} as PrismaClient, { type: 'blood_proximity', recipientId: MOI, actorId: undefined })).resolves.toBe(true);
  });
});

describe('la charge data du push', () => {
  it('blood_proximity porte userId, l\'autre Sang — jamais la distance ni une coordonnée', () => {
    const fields = metadataPushFields({ type: 'blood_proximity', metadata: { action: 'view_profile', userId: LINA, distanceMeters: 300 }, showPreview: true });
    expect(fields).toEqual({ userId: LINA });
    expect(metadataPushFields({ type: 'blood_proximity', metadata: { userId: LINA, distanceMeters: 300 }, showPreview: false })).toEqual({ userId: LINA });
  });

  it('un autre type n\'en reçoit rien, et le retrait de contenu garde ses clés', () => {
    expect(metadataPushFields({ type: 'contact_recently_active', metadata: { userId: LINA }, showPreview: true })).toEqual({});
    expect(metadataPushFields({ type: 'content_removed', metadata: { contentType: 'post', contentId: 'p1', reason: 'spam' }, showPreview: false })).toEqual({ contentType: 'post', contentId: 'p1' });
  });

  it('sans userId lisible, aucune clé', () => {
    expect(metadataPushFields({ type: 'blood_proximity', metadata: { distanceMeters: 300 }, showPreview: true })).toEqual({});
  });
});
