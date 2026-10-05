/**
 * L'ATLAS DES LANGUES (#9388, conformité E-3 à E-5) — un tampon exige les deux
 * sens, ne garde jamais l'interlocuteur, ne se nourrit pas d'une conversation
 * chiffrée, et s'efface à la demande.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { AtlasService, ATLAS_RECEIVER_CAP } from '../AtlasService';
import { fakeGameDb, seedUser, USER, OTHER } from './fakeGameDb';

const CONV = '68b000000000000000000001';

const setup = () => {
  const db = fakeGameDb();
  seedUser(db, { timezone: 'UTC' }, USER);
  seedUser(db, { timezone: 'UTC' }, OTHER);
  db.participant.rows.push({ id: 'p1', conversationId: CONV, userId: USER, isActive: true });
  db.participant.rows.push({ id: 'p2', conversationId: CONV, userId: OTHER, isActive: true });
  return { db, service: new AtlasService(db.prisma) };
};

describe('AtlasService.record', () => {
  it('un seul sens ne tamponne pas ; les deux tamponnent, une fois, au jour du second', async () => {
    const { service } = setup();
    expect(await service.record({ userId: USER, kind: 'sent', language: 'es', now: new Date('2026-10-12T10:00:00Z') })).toBeNull();
    expect((await service.state(USER)).es).toEqual({ sent: true, received: false, stampedOn: null });

    expect(await service.record({ userId: USER, kind: 'received', language: 'es', now: new Date('2026-10-14T10:00:00Z') })).toBe('es');
    expect((await service.state(USER)).es).toEqual({ sent: true, received: true, stampedOn: '2026-10-14' });

    expect(await service.record({ userId: USER, kind: 'received', language: 'es' })).toBeNull();
  });

  it('une langue hors catalogue ou inconnue ne laisse aucune trace', async () => {
    const { db, service } = setup();
    expect(await service.record({ userId: USER, kind: 'sent', language: 'unknown' })).toBeNull();
    expect(await service.record({ userId: USER, kind: 'sent', language: 'xx-nope' })).toBeNull();
    expect(db.atlasStamp.rows).toHaveLength(0);
  });

  it('les variantes régionales se plient sur la langue (pt-BR = pt)', async () => {
    const { service } = setup();
    await service.record({ userId: USER, kind: 'sent', language: 'pt-BR' });
    await service.record({ userId: USER, kind: 'received', language: 'pt' });
    expect((await service.state(USER)).pt?.stampedOn).not.toBeNull();
  });

  it('le document ne porte ni interlocuteur ni conversation', async () => {
    const { db, service } = setup();
    await service.recordMessage({ senderUserId: USER, conversationId: CONV, originalLanguage: 'fr' });
    const columns = new Set(db.atlasStamp.rows.flatMap((row) => Object.keys(row)));
    expect([...columns].sort()).toEqual(['createdAt', 'id', 'language', 'receivedAt', 'sentAt', 'stampedOn', 'userId']);
  });
});

describe('AtlasService.recordMessage', () => {
  it('l’expéditeur a ENVOYÉ, le destinataire a REÇU', async () => {
    const { service } = setup();
    await service.recordMessage({ senderUserId: USER, conversationId: CONV, originalLanguage: 'ja' });
    expect((await service.state(USER)).ja).toMatchObject({ sent: true, received: false });
    expect((await service.state(OTHER)).ja).toMatchObject({ sent: false, received: true });
  });

  it('rien dans une conversation chiffrée de bout en bout (E-3)', async () => {
    const { db, service } = setup();
    db.conversation.rows.push({ id: CONV, encryptionEnabledAt: new Date('2026-10-01T00:00:00Z') });
    expect(await service.recordMessage({ senderUserId: USER, conversationId: CONV, originalLanguage: 'ja' })).toEqual([]);
    expect(db.atlasStamp.rows).toHaveLength(0);
  });

  it('un état de chiffrement illisible ferme (fail-closed)', async () => {
    const { db, service } = setup();
    (db.conversation as unknown as { findUnique: () => Promise<never> }).findUnique = () => Promise.reject(new Error('down'));
    await service.recordMessage({ senderUserId: USER, conversationId: CONV, originalLanguage: 'ja' });
    expect(db.atlasStamp.rows).toHaveLength(0);
  });

  it('une salle au-delà du plafond ne nourrit que l’expéditeur', async () => {
    const { db, service } = setup();
    for (let i = 0; i < ATLAS_RECEIVER_CAP + 3; i += 1) {
      db.participant.rows.push({ id: `x${i}`, conversationId: CONV, userId: `68c0000000000000000000${String(i).padStart(2, '0')}`, isActive: true });
    }
    await service.recordMessage({ senderUserId: USER, conversationId: CONV, originalLanguage: 'de' });
    expect(db.atlasStamp.rows.filter((r) => r.receivedAt != null)).toHaveLength(0);
    expect(db.atlasStamp.rows.filter((r) => r.sentAt != null)).toHaveLength(1);
  });

  it('un message qui complète les deux sens rend la langue tamponnée', async () => {
    const { service } = setup();
    await service.recordMessage({ senderUserId: USER, conversationId: CONV, originalLanguage: 'ko' });
    const stamped = await service.recordMessage({ senderUserId: OTHER, conversationId: CONV, originalLanguage: 'ko' });
    expect(stamped).toEqual(['ko', 'ko']);
    expect((await service.state(USER)).ko?.stampedOn).not.toBeNull();
    expect((await service.state(OTHER)).ko?.stampedOn).not.toBeNull();
  });
});

describe('AtlasService.erase', () => {
  it('efface un tampon, ou tout l’Atlas', async () => {
    const { service } = setup();
    await service.recordMessage({ senderUserId: USER, conversationId: CONV, originalLanguage: 'ja' });
    await service.recordMessage({ senderUserId: USER, conversationId: CONV, originalLanguage: 'ko' });

    expect(await service.erase(USER, 'ja')).toBe(1);
    expect(Object.keys(await service.state(USER))).toEqual(['ko']);
    expect(await service.erase(USER)).toBe(1);
    expect(await service.state(USER)).toEqual({});
  });
});
