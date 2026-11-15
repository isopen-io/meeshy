import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { localMessage, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import { messageReceiptsPeopleQueryKey } from './receipts';
import { applyReadStatusUpdated } from './realtime-apply';

/**
 * « LA FICHE SUIT LE DIRECT » (#7352, V4) — extrait de `realtime-apply.test.ts`,
 * déjà à 1174 lignes pour un budget de 1000-1200 (CLAUDE.md racine, § Code
 * Style) : y ajouter était interdit avant extraction, même patron que
 * `realtime-apply-attachment.test.ts` / `realtime-apply-comment.test.ts` /
 * `realtime-apply-location.test.ts`.
 *
 * `applyReadStatusUpdated` (#7223, #7348) patchait déjà les COMPTEURS
 * agrégés du message (`deliveredCount`/`readCount`/`recipientCount`, que la
 * coche et la ligne « Envoyé · Lu » de `message-detail-sheet.tsx` lisent).
 * Elle n'invalidait JAMAIS `messageReceiptsPeopleQueryKey`
 * (`receipts.ts:122-123`), la query de la LISTE NOMINATIVE que
 * `MessageReceiptsSheet` lit — une fiche « Infos du message » ouverte
 * pendant qu'un accusé arrive ne bougeait donc pas (relevé de l'issue).
 *
 * Même idiome qu'`onAttachmentStatusUpdated` (`socket.ts:365`) : INVALIDER,
 * jamais PATCHER — la forme paginée par participant ne se fusionne pas champ
 * à champ sans risquer de désynchroniser une ligne encore en vol.
 *
 * **L'ÉPREUVE DE CE TÉMOIN N'EST PAS SON VERT mais sa MUTATION** : retirer
 * l'invalidation dans `applyReadStatusUpdated` doit le faire TOMBER.
 */
describe('applyReadStatusUpdated (#7352, V4) — invalide AUSSI la fiche « Infos du message »', () => {
  test('AVEC `summary.messageId` : invalide `messageReceiptsPeopleQueryKey` du message NOMMÉ', () => {
    const client = new QueryClient();
    const m1 = localMessage({ id: 'm-1', conversationId: 'c-a', createdAt: new Date('2026-09-21T09:00:00.000Z') });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([m1]));
    const receiptsKey = messageReceiptsPeopleQueryKey('c-a', 'm-1');
    client.setQueryData(receiptsKey, { people: [] });

    applyReadStatusUpdated(client, {
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-21T09:06:00.000Z'),
      summary: { totalMembers: 2, deliveredCount: 1, readCount: 1, messageId: 'm-1' },
    });

    expect(client.getQueryState(receiptsKey)?.isInvalidated).toBe(true);
  });

  test('SANS `summary.messageId` (repli pré-G5) : invalide la fiche du DERNIER message du fil, la même cible que le patch des compteurs', () => {
    const client = new QueryClient();
    const older = localMessage({ id: 'm-1', conversationId: 'c-a', createdAt: new Date('2026-09-21T09:00:00.000Z') });
    const newest = localMessage({ id: 'm-2', conversationId: 'c-a', createdAt: new Date('2026-09-21T09:05:00.000Z') });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([older, newest]));
    const receiptsKeyNewest = messageReceiptsPeopleQueryKey('c-a', 'm-2');
    const receiptsKeyOlder = messageReceiptsPeopleQueryKey('c-a', 'm-1');
    client.setQueryData(receiptsKeyNewest, { people: [] });
    client.setQueryData(receiptsKeyOlder, { people: [] });

    applyReadStatusUpdated(client, {
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-21T09:06:00.000Z'),
      summary: { totalMembers: 2, deliveredCount: 2, readCount: 2 },
    });

    expect(client.getQueryState(receiptsKeyNewest)?.isInvalidated).toBe(true);
    /* LE PLUS ANCIEN N'EST PAS TOUCHÉ — même garde que le patch des
       compteurs : sans `messageId`, `summary` ne décrit que le dernier
       message du fil. */
    expect(client.getQueryState(receiptsKeyOlder)?.isInvalidated).toBe(false);
  });

  test('`summary.totalMembers <= 0` : NO-OP, comme pour les compteurs — rien n’est invalidé', () => {
    const client = new QueryClient();
    const m1 = localMessage({ id: 'm-1', conversationId: 'c-a', createdAt: new Date('2026-09-21T09:00:00.000Z') });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([m1]));
    const receiptsKey = messageReceiptsPeopleQueryKey('c-a', 'm-1');
    client.setQueryData(receiptsKey, { people: [] });

    applyReadStatusUpdated(client, {
      conversationId: 'c-a',
      participantId: 'p-1',
      userId: 'u-1',
      type: 'read',
      updatedAt: new Date('2026-09-21T09:06:00.000Z'),
      summary: { totalMembers: 0, deliveredCount: 0, readCount: 0, messageId: 'm-1' },
    });

    expect(client.getQueryState(receiptsKey)?.isInvalidated).toBe(false);
  });
});
