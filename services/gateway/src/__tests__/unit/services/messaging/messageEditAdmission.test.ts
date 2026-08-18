/**
 * Qui a le droit d'éditer un message, et jusqu'à quand.
 *
 * La règle vivait recopiée à QUATRE endroits — le handler socket, les deux
 * `PUT` et le `PATCH` — et les quatre copies avaient déjà divergé : deux
 * n'imposaient aucune fenêtre de 24h, deux n'admettaient jamais un modérateur,
 * une lisait le rôle de conversation au lieu du rôle global. Cette unité est
 * l'unique énoncé de la règle ; les quatre entrées ne font plus que traduire sa
 * réponse dans leur transport.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import {
  admitMessageEdit,
  MESSAGE_EDIT_WINDOW_MS,
} from '../../../../services/messaging/messageEditAdmission';

const AUTHOR = 'user-author';
const OTHER = 'user-other';
const CONV = 'conv-1';
const NOW = 1_700_000_000_000;

const freshCreatedAt = new Date(NOW - 60_000);
const staleCreatedAt = new Date(NOW - MESSAGE_EDIT_WINDOW_MS - 1);

function buildPrisma(overrides: {
  role?: string | null;
  member?: boolean;
  userThrows?: boolean;
  participantThrows?: boolean;
} = {}) {
  const findUnique = jest.fn<any>(async () => {
    if (overrides.userThrows) throw new Error('db down');
    return overrides.role === undefined ? { role: 'USER' } : { role: overrides.role };
  });
  const findFirst = jest.fn<any>(async () => {
    if (overrides.participantThrows) throw new Error('db down');
    if (overrides.member === false) return null;
    return { id: 'part-1', user: { role: overrides.role === undefined ? 'USER' : overrides.role } };
  });
  return {
    user: { findUnique },
    participant: { findFirst },
  };
}

const admit = (params: {
  prisma: ReturnType<typeof buildPrisma>;
  editorUserId: string;
  authorUserId?: string | null;
  createdAt?: Date | string | null;
  onError?: (error: unknown) => void;
}) =>
  admitMessageEdit({
    prisma: params.prisma as never,
    editorUserId: params.editorUserId,
    message: {
      authorUserId: params.authorUserId === undefined ? AUTHOR : params.authorUserId,
      conversationId: CONV,
      // Ces témoins portent sur QUI édite et JUSQU'À QUAND, pas sur l'état du
      // conteneur : `null` est le permissif explicite, et laisse chacune de
      // leurs assertions dire exactement ce qu'elle disait. L'état terminal a
      // ses propres témoins dans `conversationClosedWriteVerbs.test.ts`.
      conversation: null,
      createdAt: params.createdAt === undefined ? freshCreatedAt : params.createdAt,
    },
    now: NOW,
    onError: params.onError,
  });

describe('admitMessageEdit — l\'auteur, dans sa fenêtre', () => {
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildPrisma();
  });

  it('admet l\'auteur d\'un message récent sans interroger la base', async () => {
    const decision = await admit({ prisma, editorUserId: AUTHOR });

    expect(decision).toEqual({ admitted: true, asModerator: false, windowBypassed: false });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.participant.findFirst).not.toHaveBeenCalled();
  });

  it('refuse l\'auteur au-delà de 24h', async () => {
    const decision = await admit({ prisma, editorUserId: AUTHOR, createdAt: staleCreatedAt });

    expect(decision).toEqual({ admitted: false, reason: 'edit-window-expired' });
  });

  it('admet l\'auteur au-delà de 24h quand son rôle GLOBAL le privilégie', async () => {
    prisma = buildPrisma({ role: 'MODERATOR' });

    const decision = await admit({ prisma, editorUserId: AUTHOR, createdAt: staleCreatedAt });

    expect(decision).toEqual({ admitted: true, asModerator: false, windowBypassed: true });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: AUTHOR },
      select: { role: true },
    });
  });

  it.each(['ADMIN', 'BIGBOSS'])('admet aussi un auteur %s hors fenêtre', async (role) => {
    prisma = buildPrisma({ role });

    const decision = await admit({ prisma, editorUserId: AUTHOR, createdAt: staleCreatedAt });

    expect(decision).toMatchObject({ admitted: true, windowBypassed: true });
  });

  it('la borne est INCLUSIVE : un message d\'exactement 24h est encore éditable', async () => {
    const decision = await admit({
      prisma,
      editorUserId: AUTHOR,
      createdAt: new Date(NOW - MESSAGE_EDIT_WINDOW_MS),
    });

    expect(decision).toMatchObject({ admitted: true });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('un `createdAt` absent ou illisible n\'a jamais bloqué personne, et ne bloque toujours pas', async () => {
    await expect(admit({ prisma, editorUserId: AUTHOR, createdAt: null })).resolves.toMatchObject({ admitted: true });
    await expect(admit({ prisma, editorUserId: AUTHOR, createdAt: 'pas-une-date' })).resolves.toMatchObject({ admitted: true });
  });

  it('accepte une date sérialisée en chaîne — les lectures Prisma ne sont pas toutes des `Date`', async () => {
    const decision = await admit({
      prisma,
      editorUserId: AUTHOR,
      createdAt: staleCreatedAt.toISOString(),
    });

    expect(decision).toEqual({ admitted: false, reason: 'edit-window-expired' });
  });
});

describe('admitMessageEdit — quelqu\'un d\'autre que l\'auteur', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuse un simple membre', async () => {
    const prisma = buildPrisma({ role: 'USER' });

    const decision = await admit({ prisma, editorUserId: OTHER });

    expect(decision).toEqual({ admitted: false, reason: 'not-author' });
  });

  it('admet un modérateur GLOBAL membre actif de la conversation, en UNE lecture', async () => {
    const prisma = buildPrisma({ role: 'MODERATOR', member: true });

    const decision = await admit({ prisma, editorUserId: OTHER });

    expect(decision).toEqual({ admitted: true, asModerator: true, windowBypassed: false });
    expect(prisma.participant.findFirst).toHaveBeenCalledWith({
      where: { conversationId: CONV, userId: OTHER, isActive: true },
      select: { id: true, user: { select: { role: true } } },
    });
    // Appartenance et rôle viennent de la MÊME lecture : l'unification
    // n'ajoute aucun aller-retour à la branche modérateur.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuse un modérateur qui n\'est pas membre actif — le privilège ne franchit pas la porte', async () => {
    const prisma = buildPrisma({ role: 'ADMIN', member: false });

    const decision = await admit({ prisma, editorUserId: OTHER });

    expect(decision).toEqual({ admitted: false, reason: 'not-a-member' });
  });

  it('la fenêtre de 24h ne s\'applique QU\'À l\'auteur — un modérateur édite un vieux message', async () => {
    const prisma = buildPrisma({ role: 'MODERATOR', member: true });

    const decision = await admit({ prisma, editorUserId: OTHER, createdAt: staleCreatedAt });

    expect(decision).toMatchObject({ admitted: true, asModerator: true });
  });

  it('un message sans auteur identifiable (participant anonyme) n\'appartient à personne : le simple membre est refusé', async () => {
    const prisma = buildPrisma({ role: 'USER' });

    const decision = await admit({ prisma, editorUserId: OTHER, authorUserId: null });

    expect(decision).toEqual({ admitted: false, reason: 'not-author' });
  });

  it('…mais le modérateur le modère — c\'est le cas de modération par excellence, et la route conversation l\'admettait déjà', async () => {
    const prisma = buildPrisma({ role: 'BIGBOSS', member: true });

    const decision = await admit({ prisma, editorUserId: OTHER, authorUserId: null });

    expect(decision).toMatchObject({ admitted: true, asModerator: true });
  });
});

describe('admitMessageEdit — la panne refuse', () => {
  beforeEach(() => jest.clearAllMocks());

  it('un rôle illisible ne devient pas un privilège', async () => {
    const onError = jest.fn();
    const prisma = buildPrisma({ userThrows: true });

    const decision = await admit({ prisma, editorUserId: AUTHOR, createdAt: staleCreatedAt, onError });

    expect(decision).toEqual({ admitted: false, reason: 'edit-window-expired' });
    expect(onError).toHaveBeenCalled();
  });

  it('une appartenance illisible ne devient pas une appartenance', async () => {
    const onError = jest.fn();
    const prisma = buildPrisma({ role: 'ADMIN', participantThrows: true });

    const decision = await admit({ prisma, editorUserId: OTHER, onError });

    expect(decision).toEqual({ admitted: false, reason: 'not-a-member' });
    expect(onError).toHaveBeenCalled();
  });

  it('un auteur introuvable, ou sans rôle, ne franchit pas sa fenêtre', async () => {
    const absent = { user: { findUnique: jest.fn<any>(async () => null) }, participant: { findFirst: jest.fn<any>() } };
    const roleless = { user: { findUnique: jest.fn<any>(async () => ({ role: null })) }, participant: { findFirst: jest.fn<any>() } };

    await expect(admit({ prisma: absent as never, editorUserId: AUTHOR, createdAt: staleCreatedAt }))
      .resolves.toEqual({ admitted: false, reason: 'edit-window-expired' });
    await expect(admit({ prisma: roleless as never, editorUserId: AUTHOR, createdAt: staleCreatedAt }))
      .resolves.toEqual({ admitted: false, reason: 'edit-window-expired' });
  });

  it('une appartenance sans rôle lisible n\'est pas un privilège', async () => {
    const prisma = {
      user: { findUnique: jest.fn<any>() },
      participant: { findFirst: jest.fn<any>(async () => ({ id: 'part-1', user: null })) },
    };

    const decision = await admit({ prisma: prisma as never, editorUserId: OTHER });

    expect(decision).toEqual({ admitted: false, reason: 'not-author' });
  });
});
