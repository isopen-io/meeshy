import { describe, expect, it } from 'bun:test';

import { DECLINE_REPLY_KEYS, declineWithReply, type DeclineReplyDeps } from './decline-reply';

type Sent = { readonly conversationId: string; readonly content: string; readonly language: string };

const recorder = () => {
  const events: string[] = [];
  const sent: Sent[] = [];
  const deps: DeclineReplyDeps = {
    decline: () => events.push('decline'),
    send: (message) => {
      events.push('send');
      sent.push(message);
    },
  };
  return { events, sent, deps };
};

const incoming = { conversationId: 'conv-1', phase: { kind: 'incoming' as const } };

describe('declineWithReply — refuser un appel avec un message (#8065)', () => {
  it('refuse l’appel PUIS dépose le message dans la conversation de l’appel, dans la langue de l’interface', () => {
    const { events, sent, deps } = recorder();
    const done = declineWithReply({ call: incoming, text: 'Je te rappelle.', language: 'fr', deps });
    expect(done).toBe(true);
    expect(events).toEqual(['decline', 'send']);
    expect(sent).toEqual([{ conversationId: 'conv-1', content: 'Je te rappelle.', language: 'fr' }]);
  });

  it('rogne le texte libre et n’envoie rien quand il est vide', () => {
    const { events, sent, deps } = recorder();
    expect(declineWithReply({ call: incoming, text: '   ', language: 'fr', deps })).toBe(false);
    expect(events).toEqual([]);
    expect(declineWithReply({ call: incoming, text: '  En réunion  ', language: 'fr', deps })).toBe(true);
    expect(sent[0]?.content).toBe('En réunion');
  });

  it('ne fait rien hors de la sonnerie : un appel déjà décroché ne se refuse plus', () => {
    const { events, deps } = recorder();
    const connected = { conversationId: 'conv-1', phase: { kind: 'connected' as const } };
    expect(declineWithReply({ call: connected, text: 'Je te rappelle.', language: 'fr', deps })).toBe(false);
    expect(declineWithReply({ call: null, text: 'Je te rappelle.', language: 'fr', deps })).toBe(false);
    expect(events).toEqual([]);
  });

  it('propose des réponses rapides distinctes, toutes au catalogue', () => {
    expect(DECLINE_REPLY_KEYS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(DECLINE_REPLY_KEYS).size).toBe(DECLINE_REPLY_KEYS.length);
  });
});
