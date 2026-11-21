import { describe, expect, test } from 'bun:test';

import type { Viewer } from '@/lib/api/viewer';

import { viewerParticipantOf } from './viewer-participant';

/**
 * **LA LIGNE DU LECTEUR SE CHERCHE SUR LA COLONNE DE SA CLÉ** (#20264) — un
 * inscrit par `userId`, un invité de lien par `id`. Les témoins de RANG
 * (colonne croisée) sont les seuls qui puissent tomber : la forme fausse et la
 * forme juste rendent le même verdict pour un inscrit dont la ligne porte les
 * deux colonnes.
 */
const INSCRIT: Pick<Viewer, 'id' | 'isAnonymous'> = { id: 'u-viewer', isAnonymous: false };
const INVITE: Pick<Viewer, 'id' | 'isAnonymous'> = { id: 'p-invite', isAnonymous: true };
const SANS_SESSION: Pick<Viewer, 'id' | 'isAnonymous'> = { id: null, isAnonymous: true };

const row = (id: string, userId?: string) => (userId === undefined ? { id } : { id, userId });

describe('viewerParticipantOf — la colonne se choisit sur la nature de la clé', () => {
  test('un inscrit : sa ligne se trouve par `userId`', () => {
    expect(viewerParticipantOf({ participants: [row('p-1', 'u-autre'), row('p-2', 'u-viewer')], viewer: INSCRIT })).toEqual(row('p-2', 'u-viewer'));
  });

  test('un invité de lien : sa ligne se trouve par `id` — elle n’a AUCUN `userId`', () => {
    expect(viewerParticipantOf({ participants: [row('p-1', 'u-autre'), row('p-invite')], viewer: INVITE })).toEqual(row('p-invite'));
  });

  test('un invité n’est pas nommé par la colonne d’un compte : une ligne dont le `userId` vaut sa clé ne le désigne pas', () => {
    expect(viewerParticipantOf({ participants: [row('p-1', 'p-invite')], viewer: INVITE })).toBeUndefined();
  });

  test('un inscrit n’est pas nommé par la colonne d’un invité : une ligne dont l’`id` vaut sa clé ne le désigne pas', () => {
    expect(viewerParticipantOf({ participants: [row('u-viewer', 'u-autre')], viewer: INSCRIT })).toBeUndefined();
  });

  test('aucune session, aucune ligne lue, une clé vide : rien — jamais la première ligne', () => {
    expect(viewerParticipantOf({ participants: [row('p-1', 'u-viewer')], viewer: SANS_SESSION })).toBeUndefined();
    expect(viewerParticipantOf({ participants: undefined, viewer: INSCRIT })).toBeUndefined();
    expect(viewerParticipantOf({ participants: [row('', 'u-autre')], viewer: { id: '', isAnonymous: true } })).toBeUndefined();
  });

  test('une ligne absente du détail (au-delà du plafond de 100) ne se fabrique pas', () => {
    expect(viewerParticipantOf({ participants: [row('p-early', 'u-autre')], viewer: { id: 'p-late', isAnonymous: true } })).toBeUndefined();
  });
});
