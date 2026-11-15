import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  isMentionableIn,
  mentionLookupStage,
  mentionReachOf,
  mentionableScope,
  mergeMentionSuggestions,
  type MentionableScope,
} from '../mention-lookup';

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

describe('mentionableScope — la portée d’une mention, table UNIQUE passerelle + clients (#14071)', () => {
  it('direct → l’interlocuteur, group → les membres, public/global/broadcast → l’annuaire', () => {
    expect(mentionableScope('direct')).toBe('interlocutor');
    expect(mentionableScope('group')).toBe('members');
    expect(mentionableScope('public')).toBe('directory');
    expect(mentionableScope('global')).toBe('directory');
    expect(mentionableScope('broadcast')).toBe('directory');
  });

  it('un type inconnu ou absent n’a aucune portée (fail-closed)', () => {
    expect(mentionableScope('community')).toBeNull();
    expect(mentionableScope(undefined)).toBeNull();
  });
});

describe('mentionReachOf — ce que le lecteur peut citer ICI (#14066, #14071)', () => {
  it('un non-membre déclaré ne cite personne, quelle que soit la portée', () => {
    expect(mentionReachOf({ type: 'public', isMember: false, memberIds: ['a'] }).scope).toBeNull();
  });

  it('une appartenance non dite garde la portée du type', () => {
    expect(mentionReachOf({ type: 'group', memberIds: ['a'] })).toEqual({ scope: 'members', memberIds: ['a'] });
  });
});

describe('isMentionableIn — on ne propose pas ce que l’envoi ignorerait (#14071)', () => {
  const reach = (scope: MentionableScope | null) => ({ scope, memberIds: ['me', 'peer', 'member'] });

  it('une conversation directe n’admet que l’interlocuteur', () => {
    expect(isMentionableIn({ reach: reach('interlocutor'), candidateId: 'peer', selfId: 'me' })).toBe(true);
    expect(isMentionableIn({ reach: reach('interlocutor'), candidateId: 'me', selfId: 'me' })).toBe(false);
    expect(isMentionableIn({ reach: reach('interlocutor'), candidateId: 'contact', selfId: 'me' })).toBe(false);
  });

  it('un groupe n’admet que ses membres', () => {
    expect(isMentionableIn({ reach: reach('members'), candidateId: 'member' })).toBe(true);
    expect(isMentionableIn({ reach: reach('members'), candidateId: 'contact' })).toBe(false);
  });

  it('une conversation ouverte admet tout compte', () => {
    expect(isMentionableIn({ reach: reach('directory'), candidateId: 'contact' })).toBe(true);
  });

  it('sans portée, personne', () => {
    expect(isMentionableIn({ reach: reach(null), candidateId: 'member' })).toBe(false);
  });
});

describe('mergeMentionSuggestions — avec une portée, le local hors portée ne s’affiche pas (#14071)', () => {
  it('retire le contact local qui n’est pas membre d’un groupe, garde le serveur', () => {
    const merged = mergeMentionSuggestions({
      local: [{ id: 'contact' }, { id: 'member' }],
      remote: [{ id: 'other-member' }],
      reach: { scope: 'members', memberIds: ['member'] },
    });
    expect(merged.map((s) => s.id)).toEqual(['member', 'other-member']);
  });

  it('sans portée (type inconnu, non-membre), rien du tout — ni local ni serveur', () => {
    const merged = mergeMentionSuggestions({
      local: [{ id: 'member' }],
      remote: [{ id: 'other' }],
      reach: { scope: null, memberIds: ['member'] },
    });
    expect(merged).toEqual([]);
  });

  it('sans contrainte de conversation (un post), tout reste', () => {
    const merged = mergeMentionSuggestions({ local: [{ id: 'contact' }], remote: [{ id: 'x' }] });
    expect(merged.map((s) => s.id)).toEqual(['contact', 'x']);
  });
});

describe('mentionable-scope.vectors.json — la table rejouée par les trois langages (#14071)', () => {
  type ScopeVector = { readonly _label: string; readonly input: string | null; readonly expected: MentionableScope | null };
  type AdmitVector = {
    readonly _label: string;
    readonly type: string;
    readonly isMember: boolean;
    readonly memberIds: readonly string[];
    readonly selfId: string;
    readonly candidateId: string;
    readonly expected: boolean;
  };
  const raw = JSON.parse(readFileSync(resolve(__dirname, '../../fixtures/mentionable-scope.vectors.json'), 'utf8')) as {
    readonly scopes: readonly ScopeVector[];
    readonly admits: readonly AdmitVector[];
  };

  it('chaque type brut rend la portée attendue', () => {
    expect(raw.scopes.length).toBeGreaterThan(10);
    expect(raw.scopes.map((v) => [v._label, mentionableScope(v.input)])).toEqual(raw.scopes.map((v) => [v._label, v.expected]));
  });

  it('chaque lecteur admet exactement ce que la passerelle garderait', () => {
    expect(
      raw.admits.map((v) => [
        v._label,
        isMentionableIn({
          reach: mentionReachOf({ type: v.type, isMember: v.isMember, memberIds: v.memberIds }),
          candidateId: v.candidateId,
          selfId: v.selfId,
        }),
      ]),
    ).toEqual(raw.admits.map((v) => [v._label, v.expected]));
  });
});
