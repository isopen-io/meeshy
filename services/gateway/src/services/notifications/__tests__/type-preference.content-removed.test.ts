/**
 * `content_removed` (#11149) — l'auteur apprend qu'un administrateur a retiré son
 * contenu et pourquoi. Aucun réglage de type ne le coupe, comme les alertes de
 * sécurité : c'est le seul endroit où le motif lui parvient.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { NOTIFICATION_PREFERENCE_DEFAULTS, type NotificationPreference } from '@meeshy/shared/types/preferences';
import { isNotificationTypeEnabledByPreference } from '../type-preference';

describe('content_removed', () => {
  it('reste reçu quand toutes les préférences de type sont coupées', () => {
    const allOff = Object.fromEntries(
      Object.entries(NOTIFICATION_PREFERENCE_DEFAULTS).map(([key, value]) => [key, typeof value === 'boolean' ? false : value]),
    ) as unknown as NotificationPreference;

    expect(isNotificationTypeEnabledByPreference(allOff, 'content_removed')).toBe(true);
  });
});
