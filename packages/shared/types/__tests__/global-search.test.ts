import { describe, expect, it } from 'vitest';

import {
  GLOBAL_SEARCH_POST_TYPES,
  globalSearchQuerySchema,
  messageSearchHitSchema,
  messageSearchTranscriptSchema,
  postSearchQuerySchema,
} from '../global-search';

describe('globalSearchQuerySchema', () => {
  it('rogne la requête et applique la page par défaut', () => {
    expect(globalSearchQuerySchema.parse({ q: '  bonjour  ' })).toEqual({ q: 'bonjour', limit: 20 });
  });

  it('refuse une requête de moins de deux caractères une fois rognée', () => {
    expect(globalSearchQuerySchema.safeParse({ q: ' a ' }).success).toBe(false);
  });

  it('refuse une requête de plus de cent caractères', () => {
    expect(globalSearchQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
  });

  it('borne la taille de page entre 1 et 50', () => {
    expect(globalSearchQuerySchema.safeParse({ q: 'ok', limit: '0' }).success).toBe(false);
    expect(globalSearchQuerySchema.safeParse({ q: 'ok', limit: '51' }).success).toBe(false);
    expect(globalSearchQuerySchema.parse({ q: 'ok', limit: '7', cursor: 'abc' })).toEqual({ q: 'ok', limit: 7, cursor: 'abc' });
  });
});

describe('postSearchQuerySchema', () => {
  it('cherche les trois formats par défaut', () => {
    expect(postSearchQuerySchema.parse({ q: 'plage' }).types).toEqual([...GLOBAL_SEARCH_POST_TYPES]);
  });

  it('lit une liste séparée par des virgules, sans doublon', () => {
    expect(postSearchQuerySchema.parse({ q: 'plage', types: 'REEL, STORY,REEL' }).types).toEqual(['REEL', 'STORY']);
  });

  it('refuse un format inconnu, y compris le statut', () => {
    expect(postSearchQuerySchema.safeParse({ q: 'plage', types: 'POST,STATUS' }).success).toBe(false);
  });
});

describe('messageSearchHitSchema', () => {
  it('décrit un résultat servi par la passerelle', () => {
    const hit = {
      id: '65f000000000000000000001',
      conversationId: '65f000000000000000000002',
      createdAt: '2026-11-02T10:00:00.000Z',
      messageType: 'text',
      content: 'Bonjour',
      servedLanguage: 'fr',
      originalContent: 'Hello',
      originalLanguage: 'en',
      sender: { id: 'p1', userId: null, displayName: 'Invité', username: null, avatar: null },
      conversation: { id: '65f000000000000000000002', identifier: null, type: 'direct', title: 'Alice', avatar: null },
    };
    expect(messageSearchHitSchema.parse(hit)).toEqual({ ...hit, isBlurred: false, match: 'content', transcript: null });
  });

  it('porte le voile du flou et la transcription qui a répondu (#16957, #16958)', () => {
    const hit = {
      id: '65f000000000000000000001',
      conversationId: '65f000000000000000000002',
      createdAt: '2026-11-02T10:00:00.000Z',
      messageType: 'audio',
      content: '',
      servedLanguage: null,
      originalContent: '',
      originalLanguage: 'fr',
      sender: null,
      conversation: { id: '65f000000000000000000002', identifier: null, type: 'direct', title: 'Alice', avatar: null },
      isBlurred: true,
      match: 'transcript',
      transcript: { attachmentId: 'a1', mediaKind: 'audio', text: 'on se voit à la plage', servedLanguage: null, durationMs: 4200 },
    };
    expect(messageSearchHitSchema.parse(hit)).toEqual(hit);
  });

  it('refuse une nature de média inconnue', () => {
    const transcript = { attachmentId: 'a1', mediaKind: 'hologram', text: 'x', servedLanguage: null, durationMs: null };
    expect(messageSearchTranscriptSchema.safeParse(transcript).success).toBe(false);
  });
});
