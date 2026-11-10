import { describe, expect, test } from 'bun:test';

import { EXTERNAL_CONVERSATION_ERROR_CODES } from '@meeshy/shared/types/external-conversation';

import type { ApiResult } from '@/lib/api/http';
import { PRODUCTION_ORIGIN } from '@/lib/api/production-origin';

import {
  externalConversationEntryVisible,
  externalConversationsReachable,
  externalOpeningOutcomeOf,
  normalizeExternalHandle,
  type ExternalOpening,
} from './external-conversation';

/**
 * #17118 — écrire à un ami WhatsApp depuis le web : l'entrée n'existe que là
 * où aucun utilisateur réel n'est servi (staging, développement) et pour
 * l'équipe ; le numéro part en E.164 ; chaque refus de la passerelle
 * (`POST /conversations/external`, #17117) devient un état dessiné.
 */

describe('l’entrée est éteinte en production, allumée au staging et pour l’équipe', () => {
  test('la passerelle de production n’est jamais une porte, quel que soit le rôle', () => {
    expect(externalConversationsReachable(PRODUCTION_ORIGIN)).toBe(false);
    expect(externalConversationEntryVisible({ base: PRODUCTION_ORIGIN, platformRole: 'BIGBOSS' })).toBe(false);
  });

  test('le staging et le développement le sont', () => {
    expect(externalConversationsReachable('https://gate.staging.meeshy.me')).toBe(true);
    expect(externalConversationsReachable('')).toBe(true);
    expect(externalConversationsReachable('http://localhost:3000')).toBe(true);
    expect(externalConversationsReachable('http://192.168.1.12:3000')).toBe(true);
  });

  test('toute autre origine est fermée : la liste est positive, jamais négative', () => {
    expect(externalConversationsReachable('https://gate.meeshy.me/')).toBe(false);
    expect(externalConversationsReachable('https://api.meeshy.me')).toBe(false);
    expect(externalConversationsReachable('https://staging.meeshy.me.evil.example')).toBe(false);
    expect(externalConversationsReachable('pas une origine')).toBe(false);
  });

  test('au staging, seule l’équipe la voit', () => {
    const base = 'https://gate.staging.meeshy.me';
    expect(externalConversationEntryVisible({ base, platformRole: 'MODERATOR' })).toBe(true);
    expect(externalConversationEntryVisible({ base, platformRole: 'ADMIN' })).toBe(true);
    expect(externalConversationEntryVisible({ base, platformRole: 'ANALYST' })).toBe(false);
    expect(externalConversationEntryVisible({ base, platformRole: 'USER' })).toBe(false);
    expect(externalConversationEntryVisible({ base, platformRole: null })).toBe(false);
  });
});

describe('le numéro de l’ami part en E.164', () => {
  test('les séparateurs usuels tombent', () => {
    expect(normalizeExternalHandle('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(normalizeExternalHandle('+1 (415) 555-0100')).toBe('+14155550100');
    expect(normalizeExternalHandle(' +44.20.7946.0958 ')).toBe('+442079460958');
  });

  test('le préfixe international 00 vaut +', () => {
    expect(normalizeExternalHandle('0033612345678')).toBe('+33612345678');
  });

  test('un numéro sans indicatif, trop court, trop long ou lettré est refusé', () => {
    expect(normalizeExternalHandle('0612345678')).toBeNull();
    expect(normalizeExternalHandle('+3361')).toBeNull();
    expect(normalizeExternalHandle('+3361234567890123')).toBeNull();
    expect(normalizeExternalHandle('+33 6 CALL ME')).toBeNull();
    expect(normalizeExternalHandle('+0612345678')).toBeNull();
    expect(normalizeExternalHandle('')).toBeNull();
  });
});

const opened = (created: boolean): ApiResult<ExternalOpening> => ({
  ok: true,
  data: { conversationId: '6730c0ffee0000000000abcd', type: 'external', encryptionMode: 'e2ee', network: 'whatsapp', created },
});

const refused = (status: number, code?: string): ApiResult<ExternalOpening> => ({
  ok: false,
  status,
  error: 'refus',
  ...(code === undefined ? {} : { code }),
});

describe('chaque réponse de la passerelle devient un état dessiné', () => {
  test('ouverte, ou retrouvée : le fil s’ouvre', () => {
    expect(externalOpeningOutcomeOf({ result: opened(true), online: true })).toEqual({
      kind: 'open',
      conversationId: '6730c0ffee0000000000abcd',
      created: true,
    });
    expect(externalOpeningOutcomeOf({ result: opened(false), online: true })).toEqual({
      kind: 'open',
      conversationId: '6730c0ffee0000000000abcd',
      created: false,
    });
  });

  test('une réponse ouverte qui n’est pas chiffrée de bout en bout n’ouvre rien', () => {
    const plaintext = { ok: true, data: { conversationId: 'x', type: 'external', encryptionMode: 'server', network: 'whatsapp', created: true } } as unknown as ApiResult<ExternalOpening>;
    expect(externalOpeningOutcomeOf({ result: plaintext, online: true })).toEqual({ kind: 'refused', reason: 'failed' });
  });

  test('numéro non vérifié : la vérification est proposée', () => {
    expect(externalOpeningOutcomeOf({ result: refused(403, EXTERNAL_CONVERSATION_ERROR_CODES.PHONE_UNVERIFIED), online: true })).toEqual({
      kind: 'phone-unverified',
    });
  });

  test('les autres refus disent leur cause', () => {
    const cases: ReadonlyArray<readonly [ApiResult<ExternalOpening>, string]> = [
      [refused(403, EXTERNAL_CONVERSATION_ERROR_CODES.DISABLED), 'disabled'],
      [refused(403, EXTERNAL_CONVERSATION_ERROR_CODES.END_TO_END_RESERVED), 'reserved'],
      [refused(409, EXTERNAL_CONVERSATION_ERROR_CODES.LIMIT_REACHED), 'limit'],
      [refused(400, EXTERNAL_CONVERSATION_ERROR_CODES.INVALID), 'invalid'],
      [refused(429), 'rate-limited'],
      [refused(500), 'failed'],
      [refused(404), 'disabled'],
    ];
    for (const [result, reason] of cases) {
      expect(externalOpeningOutcomeOf({ result, online: true })).toEqual({ kind: 'refused', reason });
    }
  });

  test('hors ligne, la cause est le réseau', () => {
    expect(externalOpeningOutcomeOf({ result: refused(0), online: false })).toEqual({ kind: 'refused', reason: 'offline' });
  });
});
