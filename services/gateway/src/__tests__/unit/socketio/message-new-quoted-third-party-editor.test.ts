/** @jest-environment node */
import { describe, it, expect, jest } from '@jest/globals';
jest.mock('prom-client', () => ({ Gauge: jest.fn().mockImplementation(() => ({ set: jest.fn(), inc: jest.fn() })), Registry: jest.fn().mockImplementation(() => ({ registerMetric: jest.fn() })), Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })), Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn() })) }), { virtual: true });
import { buildMessageNewPayload } from '../../../socketio/messageNewPayload';

const MOD = '507f1f77bcf86cd7994391ff';
const quotedRow = {
  id: 'q1', conversationId: 'c1', senderId: 'p1', content: 'cité', originalLanguage: 'fr', messageType: 'text',
  createdAt: new Date(), deletedAt: null, isEdited: true, thirdPartyEditorId: MOD, thirdPartyEditorRole: 'BIGBOSS',
  sender: { id: 'p1', userId: 'u1', displayName: 'a', avatar: null, type: 'user' }, attachments: [],
};

describe('message:new qui cite un message modifié par un modérateur (#12792)', () => {
  it('ne répand pas les colonnes de l’éditeur tiers du message CITÉ dans la diffusion de room', () => {
    const message: any = {
      id: 'm1', conversationId: 'c1', senderId: 'p2', content: 'réponse', originalLanguage: 'fr', messageType: 'text',
      createdAt: new Date(), updatedAt: new Date(), replyToId: 'q1', replyTo: quotedRow,
      sender: { id: 'p2', userId: 'u2', displayName: 'b', avatar: null, type: 'user' }, attachments: [],
    };
    const payload: any = buildMessageNewPayload(message, { conversationId: 'c1', translations: [], attachments: [], replyTo: { ...quotedRow } });
    const wire = JSON.stringify(payload.replyTo);
    expect(wire).not.toContain(MOD);
    expect(wire).not.toContain('thirdPartyEditorRole');
    expect(wire).not.toContain('BIGBOSS');
  });
});
