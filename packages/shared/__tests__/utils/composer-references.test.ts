import { describe, it, expect } from 'vitest';
import {
  upsertReference,
  removeReference,
  referencePayload,
  removingHandle,
  DECLARABLE_DISPLAYS,
} from '../../utils/composer-references.js';

describe('upsertReference', () => {
  it('ajoute une personne absente', () => {
    const result = upsertReference({ username: 'alice', display: 'NOTE' }, []);
    expect(result).toEqual([{ username: 'alice', display: 'NOTE' }]);
  });

  it('change le mode EN PLACE quand elle est déjà là', () => {
    const existing = [
      { username: 'alice', display: 'PINNED' as const },
      { username: 'bob', display: 'SILENT' as const },
    ];
    const result = upsertReference({ username: 'Alice', display: 'NOTE' }, existing);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ username: 'alice', display: 'NOTE' });
    expect(result[1].username).toBe('bob');
  });

  it('préserve la casse d\'origine à l\'ajout — jumelle du homologue Swift, qui ne la touche pas', () => {
    // `ComposerReferences.upsert` (Swift) ajoute `reference` telle quelle sur
    // le chemin d'ajout ; seul le chemin "déjà là" ne touche pas au username
    // existant. Aplatir en minuscules ICI ferait dévier le chip affiché
    // (`ReferencePicker` rend `reference.username` tel quel) du pseudo réel
    // de la personne, que `User.username` n'oblige pas à être en minuscules.
    const result = upsertReference({ username: 'Alice', display: 'NOTE' }, []);
    expect(result).toEqual([{ username: 'Alice', display: 'NOTE' }]);
  });
});

describe('removeReference', () => {
  it('retire sans tenir compte de la casse', () => {
    expect(removeReference('ALICE', [{ username: 'alice', display: 'NOTE' }])).toEqual([]);
  });
});

describe('referencePayload', () => {
  it('porte le mode de chaque référence', () => {
    const payload = referencePayload([
      { username: 'alice', display: 'PINNED' },
      { username: 'bob', userId: 'u-bob', display: 'SILENT' },
    ]);

    expect(payload).toEqual([
      { username: 'alice', display: 'PINNED' },
      { userId: 'u-bob', display: 'SILENT' },
    ]);
  });

  it('ne déclare JAMAIS INLINE — le serveur le dérive du texte', () => {
    expect(referencePayload([{ username: 'alice', display: 'INLINE' }])).toEqual([]);
  });
});

describe('removingHandle', () => {
  it('retire le handle et l\'espace qu\'il laisserait', () => {
    expect(removingHandle('alice', 'Soirée avec @alice hier')).toBe('Soirée avec hier');
    expect(removingHandle('alice', '@alice')).toBe('');
    expect(removingHandle('alice', 'bravo @Alice !')).toBe('bravo !');
  });

  it('laisse les autres handles tranquilles', () => {
    expect(removingHandle('alice', '@alice et @alicia')).toBe('et @alicia');
  });

  it('ne touche pas un `@handle` collé à un caractère de nom (adresse e-mail — frontière gauche)', () => {
    // `bob@alice` : le `@` est précédé d'une lettre, donc jamais détecté comme
    // mention par parseMentions/hasMentions — removingHandle ne doit pas le
    // retirer non plus (parité de span détection ⇄ suppression).
    expect(removingHandle('alice', 'écris à bob@alice stp')).toBe('écris à bob@alice stp');
    expect(removingHandle('alice', 'bob@alice')).toBe('bob@alice');
    expect(removingHandle('alice', 'ping bob@alice!')).toBe('ping bob@alice!');
  });

  it('retire toujours un `@handle` réellement séparé (frontière gauche propre)', () => {
    expect(removingHandle('alice', 'coucou @alice ok')).toBe('coucou ok');
    // Après une ponctuation (non caractère de nom), le handle reste une mention.
    expect(removingHandle('alice', 'salut:@alice')).toBe('salut:');
  });

  it('retire un handle à tiret sans crasher (usernames type `@marie-claire`)', () => {
    // Le tiret est un caractère de username valide (`/^[a-zA-Z0-9_-]+$/`, cf.
    // mention-parser.ts). L'échappement local ajoutait `-` à sa classe, produisant
    // `\-` — un escape INVALIDE sous le flag `u`, donc `new RegExp` throwait un
    // SyntaxError sur TOUT username à tiret. La composition (transition INLINE →
    // note/silence) plantait au lieu de retirer le handle.
    expect(removingHandle('marie-claire', 'Bonjour @marie-claire !')).toBe('Bonjour !');
    expect(removingHandle('jean-pierre', '@jean-pierre')).toBe('');
  });

  it('ne confond pas un handle à tiret avec son préfixe (frontière droite)', () => {
    expect(removingHandle('marie', '@marie et @marie-claire')).toBe('et @marie-claire');
  });
});

describe('DECLARABLE_DISPLAYS', () => {
  it('exclut INLINE', () => {
    expect(DECLARABLE_DISPLAYS).toEqual(['PINNED', 'NOTE', 'SILENT']);
  });
});
