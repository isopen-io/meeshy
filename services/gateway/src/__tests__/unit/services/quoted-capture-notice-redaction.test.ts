/**
 * #18830 — une réponse DÉJÀ STOCKÉE qui cite un avis de capture (avant le
 * refus #9629, ou par un chemin qui l'aurait laissé passer) ne sert, à la
 * LECTURE, ni l'acteur, ni le message capturé, ni l'heure : défense en
 * profondeur derrière le refus à l'écriture. Témoin sur la forme RÉELLE des
 * appelants : la ligne brute étalée, PUIS la citation servie — et le
 * formateur des liens, qui compose la sienne champ par champ.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { servedQuotedMessage } from '../../../services/messaging/servedQuotedMessage';
import { formatLinkMessageWithDetails } from '../../../routes/links/utils/message-formatters';

const ACTOR_PARTICIPANT = '507f1f77bcf86cd7994390a1';
const CAPTURED = '507f1f77bcf86cd799439001';

const storedNoticeRow = () => ({
  id: '507f1f77bcf86cd7994390ff',
  conversationId: '507f1f77bcf86cd799439011',
  senderId: ACTOR_PARTICIPANT,
  anonymousSenderId: null,
  createdAt: new Date('2026-11-10T10:00:00.000Z'),
  messageType: 'system',
  messageSource: 'system',
  originalLanguage: 'fr',
  content: 'Zoé (@zoe) a capturé l’éphémère du 10/11/2026 à 09:58 (UTC) · 3 captures',
  translations: { en: { text: 'Zoé took a screenshot' } },
  deletedAt: null,
  metadata: {
    kind: 'content-capture',
    actor: { participantId: ACTOR_PARTICIPANT, displayName: 'Zoé', isAnonymous: false, username: 'zoe' },
    capturedMessageId: CAPTURED,
    nature: 'timed-flame',
    outcome: 'announced',
    captureKind: 'screenshot',
    sentAt: '2026-11-10T09:58:00.000Z',
    count: 3,
  },
  sender: { id: ACTOR_PARTICIPANT, displayName: 'Zoé', nickname: null, avatar: 'zoe.png', user: { username: 'zoe' } },
});

const LEAKS = /Zoé|zoe|7994390a1|439001|2026-11-10/;

describe('la citation STOCKÉE d’un avis de capture, à la lecture (#18830)', () => {
  it('ligne brute étalée puis citation servie : rien de l’avis ne part', () => {
    const row = storedNoticeRow();
    const quote = { ...row, ...servedQuotedMessage(row, { languages: ['en'] }) };
    expect(quote.content).toBe('Screenshot notice');
    expect(JSON.stringify(quote)).not.toMatch(LEAKS);
  });

  it('sans langue servie, la phrase neutre est française', () => {
    const row = storedNoticeRow();
    expect({ ...row, ...servedQuotedMessage(row) }.content).toBe('Avis de capture d’écran');
  });

  it('le formateur des liens ne recompose ni l’expéditeur ni l’heure du cité', () => {
    const formatted = formatLinkMessageWithDetails({
      id: 'reply', content: 'ok', messageType: 'text', createdAt: new Date(), updatedAt: new Date(),
      sender: { id: 'p-b', displayName: 'Bob' }, replyTo: storedNoticeRow(), metadata: null,
    });
    expect(JSON.stringify(formatted.replyTo)).not.toMatch(LEAKS);
  });

  it('une projection sans messageType (fils de discussion) masque aussi', () => {
    const { messageType: _dropped, ...row } = storedNoticeRow();
    expect(JSON.stringify({ ...row, ...servedQuotedMessage(row) })).not.toMatch(LEAKS);
  });

  it('un message ordinaire cité garde son expéditeur et son heure', () => {
    const row = { ...storedNoticeRow(), messageType: 'text', messageSource: 'user', metadata: null, content: 'salut' };
    const quote = { ...row, ...servedQuotedMessage(row) };
    expect(quote.senderId).toBe(ACTOR_PARTICIPANT);
    expect(quote.content).toBe('salut');
  });
});
