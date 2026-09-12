import { describe, expect, test } from 'bun:test';
import type { Message } from '@meeshy/shared';
import { decodeMessage } from './decode';

/**
 * **#6080 — un `null` servi par la passerelle ne doit atteindre AUCUNE vue.**
 *
 * Le décodeur promet, dans son en-tête, de défaire « TOUTES les clés que la
 * passerelle peut servir à `null` ». Il en défaisait dix sur trente : les vingt
 * autres passaient par `...rest`, et `reactionSummary: null` a fini dans
 * `Object.entries()` — « Cannot convert undefined or null to object », le fil
 * entier blanc pour une réaction absente.
 *
 * Ce témoin ne vérifie pas un champ : il vérifie l'INVARIANT. Une liste de noms
 * aurait le défaut même qu'elle corrige — retenir en silence le prochain champ
 * ajouté à `Message`.
 */
describe('decodeMessage — aucun null ne sort', () => {
  const base = {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    content: 'bonjour',
    originalLanguage: 'fr',
    messageType: 'text',
    isEdited: false,
    isDeleted: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: '2026-09-11T10:00:00.000Z',
    translations: [],
  };

  test('le champ qui a fait blanchir le fil ne sort plus jamais à null', () => {
    const decode = decodeMessage({ ...base, reactionSummary: null } as unknown as Message);
    expect(decode.reactionSummary).toBeUndefined();
    // La forme exacte du crash, rejouée : c'est elle qui jetait.
    expect(() => Object.entries(decode.reactionSummary ?? {})).not.toThrow();
  });

  test('AUCUNE clé ne sort à null, quel que soit le champ servi ainsi', () => {
    const tousNuls = {
      ...base,
      reactionSummary: null,
      attachments: null,
      validatedMentions: null,
      metadata: null,
      effectFlags: null,
      encryptionMetadata: null,
      recipientCount: null,
      replyToId: null,
      title: null,
      identifier: null,
      anonymousSender: null,
      forwardedFromId: null,
      storyReplyToId: null,
      pinnedBy: null,
    };
    const decode = decodeMessage(tousNuls as unknown as Message);
    const restants = Object.entries(decode).filter(([, v]) => v === null).map(([k]) => k);
    expect(restants).toEqual([]);
  });

  test('ce qui n\'est pas null traverse INTACT — la garde ne mange rien', () => {
    const decode = decodeMessage({
      ...base,
      reactionSummary: { '👍': 2 },
      recipientCount: 3,
    } as unknown as Message);
    expect(decode.reactionSummary).toEqual({ '👍': 2 });
    expect(decode.recipientCount).toBe(3);
    expect(decode.content).toBe('bonjour');
  });
});
