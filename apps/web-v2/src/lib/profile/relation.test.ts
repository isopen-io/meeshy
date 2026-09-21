import { describe, expect, test } from 'bun:test';

import type { FriendRequestRecord } from '@/lib/api/friend-requests';

import { actionsFor, bucketNeededFor, relationFromServed } from './relation';

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

describe('bucketNeededFor', () => {
  test('SEULE une relation en attente coûte un panier — zéro requête de plus dans le cas nominal', () => {
    expect(bucketNeededFor('pending_received')).toBe('received');
    expect(bucketNeededFor('pending_sent')).toBe('sent');
    expect(bucketNeededFor('none')).toBeNull();
    expect(bucketNeededFor('friend')).toBeNull();
    expect(bucketNeededFor('self')).toBeNull();
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

  test('l’identifiant manquant ne RETIRE pas un geste — il le laisse en attente, le rendu s’en charge', () => {
    expect(actionsFor({ kind: 'pendingReceived', request: null })).toEqual(['accept', 'reject', 'write', 'block', 'report']);
  });

  test('« Renvoyer la demande » d’iOS n’est PAS repris — « Annuler » puis « Ajouter » donne le même résultat', () => {
    expect(actionsFor({ kind: 'pendingSent', request: request('r1') })).not.toContain('resend');
  });
});
