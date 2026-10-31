import { describe, it, expect } from 'vitest';
import { mentionLookupStage, mergeMentionSuggestions } from '../mention-lookup';

describe('mentionLookupStage — local d’abord, réseau au 3ᵉ caractère (#14053)', () => {
  it('un « @ » nu et une lettre restent sur le cache local', () => {
    expect(mentionLookupStage({ query: '', localMatchCount: 0 })).toBe('local');
    expect(mentionLookupStage({ query: 'a', localMatchCount: 0 })).toBe('local');
  });

  it('à deux lettres, le local suffit tant qu’il trouve quelqu’un', () => {
    expect(mentionLookupStage({ query: 'an', localMatchCount: 2 })).toBe('local');
  });

  it('à deux lettres sans correspondance locale, le réseau est appelé', () => {
    expect(mentionLookupStage({ query: 'an', localMatchCount: 0 })).toBe('remote');
  });

  it('dès trois caractères, le réseau est toujours appelé', () => {
    expect(mentionLookupStage({ query: 'ann', localMatchCount: 5 })).toBe('remote');
  });

  it('les espaces autour de la saisie ne comptent pas', () => {
    expect(mentionLookupStage({ query: '  a ', localMatchCount: 0 })).toBe('local');
  });
});

describe('mergeMentionSuggestions — le local d’abord, puis le serveur dans son ordre', () => {
  it('garde l’ordre du serveur après les correspondances locales, sans doublon', () => {
    const merged = mergeMentionSuggestions({
      local: [{ id: 'a' }, { id: 'b' }],
      remote: [{ id: 'c' }, { id: 'b' }, { id: 'd' }],
    });
    expect(merged.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('écarte l’appelant', () => {
    const merged = mergeMentionSuggestions({ local: [{ id: 'me' }], remote: [{ id: 'x' }], selfId: 'me' });
    expect(merged.map((s) => s.id)).toEqual(['x']);
  });
});
