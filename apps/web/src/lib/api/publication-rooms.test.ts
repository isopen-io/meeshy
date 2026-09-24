import { afterEach, describe, expect, test } from 'bun:test';

import { acquirePublicationRoom, bindPublicationRoomTransport, type PublicationRoomBinding } from './publication-rooms';

/**
 * LE REGISTRE DES SALLES DE PUBLICATION (#7395) — la loi seule, sans écran ni
 * socket : un transport de témoin note ce qui partirait vers la passerelle.
 */

type Sent = readonly (readonly ['join' | 'leave', string])[];

let bindings: readonly PublicationRoomBinding[] = [];
let releases: readonly (() => void)[] = [];

afterEach(() => {
  for (const release of releases) release();
  releases = [];
  for (const binding of bindings) binding.detach();
  bindings = [];
});

function recorder(): { readonly sent: () => Sent; readonly binding: PublicationRoomBinding } {
  let sent: Sent = [];
  const binding = bindPublicationRoomTransport({
    join: (postId) => {
      sent = [...sent, ['join', postId]];
    },
    leave: (postId) => {
      sent = [...sent, ['leave', postId]];
    },
  });
  bindings = [...bindings, binding];
  return { sent: () => sent, binding };
}

function hold(postId: string): () => void {
  const release = acquirePublicationRoom(postId);
  releases = [...releases, release];
  return release;
}

describe('rejoindre et quitter', () => {
  test('le premier hôte rejoint, le départ du dernier quitte', () => {
    const { sent } = recorder();
    const release = hold('p1');
    expect(sent()).toEqual([['join', 'p1']]);
    release();
    expect(sent()).toEqual([
      ['join', 'p1'],
      ['leave', 'p1'],
    ]);
  });

  test('deux hôtes sur la même publication : UN join, et le départ du premier ne quitte rien', () => {
    const { sent } = recorder();
    const first = hold('p1');
    const second = hold('p1');
    expect(sent()).toEqual([['join', 'p1']]);
    first();
    expect(sent()).toEqual([['join', 'p1']]);
    second();
    expect(sent()).toEqual([
      ['join', 'p1'],
      ['leave', 'p1'],
    ]);
  });

  test('libérer deux fois ne décompte qu’une fois — un double démontage ne vole pas la salle d’un autre hôte', () => {
    const { sent } = recorder();
    const other = hold('p1');
    const mine = hold('p1');
    mine();
    mine();
    expect(sent()).toEqual([['join', 'p1']]);
    other();
    expect(sent()).toEqual([
      ['join', 'p1'],
      ['leave', 'p1'],
    ]);
  });

  test('deux publications, deux salles indépendantes', () => {
    const { sent } = recorder();
    const a = hold('a');
    hold('b');
    a();
    expect(sent()).toEqual([
      ['join', 'a'],
      ['join', 'b'],
      ['leave', 'a'],
    ]);
  });
});

describe('la connexion qui arrive, et celle qui revient', () => {
  test('une salle tenue AVANT qu’aucune connexion n’existe est rejointe au rejeu, pas avant', () => {
    hold('p1');
    const { sent, binding } = recorder();
    expect(sent()).toEqual([]);
    binding.rejoin();
    expect(sent()).toEqual([['join', 'p1']]);
  });

  test('le rejeu rejoint CHAQUE salle tenue, une fois chacune — et jamais une salle quittée', () => {
    const { sent, binding } = recorder();
    hold('a');
    hold('a');
    const b = hold('b');
    b();
    binding.rejoin();
    expect(sent()).toEqual([
      ['join', 'a'],
      ['join', 'b'],
      ['leave', 'b'],
      ['join', 'a'],
    ]);
  });

  test('une connexion détachée ne reçoit plus rien ; la suivante reprend les salles tenues', () => {
    const first = recorder();
    hold('p1');
    first.binding.detach();
    const release = hold('p2');
    release();
    expect(first.sent()).toEqual([['join', 'p1']]);

    const second = recorder();
    second.binding.rejoin();
    expect(second.sent()).toEqual([['join', 'p1']]);
  });

  test('détacher une connexion REMPLACÉE ne débranche pas celle qui l’a remplacée', () => {
    const stale = recorder();
    const current = recorder();
    stale.binding.detach();
    hold('p1');
    expect(stale.sent()).toEqual([]);
    expect(current.sent()).toEqual([['join', 'p1']]);
  });
});
