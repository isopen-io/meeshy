/**
 * #11269 (audit adversarial, F2) — une vue unique PURGÉE ne sert plus ses
 * pièces, à AUCUN lecteur.
 *
 * Quand des octets résistent, la ligne `MessageAttachment` reste (elle garde la
 * clé pour la reprise). La projection par lecteur ne retenait le contenu qu'à
 * qui l'avait OUVERT : un membre arrivé après la purge, ou tout lecteur qui ne
 * l'avait jamais ouvert, recevait encore la pièce restante dans le fil. La
 * purge est un fait du MESSAGE (`viewOnceBurnedAt`), pas de l'ouverture.
 *
 * Et ce fait doit être LU : les trois lectures qui projettent (liste, `/sync`,
 * détail) chargent `viewOnceBurnedAt`, sans quoi l'état se calcule sur
 * `undefined` et la projection s'ouvre en silence.
 *
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';
import fastJsonStringify from 'fast-json-stringify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';

import { computeViewOnceStates, projectViewOnceForReader } from '../../../services/messaging/viewOnceAudience';
import { buildMessageListSelect, mapMessageRowForList } from '../../../routes/conversations/messages-list-query';
import { syncMessagePlan, syncMessageSelect } from '../../../routes/sync/messages';

const CONV_ID = '507f1f77bcf86cd799439011';
const MESSAGE_ID = '507f1f77bcf86cd799439033';
const AUTHOR = '507f1f77bcf86cd7994390a0';
const NEWCOMER = '507f1f77bcf86cd7994390b9';

function audience() {
  return {
    messageStatusEntry: { findMany: async () => [] },
    participant: {
      findMany: async () => [{ id: AUTHOR }, { id: NEWCOMER }],
      count: async () => 2,
    },
  };
}

const served = {
  id: MESSAGE_ID,
  isViewOnce: true,
  content: '',
  attachments: [{ id: 'att', originalName: 'plage.jpg' }],
  messageType: 'image',
};

describe('une vue unique purgée ne sert plus ses pièces (#11269, F2)', () => {
  it('à un lecteur qui ne l’a jamais ouverte — membre arrivé après la purge —, aucune pièce ne part', async () => {
    const states = await computeViewOnceStates(
      audience() as never,
      [{ id: MESSAGE_ID, conversationId: CONV_ID, senderId: AUTHOR, isViewOnce: true, viewOnceBurnedAt: new Date('2026-11-01T00:00:00Z') }],
      NEWCOMER,
    );

    const out = projectViewOnceForReader(served, states.get(MESSAGE_ID));

    expect(out).toMatchObject({ id: MESSAGE_ID, messageType: 'image', attachments: [] });
    expect(JSON.stringify(out)).not.toContain('plage');
  });

  it('une vue unique NON purgée, jamais ouverte par ce lecteur, garde sa pièce', async () => {
    const states = await computeViewOnceStates(
      audience() as never,
      [{ id: MESSAGE_ID, conversationId: CONV_ID, senderId: AUTHOR, isViewOnce: true, viewOnceBurnedAt: null }],
      NEWCOMER,
    );

    expect(projectViewOnceForReader(served, states.get(MESSAGE_ID))).toMatchObject({ attachments: [{ id: 'att' }] });
  });

  it('la liste de messages LIT l’estampille de purge', () => {
    expect(buildMessageListSelect({ includeTranslations: true, includeReplies: true })).toMatchObject({ viewOnceBurnedAt: true });
  });

  it('… et ne la sert pas : le sérialiseur de la liste la retire', () => {
    const row = {
      id: 'm1',
      conversationId: 'c1',
      senderId: 'p',
      content: '',
      originalLanguage: 'fr',
      messageType: 'image',
      createdAt: new Date('2026-11-01T00:00:00Z'),
      attachments: [],
      sender: null,
      viewOnceBurnedAt: new Date('2026-11-01T00:00:00Z'),
    };
    const ctx = {
      includeTranslations: false,
      includeReplies: false,
      hasLanguageFilter: false,
      languageFilter: undefined,
      currentParticipantId: 'reader',
      readStatusMap: new Map(),
      senderPresenceVis: new Map(),
      listMissingEntry: 'hide',
      consumptionMap: new Map(),
      ephemeralDeadlines: new Map(),
    } as never;

    const wire = JSON.parse(fastJsonStringify(messageSchema as never)(mapMessageRowForList(row as never, ctx)));

    expect(wire).not.toHaveProperty('viewOnceBurnedAt');
  });

  it('/sync LIT l’estampille de purge, quelle que soit la projection demandée', () => {
    expect(syncMessageSelect).toMatchObject({ viewOnceBurnedAt: true });
    expect(syncMessagePlan.pinned).toContain('viewOnceBurnedAt');
  });

  it('le détail d’un message LIT l’estampille de purge', () => {
    const source = readFileSync(path.join(__dirname, '../../../routes/messages-reads.ts'), 'utf8');
    const detail = source.slice(source.indexOf("'/messages/:messageId'"), source.indexOf('loadViewOnceReaderStates(prisma, [message], readerParticipantId'));

    expect(detail).toContain('viewOnceBurnedAt: true');
  });
});
