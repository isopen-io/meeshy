/**
 * Un modérateur ne classe pas un signalement qui vise son propre contenu (#10458) :
 * l'auteur du contenu signalé se résout à UN endroit, pour toutes les routes qui
 * écrivent sur un signalement.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

import { reportedContentAuthorId, reportTargetsActor } from '../reportedContentAuthor';

const ME = '507f1f77bcf86cd799439032';
const OTHER = '507f1f77bcf86cd799439031';
const ENTITY = '507f1f77bcf86cd799439011';

const prismaWith = (rows: { post?: unknown; comment?: unknown; message?: unknown; sound?: unknown }) =>
  ({
    post: { findUnique: jest.fn<any>().mockResolvedValue(rows.post ?? null) },
    postComment: { findUnique: jest.fn<any>().mockResolvedValue(rows.comment ?? null) },
    message: { findUnique: jest.fn<any>().mockResolvedValue(rows.message ?? null) },
    sound: { findUnique: jest.fn<any>().mockResolvedValue(rows.sound ?? null) },
  }) as any;

describe("reportedContentAuthorId — qui a écrit ce qu'on a signalé", () => {
  it("un signalement de compte vise ce compte lui-même", async () => {
    expect(await reportedContentAuthorId(prismaWith({}), { reportedType: 'user', reportedEntityId: ME })).toBe(ME);
  });

  it.each(['post', 'story', 'reel', 'status'])("une publication (%s) : l'auteur de la ligne Post, même retirée", async (type) => {
    const prisma = prismaWith({ post: { authorId: ME } });
    expect(await reportedContentAuthorId(prisma, { reportedType: type, reportedEntityId: ENTITY })).toBe(ME);
    expect(prisma.post.findUnique.mock.calls[0]?.[0]).toEqual({ where: { id: ENTITY }, select: { authorId: true } });
  });

  it("un commentaire : son auteur ; un message : son expéditeur ; un son : qui l'a déposé", async () => {
    const prisma = prismaWith({ comment: { authorId: ME }, message: { senderId: OTHER }, sound: { uploaderId: ME } });
    expect(await reportedContentAuthorId(prisma, { reportedType: 'comment', reportedEntityId: ENTITY })).toBe(ME);
    expect(await reportedContentAuthorId(prisma, { reportedType: 'message', reportedEntityId: ENTITY })).toBe(OTHER);
    expect(await reportedContentAuthorId(prisma, { reportedType: 'sound', reportedEntityId: ENTITY })).toBe(ME);
  });

  it("une conversation, une communauté ou un type inconnu n'ont pas d'auteur unique ; une ligne disparue non plus", async () => {
    const prisma = prismaWith({});
    expect(await reportedContentAuthorId(prisma, { reportedType: 'conversation', reportedEntityId: ENTITY })).toBeNull();
    expect(await reportedContentAuthorId(prisma, { reportedType: 'community', reportedEntityId: ENTITY })).toBeNull();
    expect(await reportedContentAuthorId(prisma, { reportedType: 'post', reportedEntityId: ENTITY })).toBeNull();
    expect(prisma.post.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe("reportTargetsActor — le signalement vise-t-il l'acteur ?", () => {
  it("vrai quand l'auteur du contenu est l'acteur, faux sinon ou sans auteur", async () => {
    expect(await reportTargetsActor(prismaWith({ post: { authorId: ME } }), { reportedType: 'post', reportedEntityId: ENTITY }, ME)).toBe(true);
    expect(await reportTargetsActor(prismaWith({ post: { authorId: OTHER } }), { reportedType: 'post', reportedEntityId: ENTITY }, ME)).toBe(false);
    expect(await reportTargetsActor(prismaWith({}), { reportedType: 'community', reportedEntityId: ENTITY }, ME)).toBe(false);
  });
});
