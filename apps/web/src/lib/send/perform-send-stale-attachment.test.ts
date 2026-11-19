import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';

import { pendingAttachmentOf } from './attachments';
import { createOutboxStore, entriesOf, type OutboxState } from './outbox-store';
import { performSend, retrySend, type SendDeps } from './perform-send';

/**
 * UNE PIÈCE JOINTE BALAYÉE NE DOIT PAS BLOQUER SON ENVOI À VIE (#19865) —
 * relevé par l'audit adversarial de #19801 (constat A1).
 */
describe('performSend — la pièce jointe que la passerelle ne trouve plus (#19865)', () => {
  test('un 404 ATTACHMENT_NOT_FOUND fait OUBLIER les ids, et la reprise re-téléverse', async () => {
    expect(true).toBe(false);
  });
});
