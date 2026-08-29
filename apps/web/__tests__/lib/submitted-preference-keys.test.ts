/**
 * Un écran de réglages ne peut pas répondre « ce que j'ai soumis » depuis son
 * état local : après un chargement raté, cet état EST un état de défauts, et
 * l'envoyer entier remet le document aux défauts de Zod.
 *
 * Ce que le projecteur garantit : seules les clés touchées voyagent.
 */

import {
  pickSubmitted,
  submittedKeys,
} from '@/lib/preferences/submitted-preference-keys';

describe('submittedKeys', () => {
  it('retire les clés dont la valeur est undefined', () => {
    expect(submittedKeys({ a: 1, b: undefined, c: false })).toEqual({
      a: 1,
      c: false,
    });
  });

  it('garde null, 0, la chaîne vide et le tableau vide — ce sont des valeurs', () => {
    expect(submittedKeys({ a: null, b: 0, c: '', d: [] })).toEqual({
      a: null,
      b: 0,
      c: '',
      d: [],
    });
  });
});

describe('pickSubmitted', () => {
  const state = {
    pushEnabled: true,
    soundEnabled: false,
    dndStartTime: '22:00',
    callsEnabled: false,
  };

  it('ne rend que les clés nommées, avec leur valeur courante', () => {
    expect(pickSubmitted(state, ['soundEnabled'])).toEqual({
      soundEnabled: false,
    });
  });

  it('ne rend AUCUNE clé quand rien n’a été touché', () => {
    expect(pickSubmitted(state, [])).toEqual({});
  });

  it('ignore une clé absente de l’état plutôt que d’envoyer undefined', () => {
    expect(pickSubmitted(state, ['soundEnabled', 'disparue'])).toEqual({
      soundEnabled: false,
    });
  });

  it('laisse hors du corps les voisins que l’écran n’a pas touchés', () => {
    const body = pickSubmitted(state, ['pushEnabled']);

    expect(Object.keys(body)).toEqual(['pushEnabled']);
    expect(body).not.toHaveProperty('callsEnabled');
  });
});
