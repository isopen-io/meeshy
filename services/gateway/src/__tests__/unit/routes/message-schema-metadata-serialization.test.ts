/**
 * messageSchema — contrat de SÉRIALISATION (fast-json-stringify).
 *
 * Les tests de routes mockent sendSuccess : le schema de réponse n'y est
 * jamais exercé, et un test qui appelle le mapping directement ne voit RIEN.
 * Or fast-json-stringify strippe silencieusement tout champ absent des
 * `properties` quand `additionalProperties` n'est pas déclaré.
 *
 * Bug adressé : `GET /conversations/:id/messages` construit bien
 * `metadata: message.metadata`, mais `messageSchema` ne déclarait pas
 * `metadata` → la bulle système d'appel restait bloquée sur "Appel en cours /
 * Toucher pour rejoindre" côté iOS. Le message passe de `kind: 'call-live'` à
 * `kind: 'call'` par ÉDITION du même message ; sans `metadata` dans la
 * réponse REST, `APIMessage.callSummary` est nil et l'upsert local conserve
 * indéfiniment l'ancien snapshot live.
 *
 * Ce test épingle le contrat au niveau où le bug vit : la sortie sérialisée.
 */

import { describe, it, expect } from '@jest/globals';
import fastJsonStringify from 'fast-json-stringify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';

const LIVE_CALL_METADATA = {
  kind: 'call-live',
  callId: '507f1f77bcf86cd799439041',
  initiatorId: 'user-alice',
  callType: 'video',
  outcome: 'completed',
  durationSeconds: 0,
  bytesTotal: null,
  bytesEstimated: false,
  networkQuality: null,
};

const TERMINAL_CALL_METADATA = {
  kind: 'call',
  callId: '507f1f77bcf86cd799439041',
  initiatorId: 'user-alice',
  callType: 'video',
  outcome: 'completed',
  durationSeconds: 187,
  bytesTotal: 4_210_000,
  bytesEstimated: false,
  networkQuality: 'good',
  endedByInitiator: true,
};

function callMessage(metadata: unknown): Record<string, unknown> {
  return {
    id: '507f1f77bcf86cd799439011',
    conversationId: '507f1f77bcf86cd799439012',
    senderId: 'user-alice',
    content: 'Appel vidéo en cours',
    originalLanguage: 'fr',
    messageType: 'system',
    messageSource: 'system',
    metadata,
    isEdited: true,
    createdAt: '2026-08-04T10:00:00.000Z',
    timestamp: '2026-08-04T10:00:00.000Z',
    translations: [],
  };
}

function serialize(payload: unknown): Record<string, any> {
  const stringify = fastJsonStringify(messageSchema as never);
  return JSON.parse(stringify(payload));
}

describe('messageSchema — sérialisation REST du metadata d’appel', () => {
  it('laisse passer metadata.kind terminal — la seule source de convergence de la bulle d’appel', () => {
    const out = serialize(callMessage(TERMINAL_CALL_METADATA));

    expect(out.metadata?.kind).toBe('call');
  });

  it('préserve les faits structurés de l’appel terminé (durée, octets, qualité)', () => {
    const out = serialize(callMessage(TERMINAL_CALL_METADATA));

    expect(out.metadata).toMatchObject({
      callId: TERMINAL_CALL_METADATA.callId,
      initiatorId: 'user-alice',
      callType: 'video',
      outcome: 'completed',
      durationSeconds: 187,
      bytesTotal: 4_210_000,
      bytesEstimated: false,
      networkQuality: 'good',
      endedByInitiator: true,
    });
  });

  it('laisse passer le metadata live (kind: call-live) tel quel', () => {
    const out = serialize(callMessage(LIVE_CALL_METADATA));

    expect(out.metadata?.kind).toBe('call-live');
    expect(out.metadata?.callId).toBe(LIVE_CALL_METADATA.callId);
  });

  it('un message sans metadata sérialise sans crasher', () => {
    const { metadata: _metadata, ...withoutMetadata } = callMessage(TERMINAL_CALL_METADATA);

    const out = serialize(withoutMetadata);

    expect(out.id).toBe('507f1f77bcf86cd799439011');
    expect(out.metadata ?? null).toBeNull();
  });

  it('n’altère pas les champs déjà exposés (id/content/messageType)', () => {
    const out = serialize(callMessage(TERMINAL_CALL_METADATA));

    expect(out.id).toBe('507f1f77bcf86cd799439011');
    expect(out.content).toBe('Appel vidéo en cours');
    expect(out.messageType).toBe('system');
  });
});
