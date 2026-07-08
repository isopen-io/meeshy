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

  it("ignore un @ collé après un mot (adresse e-mail) — parité SSOT parseMentions", () => {
    // `@` précédé d'un caractère de nom = fragment d'adresse e-mail, PAS une mention.
    // Même frontière gauche que parseMentions/hasMentions (mention-parser.ts).
    expect(extractMentions('write to bob@alice.com')).toEqual([]);
    expect(extractMentions('contact@marie.com')).toEqual([]);
    expect(extractMentions('reply to jean.dupont@example.org please')).toEqual([]);
  });

  it("ignore un @ collé après une lettre accentuée/non-latine", () => {
    expect(extractMentions('André@atabeth.com')).toEqual([]);
    expect(extractMentions('écris à Владимир@mail.ru')).toEqual([]);
  });

  it("extrait une vraie mention mais pas le fragment d'e-mail voisin", () => {
    expect(extractMentions('cc @alice et bob@alice.com')).toEqual(['alice']);
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

  it('linkifie une mention tapée en casse mixte contre une liste minuscule', () => {
    // validatedMentions est stocké en minuscules par MentionService ;
    // le texte du message conserve la casse tapée par l'utilisateur.
    expect(mentionsToLinks('Hey @Alice!', '/u/{username}', ['alice']))
      .toBe('Hey [@Alice](/u/alice)!');
  });

  it('linkifie une mention MAJUSCULE avec URL canonique en minuscules', () => {
    expect(mentionsToLinks('cc @BOB', '/u/{username}', ['bob']))
      .toBe('cc [@BOB](/u/bob)');
  });

  it('normalise aussi une liste validée en casse mixte', () => {
    expect(mentionsToLinks('hi @alice', '/u/{username}', ['Alice']))
      .toBe('hi [@alice](/u/alice)');
  });

  it("ne linkifie pas un @ collé dans une adresse e-mail", () => {
    // `bob@alice.com` : le `@` fait partie de l'e-mail — ne doit PAS devenir /u/alice.
    expect(mentionsToLinks('mail bob@alice.com', '/u/{username}', ['alice']))
      .toBe('mail bob@alice.com');
  });

  it("linkifie une vraie mention mais laisse intact le fragment d'e-mail voisin", () => {
    expect(mentionsToLinks('cc @alice et bob@alice.com', '/u/{username}', ['alice']))
      .toBe('cc [@alice](/u/alice) et bob@alice.com');
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
