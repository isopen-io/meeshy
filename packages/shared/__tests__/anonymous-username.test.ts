/**
 * Le préfixe `ano_` est un ESPACE DE NOMS RÉSERVÉ, pas une décoration.
 *
 * Un participant anonyme et un compte inscrit se disputaient le même espace de
 * pseudos : `POST /anonymous/join/:linkId` interrogeait `User.username` pour
 * savoir si le pseudo demandé était libre, et rendait 409 quand il ne l'était
 * pas. Deux défauts dans un : la collision est possible, et quand elle survient
 * l'anonyme n'a aucun recours — il n'a pas de compte, il n'a que ce lien.
 *
 * Réserver `ano_` retire la collision par CONSTRUCTION : aucun compte ne peut
 * porter un pseudo commençant par `ano_`, donc aucun pseudo anonyme ne peut
 * heurter un inscrit. Il ne reste à arbitrer que les anonymes entre eux, ce
 * qu'un suffixe numérique règle sans jamais refuser l'entrée.
 *
 * Le préfixe est aussi la marque VISIBLE de l'absence de compte — même rôle que
 * le message système d'arrivée, sur une autre surface.
 */

import { describe, it, expect } from 'vitest';
import {
  ANONYMOUS_USERNAME_PREFIX,
  isAnonymousUsername,
  toAnonymousUsername,
  suffixAnonymousUsername,
  withAnonymousGlyph,
  displayNameForParticipant,
} from '../utils/anonymous-username.js';

describe('toAnonymousUsername', () => {
  it('préfixe une base nue', () => {
    expect(toAnonymousUsername('bob_sm001')).toBe('ano_bob_sm001');
  });

  it('ne double jamais le préfixe', () => {
    expect(toAnonymousUsername('ano_bob')).toBe('ano_bob');
  });

  it('reconnaît le préfixe quelle que soit sa casse et le normalise', () => {
    expect(toAnonymousUsername('ANO_Bob')).toBe('ano_Bob');
  });

  it('écarte les caractères hors de l’alphabet des pseudos', () => {
    expect(toAnonymousUsername('bob smith!@#')).toBe('ano_bobsmith');
  });

  it('retombe sur une base neutre plutôt que de produire un pseudo nu', () => {
    expect(toAnonymousUsername('!!!')).toBe('ano_user');
    expect(toAnonymousUsername('')).toBe('ano_user');
  });

  it('borne la longueur totale, préfixe compris', () => {
    const result = toAnonymousUsername('x'.repeat(200));
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.startsWith(ANONYMOUS_USERNAME_PREFIX)).toBe(true);
  });
});

describe('isAnonymousUsername', () => {
  it('reconnaît un pseudo de l’espace réservé', () => {
    expect(isAnonymousUsername('ano_bob')).toBe(true);
    expect(isAnonymousUsername('ANO_bob')).toBe(true);
  });

  it('ne confond pas un pseudo qui commence seulement par les mêmes lettres', () => {
    expect(isAnonymousUsername('anonymous_bob')).toBe(false);
    expect(isAnonymousUsername('anobob')).toBe(false);
    expect(isAnonymousUsername('bob_ano_')).toBe(false);
  });

  it('refuse le préfixe seul — il ne nomme personne', () => {
    expect(isAnonymousUsername('ano_')).toBe(false);
  });

  it('tolère l’absence de valeur', () => {
    expect(isAnonymousUsername('')).toBe(false);
    expect(isAnonymousUsername(null)).toBe(false);
    expect(isAnonymousUsername(undefined)).toBe(false);
  });
});

describe('suffixAnonymousUsername', () => {
  it('accroche le rang sans perdre le préfixe', () => {
    expect(suffixAnonymousUsername('ano_bob', 2)).toBe('ano_bob2');
  });

  it('tronque la base plutôt que la borne de longueur', () => {
    const long = toAnonymousUsername('x'.repeat(60));
    const suffixed = suffixAnonymousUsername(long, 12);

    expect(suffixed.length).toBeLessThanOrEqual(50);
    expect(suffixed.endsWith('12')).toBe(true);
    expect(suffixed.startsWith(ANONYMOUS_USERNAME_PREFIX)).toBe(true);
  });
});

// ─── Glyphe fantôme ──────────────────────────────────────────────────────────
//
// C'est LUI qui dit « cette personne n'a pas de compte », pas le préfixe `ano_`
// — lequel reste ouvert aux comptes. Un inscrit nommé `ano_bob` ne porte pas le
// glyphe ; un anonyme le porte toujours, quel que soit son pseudo.

describe('withAnonymousGlyph', () => {
  it('appose le fantôme devant le libellé', () => {
    expect(withAnonymousGlyph('ano_bob')).toBe('👻 ano_bob');
  });

  it('est idempotent — deux vues composées ne font pas deux fantômes', () => {
    expect(withAnonymousGlyph(withAnonymousGlyph('Bob'))).toBe('👻 Bob');
  });

  it('rend le glyphe seul plutôt qu’un libellé vide', () => {
    expect(withAnonymousGlyph('')).toBe('👻');
    expect(withAnonymousGlyph(null)).toBe('👻');
  });
});

describe('displayNameForParticipant', () => {
  it('marque le participant sans compte', () => {
    expect(displayNameForParticipant('ano_bob', true)).toBe('👻 ano_bob');
  });

  it('laisse INTACT un compte, fût-il nommé `ano_bob`', () => {
    expect(displayNameForParticipant('ano_bob', false)).toBe('ano_bob');
  });

  it('tranche sur le statut, jamais sur le pseudo', () => {
    expect(displayNameForParticipant('Bob Smith', true)).toBe('👻 Bob Smith');
    expect(displayNameForParticipant('Bob Smith', false)).toBe('Bob Smith');
  });
});
