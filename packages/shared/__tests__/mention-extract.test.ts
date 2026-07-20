// packages/shared/__tests__/mention-extract.test.ts
import { extractMentions, mentionsToLinks, isValidMentionUsername, isValidMentionQuery, detectMentionAtCursor } from '../types/mention';

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

describe('isValidMentionQuery', () => {
  it('accepte une query vide (autocomplete dès la frappe de `@`)', () => {
    expect(isValidMentionQuery('')).toBe(true);
  });

  it('accepte lettres/chiffres/underscore', () => {
    expect(isValidMentionQuery('user_42')).toBe(true);
  });

  it('accepte une query partielle avec tiret (username à tiret en cours de frappe)', () => {
    // Régression : `@marie-cl…` doit garder l'autocomplete ouvert. Le charset SSOT
    // MENTION_HANDLE_CHARS inclut le tiret — parité avec le composer (useMentions) et
    // avec isValidMentionUsername.
    expect(isValidMentionQuery('marie-cl')).toBe(true);
    expect(isValidMentionQuery('marie-claire')).toBe(true);
  });

  it('rejette un espace (mention terminée)', () => {
    expect(isValidMentionQuery('marie claire')).toBe(false);
  });

  it('rejette un point (caractère hors charset username)', () => {
    expect(isValidMentionQuery('jane.smith')).toBe(false);
  });

  it('rejette au-delà de 30 caractères', () => {
    expect(isValidMentionQuery('a'.repeat(31))).toBe(false);
  });
});

describe('detectMentionAtCursor', () => {
  it('détecte une mention en cours de frappe au curseur', () => {
    const content = 'hey @ali';
    expect(detectMentionAtCursor(content, content.length)).toEqual({
      start: 4,
      end: content.length,
      query: 'ali',
      hasMention: true,
    });
  });

  it('détecte une query vide juste après le `@`', () => {
    const content = 'hey @';
    expect(detectMentionAtCursor(content, content.length)).toEqual({
      start: 4,
      end: content.length,
      query: '',
      hasMention: true,
    });
  });

  it('retourne null en l’absence de `@`', () => {
    expect(detectMentionAtCursor('hello world', 11)).toBeNull();
  });

  it('retourne null si un espace sépare le `@` du curseur', () => {
    expect(detectMentionAtCursor('hey @ali bob', 12)).toBeNull();
  });

  it('détecte un `@` en début de contenu', () => {
    const content = '@ali';
    expect(detectMentionAtCursor(content, content.length)?.query).toBe('ali');
  });

  // Frontière gauche NAME_BOUNDARY_LEFT (SSOT mention-parser) : un `@` collé après un
  // caractère de nom appartient à une adresse e-mail, PAS à une mention. Sans cette
  // frontière, le composer ouvrait l'autocomplete sur `bob@alice`, l'utilisateur
  // sélectionnait quelqu'un, mais `parseMentions` refusait ensuite de linkifier
  // `bob@selecteduser` (même frontière) — la mention ne se matérialisait jamais.
  it('retourne null quand le `@` est collé après une lettre (fragment e-mail)', () => {
    const content = 'contact bob@alice';
    expect(detectMentionAtCursor(content, content.length)).toBeNull();
  });

  it('retourne null pour une adresse e-mail complète en cours de frappe', () => {
    const content = 'jane.doe@meeshy';
    expect(detectMentionAtCursor(content, content.length)).toBeNull();
  });

  it('détecte une mention après un `@` précédé d’un espace malgré un e-mail antérieur', () => {
    const content = 'from a@b.com to @ali';
    expect(detectMentionAtCursor(content, content.length)?.query).toBe('ali');
  });

  it('reste une mention quand le `@` suit une ponctuation non-nom (parenthèse)', () => {
    const content = 'cc (@ali';
    expect(detectMentionAtCursor(content, content.length)?.query).toBe('ali');
  });
});
