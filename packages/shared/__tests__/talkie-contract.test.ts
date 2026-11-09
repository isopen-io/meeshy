/**
 * #13935 — le contrat du talkie que lisent les trois clients (D-4, E10).
 */
import { describe, expect, it } from 'vitest';
import {
  TALKIE_CODECS,
  TALKIE_END_REASONS,
  TALKIE_ERROR_CODES,
  TALKIE_FALLBACK_VOICE_MESSAGE,
  TALKIE_MAX_CHUNK_BYTES,
  TALKIE_MAX_DURATION_MS,
  TALKIE_DELIVERIES,
  TALKIE_JOIN_WINDOW_MS,
  TALKIE_PUSH_TYPES,
  talkieChunkPayloadSchema,
  talkieJoinPayloadSchema,
  talkieStartPayloadSchema,
  type TalkieStartAck,
} from '../types/talkie';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../types/socketio-events';
import { NOTIFICATION_PREFERENCE_DEFAULTS } from '../types/preferences/notification';
import { relationPersonSettingsUpdateSchema } from '../types/relation-person-settings';

describe('le contrat du talkie', () => {
  it('les événements suivent entity:action-word, et les noms client et serveur sont distincts', () => {
    expect([CLIENT_EVENTS.TALKIE_START, CLIENT_EVENTS.TALKIE_SEND_CHUNK, CLIENT_EVENTS.TALKIE_END]).toEqual(['talkie:start', 'talkie:send-chunk', 'talkie:end']);
    expect([SERVER_EVENTS.TALKIE_INCOMING, SERVER_EVENTS.TALKIE_CHUNK, SERVER_EVENTS.TALKIE_ENDED]).toEqual(['talkie:incoming', 'talkie:chunk', 'talkie:ended']);
  });

  it('un seul encodage, celui du vocal, et les bornes de D-4', () => {
    expect(TALKIE_CODECS).toEqual(['aac-adts']);
    expect(TALKIE_MAX_DURATION_MS).toBe(30_000);
    expect(TALKIE_MAX_CHUNK_BYTES).toBe(16_384);
  });

  it('le refus en conversation chiffrée a son code (E10)', () => {
    expect(TALKIE_ERROR_CODES.E2EE_CONVERSATION).toBe('TALKIE_E2EE_CONVERSATION');
    expect(TALKIE_END_REASONS).toEqual(['sender', 'limit', 'cut']);
  });

  it('un fragment est BINAIRE : une chaîne (base64) est refusée', () => {
    const talkieId = 'a'.repeat(24);
    expect(talkieChunkPayloadSchema.safeParse({ talkieId, seq: 0, data: new Uint8Array(4) }).success).toBe(true);
    expect(talkieChunkPayloadSchema.safeParse({ talkieId, seq: 0, data: 'AAAA' }).success).toBe(false);
  });

  it('l’ouverture exige un destinataire lisible et un encodage connu', () => {
    expect(talkieStartPayloadSchema.safeParse({ toUserId: 'b'.repeat(24), codec: 'aac-adts' }).success).toBe(true);
    expect(talkieStartPayloadSchema.safeParse({ toUserId: 'b'.repeat(24), codec: 'opus' }).success).toBe(false);
  });

  it('la réception directe est active par défaut, et se coupe par personne ou globalement', () => {
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.talkieEnabled).toBe(true);
    expect(relationPersonSettingsUpdateSchema.safeParse({ talkieBlocked: true }).success).toBe(true);
  });

  it('#17142 — rejoindre une voix réveillée : talkie:join, un talkieId lisible', () => {
    expect(CLIENT_EVENTS.TALKIE_JOIN).toBe('talkie:join');
    expect(talkieJoinPayloadSchema.safeParse({ talkieId: 'c'.repeat(24) }).success).toBe(true);
    expect(talkieJoinPayloadSchema.safeParse({ talkieId: 'pas-un-id' }).success).toBe(false);
    expect(talkieJoinPayloadSchema.safeParse({}).success).toBe(false);
  });

  it('#17142 — la livraison est live ou waking, champ optionnel de l’accusé (un ancien accusé reste valide)', () => {
    expect(TALKIE_DELIVERIES).toEqual(['live', 'waking']);
    const ancien: TalkieStartAck = { success: true, data: { talkieId: 'a'.repeat(24), maxDurationMs: 1, maxChunkBytes: 1 } };
    const nouveau: TalkieStartAck = { success: true, data: { talkieId: 'a'.repeat(24), maxDurationMs: 1, maxChunkBytes: 1, delivery: 'waking' } };
    expect([ancien.success, nouveau.success]).toEqual([true, true]);
    expect(TALKIE_JOIN_WINDOW_MS).toBe(60_000);
    expect(TALKIE_PUSH_TYPES.INCOMING).toBe('talkie_incoming');
  });

  it('#17141 — le repli n’est plus une erreur : une information, la copie part dans la conversation la plus récente', () => {
    const repli: TalkieStartAck = { success: false, error: 'x', code: TALKIE_ERROR_CODES.FALLBACK_VOICE, conversationId: 'd'.repeat(24) };
    expect(repli.success).toBe(false);
    expect(TALKIE_FALLBACK_VOICE_MESSAGE).toBe(
      'L’utilisateur n’est pas disponible pour un accès d’urgence. Un message sera créé et envoyé dans votre conversation la plus récente avec lui.',
    );
  });
});
