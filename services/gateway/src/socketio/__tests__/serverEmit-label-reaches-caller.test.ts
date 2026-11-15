/**
 * Le `label` d'une émission doit atteindre l'APPELANT, pas seulement le journal
 * par défaut (#17086, constat C1 de l'audit adversarial).
 *
 * `safeBroadcast` composait son `label` puis le JETAIT dès qu'un `onError` était
 * fourni — `if (onError) onError(error); else logger.error(label, error)`. La
 * forme était juste tant qu'une unité n'avait qu'UNE audience : l'appelant
 * savait de quoi on parlait. Elle devient fausse dès qu'une unité en a
 * plusieurs, et c'est exactement ce que #17086 a introduit : onze étiquettes
 * soigneusement composées, mortes en production, et quatre audiences perdues
 * rendant quatre journaux IDENTIQUES et anonymes.
 *
 * Pire, le même lot a fait RÉGRESSER le chemin par lecteur : il passait
 * `safeBroadcast(label, fn)` SANS `onError`, donc tombait dans le `else` et
 * journalisait `[broadcast] message:new (per reader user:<id>)`. Lui donner un
 * `onError` a supprimé la seule information que ce chemin publiait.
 *
 * Élargir le callback est sans risque pour les ~24 appelants existants : une
 * fonction à un paramètre accepte d'être appelée avec deux.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

import { safeBroadcast } from '../serverEmit';

describe('safeBroadcast — le label voyage avec la panne', () => {
  it("remet le label à l'appelant, en SECOND argument", () => {
    const onError = jest.fn();
    const boom = new TypeError('encodeur en défaut');

    safeBroadcast('message:new (masqué user:h1)', () => { throw boom; }, onError);

    expect(onError).toHaveBeenCalledWith(boom, 'message:new (masqué user:h1)');
  });

  it("deux audiences perdues se DISTINGUENT chez l'appelant", () => {
    const seen: string[] = [];
    const onError = (_error: unknown, label: string) => seen.push(label);

    safeBroadcast('message:new (room conversation:c1)', () => { throw new Error('a'); }, onError);
    safeBroadcast('message:new (expéditeur user:u1)', () => { throw new Error('b'); }, onError);

    expect(seen).toEqual(['message:new (room conversation:c1)', 'message:new (expéditeur user:u1)']);
  });

  it("sans appelant, le journal du module reste le repli — et le label y était déjà", () => {
    expect(() => safeBroadcast('message:new (room c1)', () => { throw new Error('x'); })).not.toThrow();
  });

  it('ne touche à rien quand rien ne lève', () => {
    const onError = jest.fn();
    const emit = jest.fn();

    safeBroadcast('message:new', emit, onError);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
