/**
 * replaceLiteral — SSOT anti-`$`-substitution helper
 *
 * `String.prototype.replace(search, replacementString)` interprète les séquences
 * `$$`, `$&`, `` $` ``, `$'`, `$n` DANS la chaîne de remplacement, quel que soit le
 * type de la recherche. Quand la valeur de remplacement provient de données
 * utilisateur (noms d'affichage, contenu), un `$` avale ou déforme silencieusement
 * le résultat. `replaceLiteral` insère la valeur VERBATIM, en préservant la
 * sémantique première-occurrence d'un needle chaîne.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { replaceLiteral } from '../../../utils/string-replace';

describe('replaceLiteral', () => {
  it('inserts a plain value at the first occurrence', () => {
    expect(replaceLiteral('Hello {name}', '{name}', 'Alice')).toBe('Hello Alice');
  });

  it('replaces only the first occurrence (parity with string-needle replace)', () => {
    expect(replaceLiteral('{x} and {x}', '{x}', 'A')).toBe('A and {x}');
  });

  it('inserts `$&` verbatim instead of the matched substring', () => {
    expect(replaceLiteral('Hi {n}', '{n}', 'Mr $&')).toBe('Hi Mr $&');
  });

  it('inserts `$$` verbatim instead of collapsing to a single `$`', () => {
    expect(replaceLiteral('Pay {n}', '{n}', 'A$$B')).toBe('Pay A$$B');
  });

  it('inserts `` $` `` verbatim instead of the pre-match portion', () => {
    expect(replaceLiteral('Hi {n}', '{n}', 'a$`b')).toBe('Hi a$`b');
  });

  it("inserts `$'` verbatim instead of the post-match portion", () => {
    expect(replaceLiteral('Hi {n}!', '{n}', "a$'b")).toBe("Hi a$'b!");
  });

  it('inserts `$1` verbatim (no capture-group interpretation)', () => {
    expect(replaceLiteral('Hi {n}', '{n}', '$1$2')).toBe('Hi $1$2');
  });

  it('returns the haystack unchanged when the needle is absent', () => {
    expect(replaceLiteral('nothing here', '{n}', 'X')).toBe('nothing here');
  });

  it('inserts an empty value by removing the needle', () => {
    expect(replaceLiteral('a{n}b', '{n}', '')).toBe('ab');
  });
});
