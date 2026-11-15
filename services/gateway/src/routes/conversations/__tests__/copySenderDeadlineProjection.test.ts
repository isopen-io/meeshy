/**
 * #9588 — l'expéditeur d'une COPIE transférée reçoit une échéance.
 *
 * La copie d'une flamme à durée porte durée ET après lecture. La branche
 * flamme-œil de `servedEphemeralExpiresAt` ne servait rien à l'expéditeur :
 * il gardait la bulle jusqu'à la destruction, sept jours quand personne ne
 * lisait. La projection des listes remet désormais l'heure d'envoi à la loi.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { EPHEMERAL_UNAVAILABILITY_GRACE_MS } from '@meeshy/shared/utils/ephemeral-countdown';

import { mapMessageProtectionFields } from '../messageProtectionProjection';

const SENT_AT = new Date('2026-10-07T10:00:00.000Z');
const DURATION = 30;
const COPY = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;
const LATE_DEADLINE = new Date(SENT_AT.getTime() + 50 * 60 * 1000);

const copyRow = {
  effectFlags: COPY,
  ephemeralDuration: DURATION,
  createdAt: SENT_AT,
  expiresAt: new Date(LATE_DEADLINE.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS),
};

describe('mapMessageProtectionFields — la copie bornée (#9588)', () => {
  it('sert à l’expéditeur « envoi + durée », même quand un destinataire a reçu tard', () => {
    const served = mapMessageProtectionFields(copyRow, {
      isSender: true,
      readerDeadline: null,
      latestRecipientDeadline: LATE_DEADLINE,
    });

    expect(served.expiresAt).toEqual(new Date(SENT_AT.getTime() + DURATION * 1000));
  });

  it('sert au destinataire son propre décompte', () => {
    const served = mapMessageProtectionFields(copyRow, {
      isSender: false,
      readerDeadline: LATE_DEADLINE,
      latestRecipientDeadline: LATE_DEADLINE,
    });

    expect(served.expiresAt).toEqual(LATE_DEADLINE);
  });

  it('ne sert ni l’heure d’envoi ni une clé de plus dans la projection', () => {
    const served = mapMessageProtectionFields(copyRow, { isSender: true, readerDeadline: null, latestRecipientDeadline: null });

    expect(Object.keys(served)).not.toContain('createdAt');
  });
});
