/**
 * Une CITATION ne compose pas les noms des participants d'un résumé d'appel
 * (#18242) : elle ne sert donc pas leur forme stockée `{ userId }`, que le type
 * servi (`{ userId, displayName }`) contredirait. Ni dans `notice` (#17441),
 * ni dans la `metadata` que le site d'appel a répandue avant la projection.
 */
import { describe, it, expect } from '@jest/globals';
import { servedQuotedMessage } from '../../../services/messaging/servedQuotedMessage';

const CALL_SUMMARY = {
  kind: 'call', callId: 'c1', initiatorId: 'u1', callType: 'audio', outcome: 'completed',
  durationSeconds: 42, bytesTotal: null, bytesEstimated: false, networkQuality: null,
  participants: [{ userId: 'u1' }, { userId: 'u2', displayName: 'Nom figé' }],
};

const quotedCall = () => ({
  id: '507f1f77bcf86cd799439000',
  conversationId: '507f1f77bcf86cd799439aaa',
  deletedAt: null,
  messageType: 'system',
  content: 'Appel audio · 00:42',
  metadata: CALL_SUMMARY,
});

describe('servedQuotedMessage — un résumé d\'appel cité', () => {
  it('se cite avec son avis, sans la liste stockée des participants', () => {
    const served = servedQuotedMessage(quotedCall() as never);

    expect(served['notice']).toMatchObject({ kind: 'call', outcome: 'completed' });
    expect(served['notice']).not.toHaveProperty('participants');
  });

  it('écrase la `metadata` brute répandue par le site d\'appel par sa forme sans participants', () => {
    const raw = quotedCall();
    const quote = { ...raw, ...servedQuotedMessage(raw as never) };

    expect(quote.metadata).toMatchObject({ kind: 'call', callId: 'c1' });
    expect(quote.metadata).not.toHaveProperty('participants');
  });

  it('laisse la métadonnée d\'un autre message citée telle quelle', () => {
    const served = servedQuotedMessage({ ...quotedCall(), messageType: 'text', metadata: { location: { lat: 1, lng: 2 } } } as never);

    expect(served).not.toHaveProperty('metadata');
  });
});
