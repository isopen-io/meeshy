import { describe, expect, test } from 'bun:test';

import type { ApiFailure } from '@/lib/api/http';

import { sendFailureReason } from './failure-reason';

const failure = (status: number, extra: Partial<ApiFailure> = {}): ApiFailure => ({
  ok: false,
  status,
  error: 'You are not a participant of this conversation',
  ...extra,
});

describe('sendFailureReason', () => {
  test('aucune erreur (échec HORS LIGNE) ⇒ aucune cause : le bandeau la dit déjà', () => {
    expect(sendFailureReason(undefined)).toBeUndefined();
  });

  test('la prose de la passerelle n’est JAMAIS servie telle quelle', () => {
    for (const status of [0, 401, 403, 429, 400, 500]) {
      expect(sendFailureReason(failure(status))).not.toContain('participant');
    }
  });

  test('chaque statut a sa cause, et le délai de garde se distingue du réseau', () => {
    expect(sendFailureReason(failure(0))).toBe('réseau indisponible');
    expect(sendFailureReason(failure(0, { code: 'TIMEOUT' }))).toBe('la passerelle n’a pas répondu');
    expect(sendFailureReason(failure(401))).toBe('session expirée — reconnectez-vous');
    expect(sendFailureReason(failure(403))).toBe('envoi refusé pour cette conversation');
    expect(sendFailureReason(failure(429))).toBe('trop de messages d’un coup — réessayez dans un instant');
    expect(sendFailureReason(failure(422))).toBe('message refusé');
    expect(sendFailureReason(failure(503))).toBe('la passerelle est indisponible');
  });

  /**
   * #5668 — la SEULE cause spécifique aux pièces jointes que ce client peut
   * VOIR : `UPLOAD_PARTIAL`, qu'il synthétise lui-même
   * (`perform-send.ts § uploadPhase`). Le `code`
   * `ATTACHMENT_RIGHT_NOT_PERMITTED` n'a PAS de branche ici — mesuré : la
   * route le lit pour choisir son statut puis appelle
   * `sendForbidden(reply, result.error)` sans `options.code`
   * (`messages-send.ts:364`), et `sendError` pose `code: undefined`
   * (`response.ts:89`), supprimé à la sérialisation. Un témoin écrit sur ce
   * code n'aurait mesuré que sa propre fixture.
   */
  test('UPLOAD_PARTIAL (statut 200 synthétique) ⇒ cause dédiée, jamais confondue avec un succès', () => {
    expect(sendFailureReason(failure(200, { code: 'UPLOAD_PARTIAL' }))).toBe('une pièce n’a pas pu être téléversée');
  });

  test('un 403 de la passerelle reste le refus générique — aucun code ne voyage avec lui', () => {
    expect(sendFailureReason(failure(403))).toBe('envoi refusé pour cette conversation');
    expect(sendFailureReason(failure(403, { code: 'ATTACHMENT_RIGHT_NOT_PERMITTED' }))).toBe(
      'envoi refusé pour cette conversation',
    );
  });
});
