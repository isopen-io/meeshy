import { describe, expect, test } from 'bun:test';

import type { FriendRequestRecord } from '@/lib/api/friend-requests';

import { actionsFor, pendingRequestFrom, relationFromServed } from './relation';

/**
 * LA LOI DE L'ÉTAT RELATIONNEL DU PROFIL (#7083) — pure, sans DOM ni requête.
 *
 * Elle traduit ce que la passerelle SERT (`relation`, cinq valeurs) en ce que
 * l'écran REND, sans inventer une sixième valeur et sans faire d'un panier
 * plafonné à cent lignes la source de l'état affiché.
 */

const request = (id: string): FriendRequestRecord => ({
  id,
  senderId: 'u-other',
  receiverId: 'u-viewer',
  status: 'pending',
  message: null,
  createdAt: '2026-09-19T08:00:00.000Z',
  sender: null,
  receiver: null,
});

describe('relationFromServed', () => {
  test('les cinq valeurs de la passerelle se traduisent, sans en inventer une sixième', () => {
    expect(relationFromServed({ served: 'self', blocked: false, request: null })).toEqual({ kind: 'self' });
    expect(relationFromServed({ served: 'friend', blocked: false, request: null })).toEqual({ kind: 'friend' });
    expect(relationFromServed({ served: 'none', blocked: false, request: null })).toEqual({ kind: 'none' });
    expect(relationFromServed({ served: 'pending_sent', blocked: false, request: request('r1') })).toEqual({
      kind: 'pendingSent',
      request: request('r1'),
    });
    expect(relationFromServed({ served: 'pending_received', blocked: false, request: request('r2') })).toEqual({
      kind: 'pendingReceived',
      request: request('r2'),
    });
  });

  test('BLOQUÉ prime sur tout sauf soi — l’ordre d’`UserRelationshipResolver`', () => {
    expect(relationFromServed({ served: 'friend', blocked: true, request: null })).toEqual({ kind: 'blocked' });
    expect(relationFromServed({ served: 'pending_received', blocked: true, request: request('r1') })).toEqual({ kind: 'blocked' });
    expect(relationFromServed({ served: 'self', blocked: true, request: null })).toEqual({ kind: 'self' });
  });

  test('une demande en attente dont l’identifiant N’EST PAS ENCORE connu reste en attente, jamais « Ajouter »', () => {
    expect(relationFromServed({ served: 'pending_received', blocked: false, request: null })).toEqual({
      kind: 'pendingReceived',
      request: null,
    });
    expect(relationFromServed({ served: 'pending_sent', blocked: false, request: null })).toEqual({
      kind: 'pendingSent',
      request: null,
    });
  });
});

/**
 * **LA LIGNE SE BÂTIT DEPUIS LE FIL, PLUS DEPUIS UN PANIER** (#7122) — la
 * passerelle sert `relationRequestId` avec `expand=relation` ; l'écran n'a
 * plus à charger `GET /directory/friend-requests` pour retrouver l'identifiant
 * qu'il doit envoyer, ni à désarmer ses trois gestes le temps du vol.
 */
describe('pendingRequestFrom', () => {
  const person = { id: 'u-other', username: 'other', displayName: 'Other', avatar: null };

  test('une demande REÇUE nomme l’autre en EXPÉDITEUR, le lecteur en destinataire', () => {
    const row = pendingRequestFrom({ served: 'pending_received', requestId: 'fr-1', person, viewerId: 'u-viewer' });
    expect(row?.id).toBe('fr-1');
    expect(row?.senderId).toBe('u-other');
    expect(row?.receiverId).toBe('u-viewer');
    expect(row?.status).toBe('pending');
    expect(row?.sender).toEqual(person);
  });

  test('une demande ENVOYÉE inverse les deux parties', () => {
    const row = pendingRequestFrom({ served: 'pending_sent', requestId: 'fr-2', person, viewerId: 'u-viewer' });
    expect(row?.senderId).toBe('u-viewer');
    expect(row?.receiverId).toBe('u-other');
    expect(row?.receiver).toEqual(person);
  });

  test('hors attente, AUCUNE ligne — un identifiant servi par erreur n’en fabrique pas une', () => {
    for (const served of ['friend', 'none', 'self'] as const) {
      expect(pendingRequestFrom({ served, requestId: 'fr-3', person, viewerId: 'u-viewer' })).toBeNull();
    }
  });

  test('sans identifiant, AUCUNE ligne — le geste ne part pas dans le vide', () => {
    expect(pendingRequestFrom({ served: 'pending_received', requestId: null, person, viewerId: 'u-viewer' })).toBeNull();
  });
});

