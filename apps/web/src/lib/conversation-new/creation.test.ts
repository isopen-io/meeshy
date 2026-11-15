import { describe, expect, test } from 'bun:test';

import { CREATION_FAILED, CREATION_OFFLINE, creationOutcomeOf } from './creation';

/**
 * CE QU'UN TAP SUR UNE PERSONNE PRODUIT (#6705) — la création d'une
 * conversation directe rend un `ApiResult`, jamais une exception : sans cette
 * lecture, un tap ne faisait RIEN (revue #5652). Ces témoins tiennent les deux
 * seules issues permises : ouvrir le fil créé, ou dire pourquoi il ne s'ouvre
 * pas — et le dire sans promettre ce que personne ne fera.
 */

describe('ce qu’un tap sur une personne produit', () => {
  test('une création réussie ouvre le fil de la conversation rendue', () => {
    expect(creationOutcomeOf({ result: { ok: true, status: 201, data: { id: 'c-42' } }, online: true })).toEqual({
      kind: 'open',
      conversationId: 'c-42',
    });
  });

  test('une conversation directe DÉJÀ existante (200) s’ouvre de la même façon', () => {
    expect(creationOutcomeOf({ result: { ok: true, status: 200, data: { id: 'c-7' } }, online: true })).toEqual({
      kind: 'open',
      conversationId: 'c-7',
    });
  });

  test('un refus en ligne se dit, et invite à réessayer', () => {
    expect(creationOutcomeOf({ result: { ok: false, status: 500, error: 'boom' }, online: true })).toEqual({
      kind: 'failure',
      message: CREATION_FAILED,
    });
  });

  test('hors ligne, l’échec dit la cause sans promettre une ouverture automatique qui n’existe pas', () => {
    const outcome = creationOutcomeOf({ result: { ok: false, status: 0, error: 'offline' }, online: false });
    expect(outcome).toEqual({ kind: 'failure', message: CREATION_OFFLINE });
    expect(CREATION_OFFLINE).not.toMatch(/s’ouvrira|s'ouvrira/);
  });
});
