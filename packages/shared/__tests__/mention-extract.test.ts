// packages/shared/__tests__/mention-extract.test.ts
import { extractMentions, mentionsToLinks, isValidMentionUsername } from '../types/mention';

describe('extractMentions (types/mention)', () => {
  it('extrait un username classique', () => {
    expect(extractMentions('hello @alice and @bob')).toEqual(['alice', 'bob']);
  });

  it('extrait un username avec tiret sans le tronquer', () => {
    // Username valide au registre : /^[a-zA-Z0-9_-]+$/ autorise le tiret.
    expect(extractMentions('salut @marie-claire')).toEqual(['marie-claire']);
  });

  it('lowercase + dédup par défaut', () => {
    expect(extractMentions('@Alice @alice')).toEqual(['alice']);
  });

  it('respecte maxUsernameLength', () => {
    const long = 'a'.repeat(40);
    expect(extractMentions(`@${long}`, { maxUsernameLength: 30 })).toEqual([long.slice(0, 30)]);
  });

  it('retourne [] pour un contenu vide', () => {
    expect(extractMentions('')).toEqual([]);
  });
});

describe('mentionsToLinks', () => {
  it('transforme un username validé en lien', () => {
    expect(mentionsToLinks('hey @alice', '/u/{username}', ['alice']))
      .toBe('hey [@alice](/u/alice)');
  });

  it('transforme un username à tiret validé en lien', () => {
    expect(mentionsToLinks('hey @marie-claire', '/u/{username}', ['marie-claire']))
      .toBe('hey [@marie-claire](/u/marie-claire)');
  });

  it('laisse un username non validé en texte brut', () => {
    expect(mentionsToLinks('hey @marie-claire', '/u/{username}', []))
      .toBe('hey @marie-claire');
  });
});

describe('isValidMentionUsername', () => {
  it('accepte lettres/chiffres/underscore', () => {
    expect(isValidMentionUsername('user_42')).toBe(true);
  });

  it('accepte un tiret (parité charset username)', () => {
    expect(isValidMentionUsername('marie-claire')).toBe(true);
  });

  it('rejette un point', () => {
    expect(isValidMentionUsername('jane.smith')).toBe(false);
  });
});
