/**
 * #8562 — `GET /conversations/:id/messages` sert la citation d'un éphémère
 * échu POUR CE LECTEUR scellée, et l'échéance du lecteur sur une citation
 * vivante — jamais la colonne brute.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { mapMessageRowForList } from '../../../../routes/conversations/messages-list-query';
import {
  loadEphemeralReaderDeadlines,
  withQuotedMessages,
  withQuoteServedToReader,
} from '../../../../routes/conversations/ephemeralReaderDeadlines';

const READER = 'reader-participant';
const AUTHOR = 'author-participant';
const CONSUMED = new Date(Date.now() - 60_000);
const RAW_DESTRUCTION = new Date(Date.now() + 7 * 24 * 3600_000);

const flamme = {
  id: 'quoted-flame',
  senderId: AUTHOR,
  content: 'le code du coffre est 4271',
  messageType: 'text',
  effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ,
  ephemeralDuration: null,
  expiresAt: RAW_DESTRUCTION,
  deletedAt: null,
  translations: { en: { text: 'the vault code is 4271' } },
  attachments: [{ id: 'a1', mimeType: 'audio/m4a', fileUrl: 'https://cdn/vocal.m4a' }],
  sender: { id: AUTHOR, userId: 'u-author', displayName: 'Ada' },
};

const reponse = () => ({
  id: 'reply-1',
  conversationId: 'c1',
  senderId: 'someone-else',
  content: 'je réponds',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: new Date(),
  attachments: [],
  sender: { id: 'someone-else', userId: 'u-else', displayName: 'Bob' },
  replyToId: flamme.id,
  replyTo: flamme,
});

const ctx = (ephemeralDeadlines: Map<string, unknown>, currentParticipantId: string = READER) =>
  ({
    includeTranslations: true,
    includeReplies: true,
    hasLanguageFilter: false,
    languageFilter: undefined,
    currentParticipantId,
    readStatusMap: new Map(),
    senderPresenceVis: new Map(),
    listMissingEntry: 'hide',
    consumptionMap: new Map(),
    ephemeralDeadlines,
  }) as never;

const prismaWith = (entries: Array<{ messageId: string; participantId: string; ephemeralExpiresAt: Date }>) => ({
  messageStatusEntry: {
    findMany: async ({ where }: { where: { messageId: { in: string[] } } }) =>
      entries.filter((entry) => where.messageId.in.includes(entry.messageId)),
  },
});

const consumedByReader = [{ messageId: flamme.id, participantId: READER, ephemeralExpiresAt: CONSUMED }];

describe('liste REST — citation d’un éphémère, par lecteur (#8562)', () => {
  it('les échéances se chargent aussi pour les messages CITÉS hors de la page', async () => {
    const deadlines = await loadEphemeralReaderDeadlines(
      prismaWith(consumedByReader) as never,
      withQuotedMessages([reponse()] as never),
      READER,
    );
    expect(deadlines.get(flamme.id)).toEqual({ isSender: false, readerDeadline: CONSUMED, latestRecipientDeadline: CONSUMED });
  });

  it('flamme-œil consommée par ce lecteur ⇒ citation scellée, rien du message cité ne part', async () => {
    const page = [reponse()];
    const deadlines = await loadEphemeralReaderDeadlines(prismaWith(consumedByReader) as never, withQuotedMessages(page as never), READER);
    const served = mapMessageRowForList(page[0] as never, ctx(deadlines));
    expect(served.replyTo.content).toBe('');
    expect(served.replyTo.deletedAt).toEqual(CONSUMED);
    expect(served.replyTo.expiresAt).toEqual(CONSUMED);
    expect(served.replyTo.attachments).toEqual([]);
    expect(served.replyTo.translations).toBeUndefined();
    expect(JSON.stringify(served.replyTo)).not.toContain('4271');
    expect(served.replyTo.sender.displayName).toBe('Ada');
  });

  it('flamme-œil pas encore lue par ce lecteur ⇒ citation lisible, sans l’heure interne de destruction', async () => {
    const page = [reponse()];
    const deadlines = await loadEphemeralReaderDeadlines(prismaWith([]) as never, withQuotedMessages(page as never), READER);
    const served = mapMessageRowForList(page[0] as never, ctx(deadlines));
    expect(served.replyTo.content).toBe('le code du coffre est 4271');
    expect(served.replyTo.deletedAt ?? null).toBeNull();
    expect(served.replyTo.expiresAt).toBeUndefined();
  });

  it('réponse HTTP d’un envoi : la citation passe la garde avec l’échéance de l’expéditeur', async () => {
    const sent = { ...reponse(), senderId: READER, metadata: null };
    const served = await withQuoteServedToReader(prismaWith(consumedByReader) as never, sent, READER);
    expect(served.replyTo).toMatchObject({ content: '', deletedAt: CONSUMED, attachments: [] });
    expect(JSON.stringify(served)).not.toContain('4271');
    expect(sent.replyTo.content).toBe('le code du coffre est 4271');

    const alive = await withQuoteServedToReader(prismaWith([]) as never, sent, READER);
    expect((alive.replyTo as Record<string, unknown>)['content']).toBe('le code du coffre est 4271');
    expect((alive.replyTo as Record<string, unknown>)['expiresAt']).toBeUndefined();
  });

  it('l’auteur du message cité le relit toujours dans la citation', async () => {
    const page = [reponse()];
    const deadlines = await loadEphemeralReaderDeadlines(prismaWith(consumedByReader) as never, withQuotedMessages(page as never), AUTHOR);
    const served = mapMessageRowForList(page[0] as never, ctx(deadlines, AUTHOR));
    expect(served.replyTo.content).toBe('le code du coffre est 4271');
  });
});
