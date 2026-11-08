/**
 * #14107 (audit M4) — `mention:created` ne part pas vers le destinataire d'une
 * demande de message en attente ; une lecture qui échoue n'émet rien.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { withoutPendingMessageRequests } from '../../../services/MentionService';
import { pendingRequestUserIds } from '../../../services/messaging/pendingMessageRequests';

describe('withoutPendingMessageRequests', () => {
  it('retire le destinataire d\'une demande en attente, garde les autres', async () => {
    const prisma = { participant: { findMany: jest.fn(async () => [{ userId: 'dest' }]) } };
    await expect(withoutPendingMessageRequests(prisma as never, 'conv', ['dest', 'membre'])).resolves.toEqual(['membre']);
  });

  it('une lecture qui échoue n\'émet rien', async () => {
    const prisma = { participant: { findMany: jest.fn(async () => { throw new Error('db down'); }) } };
    await expect(withoutPendingMessageRequests(prisma as never, 'conv', ['dest'])).resolves.toEqual([]);
  });
});

/**
 * Le jumeau PUR du prédicat, pour les sites qui ont déjà la colonne sous la
 * main (#17074) : l'éventail d'ENVOI et l'éventail de NOTIFICATION d'une
 * édition. La règle était formulée deux fois et appliquée une — ce fichier est
 * l'endroit où elle est écrite une seule.
 */
describe('pendingRequestUserIds', () => {
  it('nomme ceux dont la demande est en attente, et eux seuls', () => {
    const silenced = pendingRequestUserIds([
      { userId: 'en-attente', messageRequestAt: new Date('2026-11-01T08:00:00Z') },
      { userId: 'membre', messageRequestAt: null },
    ]);

    expect([...silenced]).toEqual(['en-attente']);
  });

  // Une ligne SANS la colonne n'est pas silencieuse, et c'est le verdict JUSTE :
  // une projection qui ne demande pas `messageRequestAt` est un défaut de
  // `select` — que le témoin de projection attrape chez l'appelant — jamais une
  // autorisation à inventer ici.
  it('une colonne ABSENTE ne silencie pas — c’est un défaut de projection, pas une permission', () => {
    expect([...pendingRequestUserIds([{ userId: 'membre' }])]).toEqual([]);
  });

  it('un participant SANS compte n’entre pas dans l’ensemble — il n’a pas d’id à nommer', () => {
    expect([...pendingRequestUserIds([{ userId: null, messageRequestAt: new Date() }])]).toEqual([]);
  });
});
