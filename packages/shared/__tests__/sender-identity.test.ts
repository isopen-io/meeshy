/**
 * « Cet auteur a-t-il un compte ? » — UNE question, UNE réponse.
 *
 * Trois discriminants coexistaient sur le fil, chacun servi par un chemin
 * différent, aucun servi partout :
 *
 *   | champ         | qui l'émet                                   |
 *   |---------------|----------------------------------------------|
 *   | `type`        | payload socket `message:new`, REST messages  |
 *   | `isMeeshyer`  | routes `/links/*` uniquement                 |
 *   | `isAnonymous` | déclaré dans `SocketIOUser`, jamais rempli   |
 *
 * Une vue qui voulait marquer les auteurs sans compte devait donc connaître le
 * chemin par lequel son message était arrivé. `MessageNameDate.tsx` a tranché à
 * sa façon : `const isAnonymous = false`, et sa branche `<Ghost />` — écrite,
 * stylée — n'a jamais rendu un seul fantôme.
 *
 * `isAnonymousSender` est la réponse unique. `type` fait foi ; les deux drapeaux
 * hérités ne servent que de repli pour les charges utiles qui ne le portent pas
 * encore, et disparaîtront quand `/links/*` émettra `type`.
 */

import { describe, it, expect } from 'vitest';
import { isAnonymousSender } from '../utils/sender-identity.js';

describe('isAnonymousSender', () => {
  it('lit `type` en priorité — le discriminant de la base', () => {
    expect(isAnonymousSender({ type: 'anonymous' })).toBe(true);
    expect(isAnonymousSender({ type: 'user' })).toBe(false);
    expect(isAnonymousSender({ type: 'bot' })).toBe(false);
  });

  it('accepte le repli `isMeeshyer` des routes de lien', () => {
    expect(isAnonymousSender({ isMeeshyer: false })).toBe(true);
    expect(isAnonymousSender({ isMeeshyer: true })).toBe(false);
  });

  it('accepte le repli `isAnonymous`', () => {
    expect(isAnonymousSender({ isAnonymous: true })).toBe(true);
    expect(isAnonymousSender({ isAnonymous: false })).toBe(false);
  });

  it('laisse `type` trancher contre un drapeau hérité qui le contredit', () => {
    expect(isAnonymousSender({ type: 'user', isMeeshyer: false })).toBe(false);
    expect(isAnonymousSender({ type: 'anonymous', isMeeshyer: true })).toBe(true);
  });

  // Le défaut compte : marquer à tort un inscrit comme sans compte est une
  // affirmation FAUSSE sur son identité. Ne rien dire quand on ne sait pas est
  // le seul repli acceptable.
  it('répond `false` quand aucun discriminant n’est présent', () => {
    expect(isAnonymousSender({ id: 'p1', username: 'alice' })).toBe(false);
    expect(isAnonymousSender({})).toBe(false);
    expect(isAnonymousSender(null)).toBe(false);
    expect(isAnonymousSender(undefined)).toBe(false);
  });

  it('ne se laisse pas prendre par un pseudo préfixé `ano_` — le nom ne prouve rien', () => {
    expect(isAnonymousSender({ username: 'ano_bob', type: 'user' })).toBe(false);
    expect(isAnonymousSender({ username: 'ano_bob' })).toBe(false);
  });
});