/**
 * **UN GESTE SANS SA LIGNE N'EST PAS OFFERT** (#7122) — il l'était, DÉSACTIVÉ,
 * le temps qu'un panier arrive. Le panier a disparu : ce qui reste est le cas
 * d'une passerelle qui ne sert pas encore `relationRequestId`, et un bouton
 * qui ne pourrait alors QUE échouer est un contrôle qui ment (loi 4). La
 * bannière de contexte, elle, continue de dire de quoi il s'agit.
 */
describe('actionsFor sans la ligne de la demande', () => {
  test('« Accepter » et « Refuser » ne sont pas offerts sans leur ligne', () => {
    expect(actionsFor({ kind: 'pendingReceived', request: null })).toEqual(['write', 'block', 'report']);
  });

  test('« Annuler » non plus', () => {
    expect(actionsFor({ kind: 'pendingSent', request: null })).toEqual(['write', 'block', 'report']);
  });
});

/* AMENDÉ PAR #7187 — `report` a rejoint chaque état SAUF `self` : le port
   `POST /api/v1/reports` existait côté passerelle et n'avait aucun appelant.
   Y compris sur un compte BLOQUÉ : bloquer met fin au contact, signaler
   prévient la modération, et l'un n'a jamais valu l'autre.
   Ces témoins restent EXHAUSTIFS et ORDONNÉS — c'est ce qui leur permet de
   dire qu'un geste a disparu, ou qu'un s'est glissé sans décision. */
describe('actionsFor', () => {
  test('chaque état offre exactement les gestes d’iOS, « Écrire » en plus', () => {
    expect(actionsFor({ kind: 'self' })).toEqual([]);
    expect(actionsFor({ kind: 'blocked' })).toEqual(['unblock', 'report']);
    expect(actionsFor({ kind: 'friend' })).toEqual(['write', 'block', 'report']);
    expect(actionsFor({ kind: 'none' })).toEqual(['add', 'write', 'block', 'report']);
    expect(actionsFor({ kind: 'pendingSent', request: request('r1') })).toEqual(['cancel', 'write', 'block', 'report']);
    expect(actionsFor({ kind: 'pendingReceived', request: request('r2') })).toEqual(['accept', 'reject', 'write', 'block', 'report']);
  });

  /* AMENDÉ PAR #7122 — la propriété gardée ici a CHANGÉ, et il faut dire
     laquelle. Ce témoin mesurait « l'identifiant manquant ne retire pas un
     geste, le rendu le désactive » : c'était juste tant qu'un panier était en
     VOL — l'attente finissait, et le bouton s'armait. La passerelle sert
     maintenant `relationRequestId` avec l'identité : il n'y a plus d'attente,
     et un identifiant absent ne le sera JAMAIS moins. Un bouton qui ne peut
     que échouer n'est pas offert (loi 4). Le témoin vit désormais dans
     « actionsFor sans la ligne de la demande » ci-dessus. */

  test('« Renvoyer la demande » d’iOS n’est PAS repris — « Annuler » puis « Ajouter » donne le même résultat', () => {
    expect(actionsFor({ kind: 'pendingSent', request: request('r1') })).not.toContain('resend');
  });
});
