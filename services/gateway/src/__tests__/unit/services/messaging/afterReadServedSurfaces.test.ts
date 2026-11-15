/**
 * Flamme-œil (#8302) — ce que chaque surface SERT d'un message sans durée
 * dont `Message.expiresAt` porte le plafond de rétention.
 *
 * La colonne est une heure INTERNE de destruction : la servir afficherait
 * « disparaît dans 7 jours » sous une flamme. Chaque surface qui sert un
 * éphémère à durée sans sa colonne doit servir la flamme-œil de même, et la
 * protection (bannière, aperçu, push) doit la traiter en éphémère.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { buildMessageNewPayload } from '../../../../socketio/messageNewPayload';
import { mapMessageProtectionFields } from '../../../../routes/conversations/messageProtectionProjection';
import {
  isEphemeralServableToReader,
  loadEphemeralReaderDeadlines,
} from '../../../../routes/conversations/ephemeralReaderDeadlines';
import { protectedPreview } from '../../../../services/notifications/notification-preview';
import { ephemeralPushFields } from '../../../../services/notifications/ephemeralPushFields';

const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;
const SENT_AT = new Date('2026-09-27T10:00:00.000Z');
const RETENTION = new Date('2026-10-04T10:00:00.000Z');
const CONSUMED = new Date('2026-09-27T10:05:00.000Z');
const READER = 'reader-participant';
const SENDER = 'sender-participant';

const flameRow = {
  isViewOnce: false,
  maxViewOnceCount: null,
  viewOnceCount: 0,
  isBlurred: false,
  effectFlags: AFTER_READ,
  expiresAt: RETENTION,
  ephemeralDuration: null,
};

describe('flamme-œil — surfaces servies (#8302)', () => {
  it('message:new ne porte pas le plafond de rétention', () => {
    const payload = buildMessageNewPayload(
      { id: 'm1', content: 'secret', effectFlags: AFTER_READ, expiresAt: RETENTION, ephemeralDuration: null, createdAt: SENT_AT } as never,
      { conversationId: 'c1', translations: [], attachments: [] } as never,
    );

    expect(payload.effectFlags).toBe(AFTER_READ);
    expect(payload.expiresAt).toBeUndefined();
  });

  it("REST sert au lecteur l'instant de SA consommation, et rien avant", () => {
    const before = mapMessageProtectionFields(flameRow as never, { isSender: false, readerDeadline: null, latestRecipientDeadline: null });
    const after = mapMessageProtectionFields(flameRow as never, { isSender: false, readerDeadline: CONSUMED, latestRecipientDeadline: CONSUMED });

    expect(before.expiresAt).toBeNull();
    expect(after.expiresAt).toEqual(CONSUMED);
    expect(after.effectFlags).toBe(AFTER_READ);
  });

  it("REST ne sert rien à l'expéditeur : il garde la bulle", () => {
    const served = mapMessageProtectionFields(flameRow as never, { isSender: true, readerDeadline: null, latestRecipientDeadline: CONSUMED });
    expect(served.expiresAt).toBeNull();
  });

  it('les échéances du fil se chargent pour une flamme-œil, et coupent le service une heure après', async () => {
    const prisma = {
      messageStatusEntry: {
        findMany: async () => [{ messageId: 'm1', participantId: READER, ephemeralExpiresAt: CONSUMED }],
      },
    };
    const message = { id: 'm1', senderId: SENDER, ephemeralDuration: null, effectFlags: AFTER_READ, expiresAt: RETENTION };

    const deadlines = await loadEphemeralReaderDeadlines(prisma as never, [message], READER);

    expect(deadlines.get('m1')).toEqual({ isSender: false, readerDeadline: CONSUMED, latestRecipientDeadline: CONSUMED });
    expect(isEphemeralServableToReader(message, deadlines.get('m1'), new Date(CONSUMED.getTime() + 59 * 60_000))).toBe(true);
    expect(isEphemeralServableToReader(message, deadlines.get('m1'), new Date(CONSUMED.getTime() + 60 * 60_000))).toBe(false);
  });

  it("la bannière la protège en éphémère, sans durée inventée", () => {
    expect(
      protectedPreview({ messageType: 'text', effectFlags: AFTER_READ, expiresAt: RETENTION }),
    ).toEqual({ preview: expect.not.stringMatching(/\dj$/), locKey: 'notification.ephemeral_message' });
  });

  it('le push dit à la NSE que la bulle est éphémère, sans durée', () => {
    expect(ephemeralPushFields({ ephemeralDuration: null, effectFlags: AFTER_READ })).toEqual({ effectFlags: String(AFTER_READ) });
  });
});
